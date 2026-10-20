/** Local, conservative assistance. No image pixels leave the browser. */
const uncertain = (message, matches = 0, confidence = 0) => ({
  reliable: false, verticalPercent: 0, confidence, matches, message,
});

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// Minimum eigenvalue of a small gradient structure matrix: edges alone are
// ambiguous, so only corners with detail in both directions become candidates.
function features(gray, width, height) {
  const response = new Float32Array(width * height);
  let peak = 0;
  for (let y = 6; y < height - 6; y++) {
    for (let x = 6; x < width - 6; x++) {
      let xx = 0; let yy = 0; let xy = 0;
      for (let v = -1; v <= 1; v++) {
        for (let u = -1; u <= 1; u++) {
          const p = (y + v) * width + x + u;
          const gx = gray[p + 1] - gray[p - 1];
          const gy = gray[p + width] - gray[p - width];
          xx += gx * gx; yy += gy * gy; xy += gx * gy;
        }
      }
      const value = (xx + yy - Math.hypot(xx - yy, 2 * xy)) / 2;
      response[y * width + x] = value;
      peak = Math.max(peak, value);
    }
  }
  if (peak < 100) return [];
  const candidates = [];
  for (let y = 6; y < height - 6; y++) {
    for (let x = 6; x < width - 6; x++) {
      const score = response[y * width + x];
      if (score < Math.max(100, peak * 0.012)) continue;
      let maximum = true;
      for (let v = -1; v <= 1 && maximum; v++) {
        for (let u = -1; u <= 1; u++) {
          if (response[(y + v) * width + x + u] > score) { maximum = false; break; }
        }
      }
      if (maximum) candidates.push({ x, y, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const selected = [];
  for (const candidate of candidates) {
    if (selected.some((p) => Math.hypot(p.x - candidate.x, p.y - candidate.y) < 6)) continue;
    const patch = new Float32Array(81);
    let sum = 0; let k = 0;
    for (let v = -4; v <= 4; v++) {
      for (let u = -4; u <= 4; u++) {
        patch[k] = gray[(candidate.y + v) * width + candidate.x + u];
        sum += patch[k++];
      }
    }
    const mean = sum / patch.length;
    let norm = 0;
    for (let i = 0; i < patch.length; i++) { patch[i] -= mean; norm += patch[i] ** 2; }
    if (norm < 81 * 25) continue;
    norm = Math.sqrt(norm);
    for (let i = 0; i < patch.length; i++) patch[i] /= norm;
    selected.push({ ...candidate, patch });
    if (selected.length === 180) break;
  }
  return selected;
}

/**
 * Estimate a shared vertical translation only, allowing unrelated horizontal
 * disparities. Inputs are grayscale thumbnails of equal dimensions, <=256².
 * Positive correction raises L and lowers R by half the returned percentage
 * of the displayed image height. Nothing is applied automatically.
 */
export function estimateVerticalAlignment(grayLeft, grayRight, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 48 || height < 32
    || width > 256 || height > 256 || grayLeft.length !== width * height || grayRight.length !== width * height) {
    return uncertain('La miniatura no tiene dimensiones adecuadas para el análisis.');
  }
  const left = features(grayLeft, width, height);
  const right = features(grayRight, width, height);
  if (left.length < 10 || right.length < 10) return uncertain('No hay suficiente detalle local para una sugerencia fiable.');
  const maxVertical = Math.min(24, Math.max(4, Math.floor(height * 0.12)));
  const maxHorizontal = Math.max(48, width * 0.45);
  const scores = left.map((a) => right.map((b) => {
    if (Math.abs(a.y - b.y) > maxVertical || Math.abs(a.x - b.x) > maxHorizontal) return -1;
    let score = 0;
    for (let i = 0; i < a.patch.length; i++) score += a.patch[i] * b.patch[i];
    return score;
  }));
  function choose(values) {
    let best = -1; let second = -1; let index = -1;
    values.forEach((value, i) => {
      if (value > best) { second = best; best = value; index = i; }
      else if (value > second) second = value;
    });
    return best >= 0.9 && best - second >= 0.07 ? index : -1;
  }
  const forward = scores.map(choose);
  const reverse = right.map((_, i) => choose(scores.map((row) => row[i])));
  const matches = [];
  forward.forEach((j, i) => {
    if (j >= 0 && reverse[j] === i) matches.push({ x: left[i].x, y: left[i].y, dy: left[i].y - right[j].y });
  });
  if (matches.length < 8) return uncertain('Pocas coincidencias únicas: puede haber textura repetida, desenfoque u oclusiones.', matches.length);

  // Consensus before averaging prevents a different depth, occlusion or a
  // repeated structure from silently becoming a vertical calibration.
  let inliers = [];
  for (const match of matches) {
    const group = matches.filter((p) => Math.abs(p.dy - match.dy) <= 1.25);
    if (group.length > inliers.length) inliers = group;
  }
  const correction = median(inliers.map((p) => p.dy));
  const agreement = inliers.length / matches.length;
  const residual = median(inliers.map((p) => Math.abs(p.dy - correction)));
  const rangeX = Math.max(...inliers.map((p) => p.x)) - Math.min(...inliers.map((p) => p.x));
  const rangeY = Math.max(...inliers.map((p) => p.y)) - Math.min(...inliers.map((p) => p.y));
  const coverage = Math.min(1, rangeX / (width * 0.4), rangeY / (height * 0.4));
  const confidence = Math.min(0.99, agreement * Math.min(1, inliers.length / 18) * coverage);
  if (inliers.length < 8 || agreement < 0.7 || residual > 0.75 || coverage < 0.5 || confidence < 0.55) {
    return uncertain('Las coincidencias no concuerdan suficientemente. Ajusta la altura manualmente.', matches.length, confidence);
  }
  return {
    reliable: true,
    verticalPercent: correction / height * 100,
    confidence,
    matches: inliers.length,
    message: Math.abs(correction) < 0.5
      ? 'Las coincidencias no muestran un desnivel vertical apreciable.'
      : `Corrección vertical sugerida con ${inliers.length} coincidencias locales. Revisa la vista previa.`,
  };
}

function abortError() { return new DOMException('Análisis cancelado.', 'AbortError'); }

function grayscale(context, width, height) {
  const pixels = context.getImageData(0, 0, width, height).data;
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) gray[i] = Math.round(pixels[i * 4] * 0.299 + pixels[i * 4 + 1] * 0.587 + pixels[i * 4 + 2] * 0.114);
  return gray;
}

/** Optional local analysis; a worker keeps image matching off the UI thread. */
export async function analyzeAlignment(image, { signal } = {}) {
  if (signal?.aborted) throw abortError();
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const halfWidth = Math.floor(sourceWidth / 2);
  if (!halfWidth || !sourceHeight) return uncertain('Primero carga una imagen SBS válida.');
  const factor = Math.min(1, 256 / halfWidth, 256 / sourceHeight);
  const width = Math.floor(halfWidth * factor);
  const height = Math.floor(sourceHeight * factor);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return uncertain('Este navegador no permite analizar la imagen localmente.');
  let grayLeft; let grayRight;
  try {
    context.drawImage(image, 0, 0, halfWidth, sourceHeight, 0, 0, width, height);
    grayLeft = grayscale(context, width, height);
    context.clearRect(0, 0, width, height);
    context.drawImage(image, sourceWidth - halfWidth, 0, halfWidth, sourceHeight, 0, 0, width, height);
    grayRight = grayscale(context, width, height);
  } catch {
    return uncertain('No se pudo leer la imagen para analizarla. Usa un archivo local.');
  } finally { canvas.width = 0; canvas.height = 0; }
  if (signal?.aborted) throw abortError();
  if (typeof Worker !== 'undefined') {
    try {
      return await new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./alignmentWorker.js', import.meta.url), { type: 'module' });
        let timeout;
        function cleanup() { clearTimeout(timeout); worker.terminate(); signal?.removeEventListener('abort', cancel); }
        function cancel() { cleanup(); reject(abortError()); }
        worker.onmessage = ({ data }) => { cleanup(); resolve(data); };
        worker.onerror = () => { cleanup(); reject(new Error('Worker no disponible.')); };
        signal?.addEventListener('abort', cancel, { once: true });
        timeout = setTimeout(() => { cleanup(); reject(new Error('El análisis excedió el tiempo disponible.')); }, 8000);
        worker.postMessage({ grayLeft, grayRight, width, height });
      });
    } catch (error) { if (error.name === 'AbortError') throw error; }
  }
  // Compatibility path: bounded thumbnails and feature count cap computation.
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (signal?.aborted) throw abortError();
  return estimateVerticalAlignment(grayLeft, grayRight, width, height);
}

/** Dimensions alone cannot prove anamorphic compression or eye order. */
export function suggestFormat(width, height, name = '', explicitFormat) {
  if (explicitFormat === 'full' || explicitFormat === 'half') {
    return { format: explicitFormat, confidence: 1, ambiguous: false, message: 'Se conserva el formato confirmado para esta imagen.' };
  }
  const filename = String(name).toLowerCase();
  const half = /(?:^|[^a-z])(?:half[\s_.-]*sbs|hsbs)(?:[^a-z]|$)/i.test(filename);
  const full = /(?:^|[^a-z])(?:full[\s_.-]*sbs|fsbs)(?:[^a-z]|$)/i.test(filename);
  if (half !== full) return {
    format: half ? 'half' : 'full', confidence: 0.75, ambiguous: false,
    message: `El nombre sugiere ${half ? 'Half' : 'Full'}-SBS; confirma mirando ambas vistas.`,
  };
  const valid = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
  return {
    format: null, confidence: 0, ambiguous: true,
    message: valid
      ? 'Las dimensiones no identifican la compresión SBS. Compara Full y Half y elige la proporción natural.'
      : 'Carga una imagen para comparar las opciones de formato.',
  };
}
