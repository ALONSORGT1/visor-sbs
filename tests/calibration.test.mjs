import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCalibration, exportCalibration, parseCalibrationJSON, createCalibrationStore,
} from '../js/calibration.js';
import { DEFAULT_CONFIG, CONFIG_LIMITS } from '../js/settings.js';

const image = (id = 'sha256-photo-a') => ({ id, name: 'foto-sbs.png', width: 2400, height: 800 });
const custom = { ...DEFAULT_CONFIG, parallax: 3.5, scale: 125, vertical: -1.25, panX: 4, format: 'half', swap: true };

function memoryStorage() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('valida rangos inclusivos sin coaccionar tipos ni aceptar campos incompletos', () => {
  assert.deepEqual(validateCalibration(DEFAULT_CONFIG), DEFAULT_CONFIG);
  for (const [key, [min, max]] of Object.entries(CONFIG_LIMITS)) {
    for (const value of [min, max]) assert.equal(validateCalibration({ ...DEFAULT_CONFIG, [key]: value })[key], value);
    for (const value of [min - 0.01, max + 0.01, NaN, Infinity, '0', null]) {
      assert.throws(() => validateCalibration({ ...DEFAULT_CONFIG, [key]: value }), /valor|entre/i);
    }
  }
  for (const value of [null, [], 'config', {}, { ...DEFAULT_CONFIG, format: 'guess' }, { ...DEFAULT_CONFIG, swap: 1 }, { ...DEFAULT_CONFIG, unknown: 1 }]) {
    assert.throws(() => validateCalibration(value));
  }
});

test('rechaza claves de prototipo y herencia sin contaminar objetos globales', () => {
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const malicious = JSON.parse(JSON.stringify(DEFAULT_CONFIG).slice(0, -1) + `,"${key}":{"polluted":true}}`);
    assert.throws(() => validateCalibration(malicious), /campos/);
  }
  assert.throws(() => validateCalibration(Object.create(DEFAULT_CONFIG)), /incompletos/);
  const safe = validateCalibration(Object.assign(Object.create(null), DEFAULT_CONFIG));
  assert.deepEqual(safe, DEFAULT_CONFIG);
  assert.equal({}.polluted, undefined);
});

test('exporta e importa JSONv2 con metadatos y parámetros independientes de los píxeles', () => {
  const exported = exportCalibration(image(), custom);
  assert.equal(exported.schema, 'stereolab.calibration');
  assert.equal(exported.version, 2);
  assert.equal(exported.units, 'image-percent');
  assert.equal(Number.isFinite(Date.parse(exported.createdAt)), true);
  assert.deepEqual(Object.keys(exported.image).sort(), ['height', 'id', 'name', 'width']);
  const parsed = parseCalibrationJSON(JSON.stringify(exported), { image: image() });
  assert.deepEqual(parsed.calibration, custom);
  assert.deepEqual(parsed.sourceImage, image());
  assert.equal(parsed.mismatch, false);
  assert.equal(parsed.legacy, false);
  // Exportar no deja referencias mutables a la configuración del visor.
  exported.calibration.panX = 0;
  assert.equal(custom.panX, 4);
});

test('identifica el JSON de otra foto aunque ambas tengan el mismo nombre', () => {
  const exported = exportCalibration(image('sha256-photo-b'), custom);
  const parsed = parseCalibrationJSON(JSON.stringify(exported), { image: image('sha256-photo-a') });
  assert.equal(parsed.mismatch, true);
  assert.match(parsed.message, /otra imagen/);
  const inconsistentDimensions = exportCalibration(image(), custom);
  inconsistentDimensions.image.width = 3000;
  assert.equal(parseCalibrationJSON(JSON.stringify(inconsistentDimensions), { image: image() }).mismatch, true);
});

