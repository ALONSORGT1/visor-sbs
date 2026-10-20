import { createStereoViewer, calculateImageLayout } from './viewer.js';
import { DEFAULT_CONFIG } from './settings.js';
import { createCalibrationGUI } from './controls.js';
import { loadSbsImage } from './fileLoader.js';
import { createImmersiveMode, showToast } from './ui.js';
import { createCalibrationStore, exportCalibration, parseCalibrationJSON, validateCalibration } from './calibration.js';
import { analyzeAlignment, suggestFormat } from './assistance.js';

const el = id => document.getElementById(id);
const config = { ...DEFAULT_CONFIG };
const store = createCalibrationStore();
const preferences = store.loadPreferences();
const stage = el('viewerStage');
const configSignature = value => JSON.stringify(Object.keys(DEFAULT_CONFIG).map(key => value[key]));

function feedback(message, kind = 'info') {
  el('feedbackBanner').textContent = message;
  el('feedbackBanner').dataset.kind = kind;
}
function emptyMessage(title, message) {
  el('emptyState').hidden = false;
  el('emptyState').querySelector('strong').textContent = title;
  el('emptyState').querySelector('span').textContent = message;
}

function initialize() {
  let viewer;
  try {
    viewer = createStereoViewer(stage, config, { onStatus: feedback });
    viewer.setQuality(preferences.quality);
  } catch {
    emptyMessage('WebGL no está disponible', 'Prueba otro navegador con aceleración gráfica. Tus archivos permanecen en el dispositivo.');
    feedback('No se pudo iniciar el visor gráfico. Revisa la compatibilidad WebGL del navegador.', 'error');
    el('imageStatus').textContent = 'Visor no disponible';
    document.querySelectorAll('main button, main select').forEach(button => { button.disabled = true; });
    return;
  }

  let current = null;
  let busy = false;
  let loadController = null;
  let analysisController = null;
  let analysisPending = false;
  let proposal = null;
  let undoConfig = null;
  let disposed = false;
  let importRequest = 0;
  const downloads = new Map();
  const calibration = createCalibrationGUI(el('guiHost'), config, onManualChange);
  const immersive = createImmersiveMode(() => viewer.resize());
  el('qualitySelect').value = preferences.quality;

  function updateAvailable() {
    const ready = Boolean(current) && !busy;
    for (const id of ['cardboardBtn', 'fitBtn', 'resetBtn', 'exportBtn', 'importBtn', 'fullFormatBtn', 'halfFormatBtn']) el(id).disabled = !ready;
    el('confirmSaveBtn').disabled = !ready || Boolean(proposal);
    el('analyzeBtn').disabled = !ready || analysisPending || Boolean(proposal);
    el('undoBtn').disabled = !ready || !undoConfig || Boolean(proposal);
    el('applyProposalBtn').disabled = !ready;
    el('discardProposalBtn').disabled = !ready;
    calibration.setEnabled(ready);
    el('qualitySelect').disabled = busy;
    stage.setAttribute('aria-busy', String(busy));
    el('analyzeBtn').textContent = analysisPending ? 'Analizando…' : 'Analizar alineación';
    el('fullFormatBtn').setAttribute('aria-pressed', String(config.format === 'full'));
    el('halfFormatBtn').setAttribute('aria-pressed', String(config.format === 'half'));
    el('calibrationState').textContent = busy ? 'Preparando imagen…' : !current ? 'Sin fotografía' : proposal
      ? 'Vista previa pendiente de confirmar'
      : current.savedSignature === configSignature(config) ? (current.sessionOnly ? 'Confirmada sólo en esta sesión' : 'Calibración guardada para esta imagen')
        : 'Cambios sin guardar · confirma cuando el resultado te resulte adecuado';
  }

  function drawPreviews() {
    if (!current) return;
    const source = current.image;
    const eyeWidth = source.width / 2;
    for (const [id, factor] of [['fullPreview', 1], ['halfPreview', 2]]) {
      const canvas = el(id), context = canvas.getContext('2d');
      context.fillStyle = '#060d19';
      context.fillRect(0, 0, canvas.width, canvas.height);
      const aspect = eyeWidth / source.height * factor;
      const height = Math.min(canvas.height, canvas.width / aspect);
      const width = height * aspect;
      context.drawImage(source, config.swap ? eyeWidth : 0, 0, eyeWidth, source.height,
        (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    }
  }

  function abortAnalysis() {
    analysisController?.abort();
    analysisController = null;
    analysisPending = false;
  }

  function discardProposal(restore = true) {
    if (proposal && restore) Object.assign(config, proposal.before);
    proposal = null;
    el('proposalPanel').hidden = true;
  }

  function updateConfig() {
    calibration.refresh();
    viewer.update();
    drawPreviews();
    updateAvailable();
  }

  function onManualChange(key) {
    importRequest++;
    abortAnalysis();
    undoConfig = null;
    if (proposal) el('proposalMessage').textContent = `${proposal.message} La vista previa incluye tus cambios manuales.`;
    viewer.update();
    if (key === 'swap' || key === 'format') drawPreviews();
    updateAvailable();
  }

  function presentProposal(candidate, message) {
    const validated = validateCalibration(candidate);
    discardProposal(true);
    proposal = { before: { ...config }, message };
    Object.assign(config, validated);
    el('proposalMessage').textContent = message;
    el('proposalPanel').hidden = false;
    updateConfig();
    feedback('La propuesta se muestra como vista previa. Puedes ajustarla, aplicarla o descartarla.');
  }

  async function displaySource(source, demoIndex = -1, { keepCalibration = false } = {}) {
    importRequest++;
    loadController?.abort();
    abortAnalysis();
    discardProposal(true);
    updateConfig();
    const controller = new AbortController();
    loadController = controller;
    busy = true;
    undoConfig = null;
    updateAvailable();
    el('imageStatus').textContent = 'Preparando fotografía…';
    feedback('Leyendo y preparando la imagen en este dispositivo…');
    let prepared;
    try {
      prepared = await loadSbsImage(source, { signal: controller.signal, quality: preferences.quality, maxTextureSize: viewer.getMaxTextureSize() });
      if (disposed || controller !== loadController || controller.signal.aborted) {
        prepared.image.width = 1; prepared.image.height = 1; return;
      }
      const previousConfig = { ...config };
      const stored = store.load(prepared.id);
      const sameImage = keepCalibration && current?.id === prepared.id;
      const hint = suggestFormat(prepared.width, prepared.height, prepared.name, demoIndex >= 0 ? 'full' : undefined);
      const nextConfig = sameImage ? previousConfig : stored || { ...DEFAULT_CONFIG };
      // Sólo las demos tienen formato explícito conocido. Las pistas de nombre se muestran para confirmar.
      if (!stored && !sameImage && demoIndex >= 0) nextConfig.format = 'full';
      Object.assign(config, nextConfig);
      try { viewer.setImage(prepared.image, prepared.name); }
      catch (error) { Object.assign(config, previousConfig); throw error; }
      const previous = current;
      current = { ...prepared, source, demoIndex,
        savedSignature: sameImage ? previous.savedSignature : stored ? configSignature(stored) : '',
        sessionOnly: sameImage ? previous.sessionOnly : false };
      calibration.refresh();
      el('emptyState').hidden = true;
      el('imageStatus').textContent = prepared.name;
      el('imageDimensions').textContent = `${prepared.width} × ${prepared.height} px`;
      ['demoOneBtn', 'demoTwoBtn'].forEach((id, index) => el(id).classList.toggle('active', index === demoIndex));
      el('formatSuggestion').textContent = hint.message;
      el('formatHelp').open = !stored && !sameImage && demoIndex < 0;
      const notes = [demoIndex >= 0 ? 'Demostración técnica sintética; no sustituye tu fotografía propia.' : 'Fotografía procesada localmente.'];
      if (stored && !sameImage) notes.push('Calibración confirmada recuperada automáticamente.');
      if (prepared.reduced) notes.push(`Copia de visualización: ${prepared.preparedWidth} × ${prepared.preparedHeight} px.`);
      if (prepared.omittedCenterColumn) notes.push('Ancho impar: se omitió la columna central para separar las vistas sin mezclarlas.');
      if (store.getWarning()) notes.push(store.getWarning());
      feedback(notes.join(' '));
      drawPreviews();
    } catch (error) {
      if (controller !== loadController || error.name === 'AbortError' || disposed) return;
      if (prepared?.image && prepared.image !== current?.image) { prepared.image.width = 1; prepared.image.height = 1; }
      el('imageStatus').textContent = current?.name || 'Sin imagen';
      feedback(error.message || 'No se pudo cargar la imagen.', 'error');
      showToast(error.message || 'No se pudo cargar la imagen.');
      if (!current) emptyMessage('Carga una imagen SBS para empezar', 'Puedes seleccionar un JPG, PNG, WebP o AVIF desde tu dispositivo o volver a intentar una demostración.');
    } finally {
      if (controller === loadController && !disposed) { busy = false; updateAvailable(); }
    }
  }

  el('loadImageBtn').addEventListener('click', () => el('fileInput').click());
  el('fileInput').addEventListener('change', () => {
    const file = el('fileInput').files?.[0];
    if (file) displaySource(file);
    el('fileInput').value = '';
  });
  el('demoOneBtn').addEventListener('click', () => displaySource('./assets/images/demo-sbs-1.jpg', 0));
  el('demoTwoBtn').addEventListener('click', () => displaySource('./assets/images/demo-sbs-2.jpg', 1));
  el('fullFormatBtn').addEventListener('click', () => { config.format = 'full'; onManualChange('format'); calibration.refresh(); });
  el('halfFormatBtn').addEventListener('click', () => { config.format = 'half'; onManualChange('format'); calibration.refresh(); });

  el('qualitySelect').addEventListener('change', () => {
    if (busy) { el('qualitySelect').value = preferences.quality; return; }
    preferences.quality = el('qualitySelect').value;
    const stored = store.savePreferences(preferences);
    viewer.setQuality(preferences.quality);
    if (current) displaySource(current.source, current.demoIndex, { keepCalibration: true });
    else if (busy) { loadController?.abort(); busy = false; updateAvailable(); feedback('Calidad seleccionada. Vuelve a cargar una imagen.'); }
    if (!stored) showToast('La calidad se aplicó durante esta sesión; no se pudo guardar la preferencia.');
  });

  el('confirmSaveBtn').addEventListener('click', () => {
    if (!current || busy || proposal) return;
    const result = store.save(current, config);
    current.savedSignature = configSignature(config);
    current.sessionOnly = !result.persisted;
    feedback(result.message, result.persisted ? 'success' : 'warning');
    updateAvailable();
  });
  el('resetBtn').addEventListener('click', () => {
    importRequest++;
    abortAnalysis(); discardProposal(false); undoConfig = null;
    Object.assign(config, DEFAULT_CONFIG); updateConfig();
    feedback('Valores neutrales restablecidos. Usa Guardar para esta foto si quieres conservar este reinicio.');
  });
  el('fitBtn').addEventListener('click', () => {
    importRequest++;
    abortAnalysis(); discardProposal(true); undoConfig = null;
    Object.assign(config, { scale: 100, panX: 0, panY: 0 }); updateConfig();
    feedback('Escala al 100 % y encuadre centrado.');
  });

  el('analyzeBtn').addEventListener('click', async () => {
    if (!current || busy || proposal) return;
    abortAnalysis();
    const controller = new AbortController();
    analysisController = controller; analysisPending = true;
    const imageId = current.id, signature = configSignature(config);
    updateAvailable(); feedback('Buscando correspondencias verticales en miniaturas locales…');
    try {
      const result = await analyzeAlignment(current.image, { signal: controller.signal });
      if (controller !== analysisController || current?.id !== imageId || controller.signal.aborted || configSignature(config) !== signature) return;
      if (!result.reliable) { feedback(result.message, 'warning'); return; }
      const vertical = result.verticalPercent * (config.swap ? -1 : 1);
      if (Math.abs(vertical) > 10) { feedback('El desnivel estimado supera el ajuste permitido. Revisa la fotografía en un editor estéreo.', 'warning'); return; }
      if (Math.abs(vertical - config.vertical) < 0.05) { feedback(`Alineación vertical coherente: ${result.matches} coincidencias. No se necesita una corrección adicional.`); return; }
      presentProposal({ ...config, vertical }, `${result.message} Corrección propuesta: ${vertical.toFixed(2)} % del alto; ${result.matches} coincidencias y ${(result.confidence * 100).toFixed(0)} % de consenso. No evalúa las lentes ni la comodidad de profundidad.`);
    } catch (error) {
      if (error.name !== 'AbortError' && controller === analysisController) feedback(error.message || 'No se pudo analizar esta imagen.', 'warning');
    } finally {
      if (controller === analysisController) { analysisController = null; analysisPending = false; updateAvailable(); }
    }
  });
  el('applyProposalBtn').addEventListener('click', () => {
    if (!proposal) return;
    undoConfig = proposal.before; discardProposal(false); updateConfig();
    feedback('Propuesta aplicada. Puedes deshacerla o guardarla para esta foto.');
  });
  el('discardProposalBtn').addEventListener('click', () => { discardProposal(true); updateConfig(); feedback('Propuesta descartada; se recuperaron los ajustes anteriores.'); });
  el('undoBtn').addEventListener('click', () => {
    if (!undoConfig) return;
    Object.assign(config, undoConfig); undoConfig = null; updateConfig(); feedback('Ajustes anteriores recuperados.');
  });

  el('exportBtn').addEventListener('click', () => {
    if (!current || proposal) { feedback('Confirma o descarta la vista previa antes de exportar.', 'warning'); return; }
    const payload = exportCalibration(current, config);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'calibracion-sbs.json'; document.body.append(link); link.click(); link.remove();
    const timer = setTimeout(() => { URL.revokeObjectURL(url); downloads.delete(url); }, 5000);
    downloads.set(url, timer);
    feedback('JSON exportado. Incluye parámetros y metadatos, sin los píxeles de la fotografía.');
  });
  el('importBtn').addEventListener('click', () => el('importInput').click());
  el('importInput').addEventListener('change', async () => {
    const requestId = ++importRequest;
    const file = el('importInput').files?.[0]; el('importInput').value = '';
    if (!file || !current || busy) return;
    const imageId = current.id, controller = loadController;
    try {
      if (file.size > 64 * 1024) throw new Error('El JSON supera el límite de 64 KB.');
      const text = await file.text();
      if (disposed || requestId !== importRequest || current?.id !== imageId || controller !== loadController || busy) return;
      const viewport = viewer.getViewportSize();
      const parsed = parseCalibrationJSON(text, {
        image: current, layout: viewer.getCurrentLayout(),
        layoutForCalibration: old => calculateImageLayout(old, current.image.width, current.image.height, viewport.width, viewport.height),
      });
      abortAnalysis();
      presentProposal(parsed.calibration, parsed.message);
    } catch (error) {
      if (disposed || requestId !== importRequest || current?.id !== imageId || controller !== loadController || busy) return;
      feedback(error.message || 'No se pudo importar la calibración.', 'error');
    }
  });

  stage.addEventListener('dragover', event => { event.preventDefault(); stage.classList.add('drag-over'); });
  stage.addEventListener('dragleave', () => stage.classList.remove('drag-over'));
  stage.addEventListener('drop', event => {
    event.preventDefault(); stage.classList.remove('drag-over');
    const file = event.dataTransfer?.files?.[0]; if (file) displaySource(file);
  });
  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    disposed = true; loadController?.abort(); abortAnalysis();
    immersive.dispose(); calibration.dispose(); viewer.dispose();
    for (const [url, timer] of downloads) { clearTimeout(timer); URL.revokeObjectURL(url); }
    downloads.clear(); current = null;
  });
  updateAvailable();
  displaySource('./assets/images/demo-sbs-1.jpg', 0);
}

initialize();
