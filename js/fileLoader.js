import { MAX_FILE_BYTES, MAX_SOURCE_PIXELS, QUALITY_PROFILES } from './settings.js';

function abortIfNeeded(signal) { if (signal?.aborted) throw new DOMException('Carga cancelada.', 'AbortError'); }
const ascii = (bytes, offset, length) => String.fromCharCode(...bytes.subarray(offset, offset + length));
let preparationTail = Promise.resolve();

/** Lee dimensiones antes de decodificar: un archivo pequeño puede expandirse a cientos de MB. */
export function probeImageDimensions(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 33 && [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)
    && view.getUint32(8) === 13 && ascii(bytes, 12, 4) === 'IHDR') {
    return { width: view.getUint32(16), height: view.getUint32(20), type: 'image/png' };
  }
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216) {
    const frameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (frameMarkers.has(marker) && length >= 8) {
        return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3), type: 'image/jpeg' };
      }
      offset += length;
    }
  }
  if (bytes.length >= 30 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    const kind = ascii(bytes, 12, 4);
    if (kind === 'VP8X') {
      const u24 = at => bytes[at] + bytes[at + 1] * 256 + bytes[at + 2] * 65536;
      return { width: u24(24) + 1, height: u24(27) + 1, type: 'image/webp' };
    }
    if (kind === 'VP8 ' && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) {
      return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff, type: 'image/webp' };
    }
    if (kind === 'VP8L' && bytes[20] === 47) {
      return { width: 1 + bytes[21] + ((bytes[22] & 63) << 8), height: 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 15) << 10), type: 'image/webp' };
    }
  }
  if (bytes.length >= 32 && ascii(bytes, 4, 4) === 'ftyp' && /avif|avis/.test(ascii(bytes, 8, Math.min(56, bytes.length - 8)))) {
    let largest = null;
    for (let i = 4; i + 16 <= bytes.length; i++) {
      if (ascii(bytes, i, 4) !== 'ispe') continue;
      const size = view.getUint32(i - 4);
      if (size < 20 || i - 4 + size > bytes.length) continue;
      const width = view.getUint32(i + 8), height = view.getUint32(i + 12);
      if (!largest || width * height > largest.width * largest.height) largest = { width, height, type: 'image/avif' };
    }
    if (largest) return largest;
  }
  throw new Error('No se pudo leer una cabecera JPG, PNG, WebP o AVIF válida. Convierte el archivo a JPG o PNG si es necesario.');
}

export function validateDimensions(width, height, maxSourcePixels = MAX_SOURCE_PIXELS) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 4 || height < 2) {
    throw new Error('La imagen debe medir al menos 4 × 2 píxeles.');
  }
  if (width > 32768 || height > 32768 || width * height > maxSourcePixels) {
    throw new Error(`La imagen supera el límite de ${(maxSourcePixels / 1_000_000).toFixed(0)} MP de origen. Reduce su resolución antes de abrirla.`);
  }
}

export function planImageSize(width, height, { quality = 'auto', maxTextureSize = 4096 } = {}) {
  if (!Number.isFinite(maxTextureSize) || maxTextureSize < 2) throw new Error('El límite de textura GPU no es válido.');
  const profile = Object.hasOwn(QUALITY_PROFILES, quality) ? QUALITY_PROFILES[quality] : QUALITY_PROFILES.auto;
  const eyeWidth = Math.floor(width / 2);
  const usefulWidth = eyeWidth * 2;
  const limit = Math.max(2, Math.floor(Math.min(maxTextureSize, profile.maxDimension)));
  const ratio = Math.min(1, Math.sqrt(profile.pixels / (usefulWidth * height)), limit / usefulWidth, limit / height);
  const preparedWidth = Math.floor(usefulWidth * ratio / 2) * 2;
  if (preparedWidth < 2) throw new Error('La proporción de esta imagen es demasiado extrema para mostrar ambos ojos sin deformarla.');
  const preparedHeight = Math.max(1, Math.min(limit, Math.floor(profile.pixels / preparedWidth), Math.floor(height * (preparedWidth / usefulWidth))));
  return { width: preparedWidth, height: preparedHeight, eyeWidth, omittedCenterColumn: width % 2 === 1,
    reduced: preparedWidth < usefulWidth || preparedHeight < height };
}

export async function fingerprintBytes(bytes) {
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return `sha256-${Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('')}`;
  }
  const values = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let a = 2166136261, b = 0x9e3779b9;
  for (const value of values) { a = Math.imul(a ^ value, 16777619); b = Math.imul(b ^ value, 2246822519); b ^= b >>> 13; }
  return `content-${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}-${values.length}`;
}

