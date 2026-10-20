import { DEFAULT_CONFIG, CONFIG_LIMITS, DEFAULT_PREFERENCES, QUALITY_PROFILES } from './settings.js';

const SCHEMA = 'stereolab.calibration';
const STORE_KEY = 'stereolab.calibrations.v2';
const PREFERENCES_KEY = 'stereolab.preferences.v1';
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function validateCalibration(value) {
  if (!isRecord(value)) throw new Error('La calibración debe ser un objeto JSON.');
  const keys = Object.keys(DEFAULT_CONFIG);
  if (Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))) {
    throw new Error('La calibración tiene campos desconocidos o incompletos.');
  }
  const result = {};
  for (const [key, [min, max]] of Object.entries(CONFIG_LIMITS)) {
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || value[key] < min || value[key] > max) {
      throw new Error(`El valor de ${key} debe estar entre ${min} y ${max}.`);
    }
    result[key] = value[key];
  }
  if (!['full', 'half'].includes(value.format) || typeof value.swap !== 'boolean') {
    throw new Error('El formato SBS o el intercambio L/R no son válidos.');
  }
  return { ...result, format: value.format, swap: value.swap };
}

function imageMetadata(image) {
  if (!isRecord(image) || typeof image.id !== 'string' || image.id.length > 160 || !image.id.length
    || typeof image.name !== 'string' || image.name.length > 512
    || !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height)
    || image.width < 4 || image.height < 2 || image.width > 100000 || image.height > 100000) {
    throw new Error('Los metadatos de la fotografía no son válidos.');
  }
  return { id: image.id, name: image.name, width: image.width, height: image.height };
}

export function exportCalibration(image, calibration) {
  return {
    schema: SCHEMA, version: 2, units: 'image-percent',
    image: imageMetadata(image), calibration: validateCalibration(calibration),
    createdAt: new Date().toISOString(),
    note: 'Sólo contiene parámetros. No incluye ni modifica los píxeles de la fotografía.',
  };
}

export function parseCalibrationJSON(text, { image, layout, layoutForCalibration } = {}) {
  if (typeof text !== 'string' || text.length > 64 * 1024) throw new Error('El JSON supera el límite de 64 KB.');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('El archivo no contiene JSON válido.'); }
  if (!isRecord(data)) throw new Error('El JSON de calibración no es válido.');
  if (data.schema === SCHEMA) {
    if (data.version !== 2 || data.units !== 'image-percent') throw new Error('Versión o unidades de calibración no compatibles.');
    const sourceImage = imageMetadata(data.image);
    return {
      calibration: validateCalibration(data.calibration), sourceImage,
      mismatch: Boolean(image && (sourceImage.id !== image.id || sourceImage.width !== image.width || sourceImage.height !== image.height)), legacy: false,
      message: image && (sourceImage.id !== image.id || sourceImage.width !== image.width || sourceImage.height !== image.height)
        ? 'Este JSON pertenece a otra imagen. Revisa la vista previa antes de aplicarlo a la actual.'
        : 'Configuración compatible. Revisa la vista previa y confirma su aplicación.',
    };
  }
  // Compatibilidad explícita con el exportador original, que guardaba píxeles CSS sin viewport.
  if (data.proyecto !== 'StereoLab / Three.js' || !isRecord(data.calibracion) || !isRecord(data.imagen)) {
    throw new Error('Este archivo no es una calibración de StereoLab compatible.');
  }
  const old = data.calibracion;
  const legacyLimits = { parallax: [-100, 100], scale: [40, 180], panX: [-160, 160], panY: [-120, 120], vertical: [-50, 50] };
  for (const [key, [min, max]] of Object.entries(legacyLimits)) {
    if (typeof old[key] !== 'number' || !Number.isFinite(old[key]) || old[key] < min || old[key] > max) {
      throw new Error(`El ajuste antiguo ${key} no es válido.`);
    }
  }
  const referenceLayout = typeof layoutForCalibration === 'function'
    ? layoutForCalibration({ ...DEFAULT_CONFIG, scale: old.scale, format: old.format, swap: old.swap }) : layout;
  if (!Number.isFinite(referenceLayout?.renderedWidth) || referenceLayout.renderedWidth <= 0
    || !Number.isFinite(referenceLayout?.renderedHeight) || referenceLayout.renderedHeight <= 0) {
    throw new Error('Carga una fotografía antes de convertir el JSON antiguo.');
  }
  const converted = {
    ...old, parallax: old.parallax / referenceLayout.renderedWidth * 100,
    panX: old.panX / referenceLayout.renderedWidth * 100, panY: old.panY / referenceLayout.renderedHeight * 100,
    vertical: old.vertical / referenceLayout.renderedHeight * 100,
  };
  return {
    calibration: validateCalibration(converted), sourceImage: data.imagen, legacy: true, mismatch: true,
    message: 'JSON antiguo en píxeles: conversión aproximada usando el tamaño ACTUAL. El archivo original no guardó el tamaño de pantalla. Revisa y ajusta antes de guardar.',
  };
}

export function createCalibrationStore(providedStorage) {
  let storage;
  let storageError = '';
  try { storage = providedStorage === undefined ? globalThis.localStorage : providedStorage; }
  catch { storageError = 'El navegador no permite almacenamiento local. Puedes exportar los ajustes como JSON.'; }
  if (!storage) storageError ||= 'El almacenamiento local no está disponible. Puedes usar JSON.';
  const memory = new Map();
  function readEntries() {
    if (!storage) return [];
    try {
      const raw = storage.getItem(STORE_KEY);
      if (!raw) return [];
      if (raw.length > 256 * 1024) throw new Error();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error();
      return parsed.slice(-60).flatMap(entry => {
        try {
          return [{ image: imageMetadata(entry.image), calibration: validateCalibration(entry.calibration), savedAt: String(entry.savedAt || '') }];
        } catch { return []; }
      });
    } catch {
      storageError = 'No se pudieron leer los ajustes locales. Puedes continuar y usar JSON.';
      return [];
    }
  }
  readEntries().forEach(entry => memory.set(entry.image.id, entry));
  return {
    getWarning() { return storageError; },
    load(id) { const entry = memory.get(id); return entry ? { ...entry.calibration } : null; },
    save(image, calibration) {
      const entry = { image: imageMetadata(image), calibration: validateCalibration(calibration), savedAt: new Date().toISOString() };
      memory.delete(image.id);
      memory.set(image.id, entry);
      while (memory.size > 60) memory.delete(memory.keys().next().value);
      try {
        if (!storage) throw new Error();
        storage.setItem(STORE_KEY, JSON.stringify([...memory.values()]));
        storageError = '';
        return { persisted: true, message: 'Calibración confirmada y guardada para esta imagen.' };
      } catch {
        storageError = 'Guardado sólo durante esta sesión. El almacenamiento está bloqueado o lleno; exporta el JSON para conservarlo.';
        return { persisted: false, message: storageError };
      }
    },
    loadPreferences() {
      try {
        const prefs = JSON.parse(storage?.getItem(PREFERENCES_KEY) || 'null');
        return Object.hasOwn(QUALITY_PROFILES, prefs?.quality) ? { quality: prefs.quality } : { ...DEFAULT_PREFERENCES };
      } catch { return { ...DEFAULT_PREFERENCES }; }
    },
    savePreferences(preferences) {
      if (!Object.hasOwn(QUALITY_PROFILES, preferences.quality)) return false;
      try { storage?.setItem(PREFERENCES_KEY, JSON.stringify({ quality: preferences.quality })); return Boolean(storage); }
      catch { return false; }
    },
  };
}