test('rechaza JSON corrupto, versiones incompatibles, metadatos inválidos y rangos alterados', () => {
  for (const text of ['', '{', 'null', '[]', 'x'.repeat(65537)]) {
    assert.throws(() => parseCalibrationJSON(text));
  }
  const exported = exportCalibration(image(), custom);
  for (const overrides of [
    { version: 3 }, { units: 'css-pixels' }, { image: { ...image(), width: 0 } },
    { image: { ...image(), id: '' } }, { calibration: { ...custom, scale: 10000 } },
    { calibration: { ...custom, quality: 'sharp' } },
  ]) {
    assert.throws(() => parseCalibrationJSON(JSON.stringify({ ...exported, ...overrides })));
  }
});

test('metadatos importados seleccionan campos sin propagar propiedades especiales', () => {
  const exported = exportCalibration(image(), custom);
  const dangerous = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"polluted":true}}');
  const text = JSON.stringify({ ...exported, image: { ...image(), ...dangerous } });
  const parsed = parseCalibrationJSON(text, { image: image() });
  assert.deepEqual(Object.keys(parsed.sourceImage).sort(), ['height', 'id', 'name', 'width']);
  assert.equal({}.polluted, undefined);
});

test('convierte el JSON original en píxeles con una advertencia y vista previa obligatoria', () => {
  const old = {
    proyecto: 'StereoLab / Three.js', imagen: { nombre: 'foto.png', ancho: 2400, alto: 800 },
    calibracion: { ...DEFAULT_CONFIG, scale: 120, parallax: 20, panX: 40, panY: 10, vertical: -4 },
  };
  const parsed = parseCalibrationJSON(JSON.stringify(old), { image: image(), layout: { renderedWidth: 1000, renderedHeight: 500 } });
  assert.deepEqual(parsed.calibration, { ...DEFAULT_CONFIG, scale: 120, parallax: 2, panX: 4, panY: 2, vertical: -0.8 });
  assert.equal(parsed.legacy, true);
  assert.equal(parsed.mismatch, true);
  assert.match(parsed.message, /aproximada|ACTUAL/);
  assert.throws(() => parseCalibrationJSON(JSON.stringify(old)), /Carga una fotografía/);
  for (const renderedWidth of [0, -1000, NaN, Infinity]) {
    assert.throws(() => parseCalibrationJSON(JSON.stringify(old), { layout: { renderedWidth, renderedHeight: 500 } }), /Carga una fotografía/);
  }
  const invalid = { ...old, calibracion: { ...old.calibracion, panX: 10000 } };
  assert.throws(() => parseCalibrationJSON(JSON.stringify(invalid), { layout: { renderedWidth: 1000, renderedHeight: 500 } }), /antiguo/);
});