async function decodeBlob(blob, signal) {
  abortIfNeeded(signal);
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      if (signal?.aborted) { bitmap.close(); abortIfNeeded(signal); }
      return bitmap;
    } catch (error) { if (error.name === 'AbortError') throw error; }
  }
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = 'async';
  try {
    await new Promise((resolve, reject) => {
      const cleanup = () => { image.onload = null; image.onerror = null; signal?.removeEventListener('abort', cancelled); };
      const cancelled = () => { cleanup(); image.src = ''; reject(new DOMException('Carga cancelada.', 'AbortError')); };
      image.onload = () => { cleanup(); resolve(); };
      image.onerror = () => { cleanup(); reject(new Error('El navegador no pudo decodificar esta imagen. Prueba JPG o PNG.')); };
      signal?.addEventListener('abort', cancelled, { once: true });
      image.src = url;
    });
    abortIfNeeded(signal);
    return image;
  } finally { URL.revokeObjectURL(url); }
}

/** Las fotos locales nunca se transmiten; las URL sólo sirven para las demos del mismo sitio. */
export async function loadSbsImage(source, options = {}) {
  const { signal, quality = 'auto', maxTextureSize = 4096 } = options;
  abortIfNeeded(signal);
  let blob, name;
  if (typeof source === 'string') {
    const url = new URL(source, document.baseURI);
    if (url.origin !== location.origin) throw new Error('Sólo se permiten demostraciones del mismo sitio.');
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error('La demostración no está disponible. Puedes cargar una imagen SBS desde tu dispositivo.');
    if (Number(response.headers.get('content-length')) > MAX_FILE_BYTES) throw new Error('La demostración es demasiado grande.');
    blob = await response.blob();
    name = decodeURIComponent(url.pathname.split('/').pop());
  } else {
    if (!(source instanceof Blob)) throw new Error('Selecciona una imagen JPG, PNG, WebP o AVIF.');
    blob = source;
    name = source.name || 'imagen-sbs';
    if (!/\.(jpe?g|png|webp|avif)$/i.test(name) && !['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(blob.type)) {
      throw new Error('Selecciona una imagen JPG, PNG, WebP o AVIF.');
    }
  }
  if (!blob.size || blob.size > MAX_FILE_BYTES) throw new Error('El archivo está vacío o supera el límite de 30 MiB.');
  const header = probeImageDimensions(await blob.slice(0, 2 * 1024 * 1024).arrayBuffer());
  validateDimensions(header.width, header.height);
  abortIfNeeded(signal);
  const id = await fingerprintBytes(await blob.arrayBuffer());
  abortIfNeeded(signal);
  // Los decodificadores nativos no siempre admiten cancelación. Serializar evita
  // acumular varias fotos grandes decodificadas al seleccionar archivos rápido.
  const precedingPreparation = preparationTail;
  let releasePreparation;
  preparationTail = new Promise(resolve => { releasePreparation = resolve; });
  await precedingPreparation;
  let decoded;
  let canvas;
  try {
    abortIfNeeded(signal);
    decoded = await decodeBlob(blob, signal);
    const width = decoded.naturalWidth || decoded.width, height = decoded.naturalHeight || decoded.height;
    validateDimensions(width, height);
    const plan = planImageSize(width, height, { quality, maxTextureSize });
    canvas = document.createElement('canvas');
    canvas.width = plan.width; canvas.height = plan.height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('No se pudo preparar la imagen en este dispositivo.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const targetEyeWidth = canvas.width / 2;
    ctx.drawImage(decoded, 0, 0, plan.eyeWidth, height, 0, 0, targetEyeWidth, canvas.height);
    ctx.drawImage(decoded, width - plan.eyeWidth, 0, plan.eyeWidth, height, targetEyeWidth, 0, targetEyeWidth, canvas.height);
    abortIfNeeded(signal);
    return { image: canvas, name, id, width, height, preparedWidth: canvas.width, preparedHeight: canvas.height,
      reduced: plan.reduced, omittedCenterColumn: plan.omittedCenterColumn, type: header.type };
  } catch (error) {
    if (canvas) { canvas.width = 1; canvas.height = 1; }
    throw error;
  } finally {
    try {
      decoded?.close?.();
      if (decoded instanceof HTMLImageElement) decoded.src = '';
    } finally { releasePreparation(); }
  }
}