test('la conversión legacy usa su escala y formato importados antes de convertir píxeles', () => {
  const old = {
    proyecto: 'StereoLab / Three.js', imagen: { nombre: 'foto.png', ancho: 2400, alto: 800 },
    calibracion: { ...DEFAULT_CONFIG, scale: 180, format: 'half', swap: true, parallax: 90, panX: 90, panY: 30, vertical: 15 },
  };
  let calls = 0;
  const parsed = parseCalibrationJSON(JSON.stringify(old), {
    image: image(),
    layout: { renderedWidth: 500, renderedHeight: 200 },
    layoutForCalibration(candidate) {
      calls++;
      assert.deepEqual(candidate, { ...DEFAULT_CONFIG, scale: 180, format: 'half', swap: true });
      return { renderedWidth: 900, renderedHeight: 300 };
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(parsed.calibration, {
    ...DEFAULT_CONFIG, scale: 180, format: 'half', swap: true, parallax: 10, panX: 10, panY: 10, vertical: 5,
  });
  assert.equal(parsed.legacy, true);
  assert.match(parsed.message, /aproximada/);
});

test('legacy conserva validación estricta de claves, formato y tipos después de añadir el callback', () => {
  const old = { proyecto: 'StereoLab / Three.js', imagen: { nombre: 'foto.png' }, calibracion: DEFAULT_CONFIG };
  const malformed = [
    { ...DEFAULT_CONFIG, format: 'guess' }, { ...DEFAULT_CONFIG, swap: 'false' },
    { ...DEFAULT_CONFIG, parallax: '0' }, { ...DEFAULT_CONFIG, quality: 'sharp' },
    JSON.parse(JSON.stringify(DEFAULT_CONFIG).slice(0, -1) + ',"__proto__":{"polluted":true}}'),
    { scale: 100, format: 'full', swap: false },
  ];
  for (const calibracion of malformed) {
    assert.throws(() => parseCalibrationJSON(JSON.stringify({ ...old, calibracion }), {
      layoutForCalibration: () => ({ renderedWidth: 900, renderedHeight: 300 }),
    }));
  }
  assert.equal({}.polluted, undefined);
});

test('conserva calibraciones por contenido y devuelve copias sin heredar la foto anterior', () => {
  const storage = memoryStorage();
  const store = createCalibrationStore(storage);
  assert.equal(store.load('new-photo'), null);
  assert.equal(store.save(image('photo-a'), custom).persisted, true);
  assert.equal(store.save(image('photo-b'), DEFAULT_CONFIG).persisted, true);
  assert.deepEqual(store.load('photo-a'), custom);
  assert.deepEqual(store.load('photo-b'), DEFAULT_CONFIG);
  const changedCopy = store.load('photo-a');
  changedCopy.panX = -50;
  assert.equal(store.load('photo-a').panX, 4);
  const restored = createCalibrationStore(storage);
  assert.deepEqual(restored.load('photo-a'), custom);
  assert.deepEqual(restored.load('photo-b'), DEFAULT_CONFIG);
  assert.equal(restored.getWarning(), '');
});

test('la retención de 60 fotografías conserva las más recientes', () => {
  const storage = memoryStorage();
  const store = createCalibrationStore(storage);
  for (let i = 0; i < 62; i++) store.save(image(`photo-${i}`), { ...DEFAULT_CONFIG, panX: i % 10 });
  assert.equal(store.load('photo-0'), null);
  assert.equal(store.load('photo-1'), null);
  assert.deepEqual(store.load('photo-61'), { ...DEFAULT_CONFIG, panX: 1 });
  assert.equal(createCalibrationStore(storage).load('photo-0'), null);
});

test('el almacenamiento corrupto o bloqueado degrada a sesión con un aviso recuperable', () => {
  const corrupt = memoryStorage();
  corrupt.values.set('stereolab.calibrations.v2', '{ no JSON');
  const recovering = createCalibrationStore(corrupt);
  assert.match(recovering.getWarning(), /leer/);
  assert.equal(recovering.save(image(), custom).persisted, true);
  assert.equal(recovering.getWarning(), '');
  for (const storage of [null, { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } }]) {
    const store = createCalibrationStore(storage);
    const saved = store.save(image(), custom);
    assert.equal(saved.persisted, false);
    assert.match(saved.message, /sesión/);
    assert.deepEqual(store.load(image().id), custom);
    assert.match(store.getWarning(), /bloqueado|lleno/);
  }
});

test('descarta entradas dañadas sin perder otras fotografías válidas', () => {
  const storage = memoryStorage();
  storage.values.set('stereolab.calibrations.v2', JSON.stringify([
    null, { image: image('valid'), calibration: custom },
    { image: image('invalid'), calibration: { ...DEFAULT_CONFIG, parallax: 900 } },
    { image: { ...image('invalid-metadata'), width: -1 }, calibration: DEFAULT_CONFIG },
  ]));
  const store = createCalibrationStore(storage);
  assert.deepEqual(store.load('valid'), custom);
  assert.equal(store.load('invalid'), null);
  assert.equal(store.load('invalid-metadata'), null);
});

test('separa preferencias generales de calibraciones y rechaza perfiles heredados', () => {
  const storage = memoryStorage();
  const store = createCalibrationStore(storage);
  store.save(image(), custom);
  assert.deepEqual(store.loadPreferences(), { quality: 'auto' });
  assert.equal(store.savePreferences({ quality: 'sharp', panX: 50 }), true);
  assert.deepEqual(createCalibrationStore(storage).loadPreferences(), { quality: 'sharp' });
  assert.deepEqual(store.load(image().id), custom);
  assert.equal(store.savePreferences({ quality: '__proto__' }), false);
  storage.values.set('stereolab.preferences.v1', 'not-json');
  assert.deepEqual(store.loadPreferences(), { quality: 'auto' });
});
