import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setImmediate as nextTurn } from 'node:timers/promises';
import {
  probeImageDimensions, validateDimensions, planImageSize, fingerprintBytes, loadSbsImage,
} from '../js/fileLoader.js';
import { MAX_FILE_BYTES, MAX_SOURCE_PIXELS, QUALITY_PROFILES } from '../js/settings.js';

function ascii(bytes, offset, text) {
  for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
}

function pngHeader(width = 2400, height = 800) {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  ascii(bytes, 12, 'IHDR');
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[24] = 8;
  bytes[25] = 2;
  return bytes;
}

function jpegHeader(width = 2400, height = 800, marker = 0xc0) {
  const bytes = new Uint8Array(29);
  bytes.set([255, 216, 255, 224, 0, 4, 0, 0, 255, marker, 0, 17, 8]);
  const view = new DataView(bytes.buffer);
  view.setUint16(13, height);
  view.setUint16(15, width);
  bytes[17] = 3;
  bytes.set([255, 217], 27);
  return bytes;
}

function webpHeader(width, height, kind) {
  const bytes = new Uint8Array(32);
  const view = new DataView(bytes.buffer);
  ascii(bytes, 0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  ascii(bytes, 8, 'WEBP');
  ascii(bytes, 12, kind);
  view.setUint32(16, 12, true);
  if (kind === 'VP8X') {
    for (let i = 0; i < 3; i++) {
      bytes[24 + i] = (width - 1) >>> (8 * i) & 255;
      bytes[27 + i] = (height - 1) >>> (8 * i) & 255;
    }
  } else if (kind === 'VP8 ') {
    bytes.set([157, 1, 42], 23);
    view.setUint16(26, width, true);
    view.setUint16(28, height, true);
  } else {
    bytes[20] = 47;
    bytes[21] = (width - 1) & 255;
    bytes[22] = ((width - 1) >>> 8) | (((height - 1) & 3) << 6);
    bytes[23] = ((height - 1) >>> 2) & 255;
    bytes[24] = ((height - 1) >>> 10) & 15;
  }
  return bytes;
}

function avifHeader(width = 2400, height = 800) {
  const bytes = new Uint8Array(44);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 24);
  ascii(bytes, 4, 'ftyp');
  ascii(bytes, 8, 'avif');
  ascii(bytes, 16, 'avif');
  ascii(bytes, 20, 'mif1');
  view.setUint32(24, 20);
  ascii(bytes, 28, 'ispe');
  view.setUint32(36, width);
  view.setUint32(40, height);
  return bytes;
}

function stubGlobals(t, entries) {
  for (const [key, value] of Object.entries(entries)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]);
  }
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('lee dimensiones PNG y JPEG baseline/progresivo sin decodificar', () => {
  assert.deepEqual(probeImageDimensions(pngHeader()), { width: 2400, height: 800, type: 'image/png' });
  for (const marker of [0xc0, 0xc2]) {
    assert.deepEqual(probeImageDimensions(jpegHeader(3210, 1234, marker)), { width: 3210, height: 1234, type: 'image/jpeg' });
  }
  // Un Uint8Array puede ser una vista, no empezar en el byte cero del buffer.
  const padded = new Uint8Array(40);
  padded.set(pngHeader(800, 600), 5);
  assert.equal(probeImageDimensions(padded.subarray(5, 38)).width, 800);
});

test('lee VP8X, VP8 y VP8L de WebP, además de ispe en AVIF', () => {
  for (const kind of ['VP8X', 'VP8 ', 'VP8L']) {
    assert.deepEqual(probeImageDimensions(webpHeader(3000, 1200, kind)), { width: 3000, height: 1200, type: 'image/webp' });
  }
  assert.deepEqual(probeImageDimensions(avifHeader(3840, 1080)), { width: 3840, height: 1080, type: 'image/avif' });
});

test('rechaza cabeceras truncadas, desconocidas y firmas PNG dañadas', () => {
  for (const bytes of [new Uint8Array(), new Uint8Array([255, 216]), new TextEncoder().encode('<svg/>'), pngHeader().subarray(0, 23)]) {
    assert.throws(() => probeImageDimensions(bytes), /cabecera/i);
  }
  const corruptSignature = pngHeader();
  corruptSignature[6] = 0;
  assert.throws(() => probeImageDimensions(corruptSignature), /cabecera/i);
  const corruptIHDR = pngHeader();
  new DataView(corruptIHDR.buffer).setUint32(8, 12);
  assert.throws(() => probeImageDimensions(corruptIHDR), /cabecera/i);
});

test('valida dimensiones de origen por píxeles y lados, no por tamaño comprimido', () => {
  assert.doesNotThrow(() => validateDimensions(10000, MAX_SOURCE_PIXELS / 10000));
  for (const [width, height] of [[4, 1], [3, 2], [NaN, 2], [4.5, 2], [40000, 2], [10000, 5000]]) {
    assert.throws(() => validateDimensions(width, height));
  }
  assert.throws(() => validateDimensions(1000, 1000, 999999), /límite/);
});

test('preflight bloquea dimensiones excesivas y formatos inválidos antes del decodificador', async t => {
  let decodes = 0;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
  Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: async () => { decodes++; throw new Error('No debe decodificar'); } });
  t.after(() => descriptor ? Object.defineProperty(globalThis, 'createImageBitmap', descriptor) : delete globalThis.createImageBitmap);
  for (const header of [pngHeader(20000, 20000), pngHeader(0, 600), new Uint8Array(40)]) {
    const blob = new Blob([header], { type: 'image/png' });
    await assert.rejects(loadSbsImage(blob), /límite|al menos|cabecera/);
  }
  assert.equal(decodes, 0);
  await assert.rejects(loadSbsImage(new Blob(['texto'], { type: 'text/plain' })), /Selecciona/);
  await assert.rejects(loadSbsImage(new Blob([], { type: 'image/png' })), /vacío/);
  class TooLargeBlob extends Blob { get size() { return MAX_FILE_BYTES + 1; } }
  await assert.rejects(loadSbsImage(new TooLargeBlob([pngHeader()], { type: 'image/png' })), /30 MiB/);
});

test('una carga cancelada se rechaza antes de leer o decodificar', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(loadSbsImage(new Blob([pngHeader()], { type: 'image/png' }), { signal: controller.signal }), { name: 'AbortError' });
});

test('la preparación omite la columna central impar y libera el bitmap decodificado', async t => {
  const calls = [];
  let closed = 0;
  const decoded = { width: 801, height: 300, close() { closed++; } };
  const context = { drawImage(...args) { calls.push(args); } };
  const canvas = { getContext: () => context };
  stubGlobals(t, {
    createImageBitmap: async () => decoded,
    document: { createElement: kind => { assert.equal(kind, 'canvas'); return canvas; } },
    HTMLImageElement: class {},
  });
  const result = await loadSbsImage(new Blob([pngHeader(801, 300)], { type: 'image/png' }));
  assert.equal(result.image, canvas);
  assert.equal(result.omittedCenterColumn, true);
  assert.equal(result.preparedWidth, 800);
  assert.equal(result.preparedHeight, 300);
  assert.deepEqual(calls.map(call => call.slice(1)), [
    [0, 0, 400, 300, 0, 0, 400, 300],
    [401, 0, 400, 300, 400, 0, 400, 300],
  ]);
  assert.equal(closed, 1);
});

test('una respuesta tardía del decodificador cancelado cierra su bitmap', async t => {
  let closed = 0;
  const controller = new AbortController();
  stubGlobals(t, {
    HTMLImageElement: class {},
    createImageBitmap: async () => {
      controller.abort();
      return { width: 2400, height: 800, close() { closed++; } };
    },
  });
  await assert.rejects(loadSbsImage(new Blob([pngHeader()], { type: 'image/png' }), { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(closed, 1);
});

test('dos cargas serializan el decoder nativo y la cancelación tardía libera el turno', { timeout: 5000 }, async t => {
  const pending = deferred(), firstEntered = deferred();
  const controller = new AbortController();
  const closed = [0, 0];
  let calls = 0;
  const bitmaps = closed.map((_, index) => ({ width: 2400, height: 800, close() { closed[index]++; } }));
  stubGlobals(t, {
    crypto: undefined,
    HTMLImageElement: class {},
    document: { createElement: () => ({ getContext: () => ({ drawImage() {} }) }) },
    createImageBitmap: async () => {
      calls++;
      if (calls === 1) { firstEntered.resolve(); return pending.promise; }
      return bitmaps[1];
    },
  });
  const first = loadSbsImage(new Blob([pngHeader()], { type: 'image/png' }), { signal: controller.signal });
  const rejectedFirst = assert.rejects(first, { name: 'AbortError' });
  await firstEntered.promise;
  const second = loadSbsImage(new Blob([pngHeader()], { type: 'image/png' }));
  try {
    await nextTurn();
    assert.equal(calls, 1, 'la segunda carga espera mientras el decoder nativo está pendiente');
    controller.abort();
    await nextTurn();
    assert.equal(calls, 1, 'cancelar no libera anticipadamente una decodificación nativa aún en curso');
  } finally {
    controller.abort();
    pending.resolve(bitmaps[0]);
    await Promise.allSettled([rejectedFirst, second]);
  }
  await rejectedFirst;
  const result = await second;
  assert.equal(calls, 2);
  assert.deepEqual(closed, [1, 1]);
  assert.equal(result.preparedWidth, 2400);
  assert.equal(result.preparedHeight, 800);
});

test('el fallo del primer decoder y de su fallback no bloquea la siguiente preparación', { timeout: 5000 }, async t => {
  const pending = deferred(), firstEntered = deferred();
  let calls = 0, closed = 0;
  class FailingImage {
    set src(value) { if (value) queueMicrotask(() => this.onerror?.()); }
  }
  stubGlobals(t, {
    crypto: undefined,
    HTMLImageElement: FailingImage,
    Image: FailingImage,
    document: { createElement: () => ({ getContext: () => ({ drawImage() {} }) }) },
    createImageBitmap: async () => {
      calls++;
      if (calls === 1) { firstEntered.resolve(); return pending.promise; }
      return { width: 2400, height: 800, close() { closed++; } };
    },
  });
  const first = loadSbsImage(new Blob([pngHeader()], { type: 'image/png' }));
  const rejectedFirst = assert.rejects(first, /no pudo decodificar/);
  await firstEntered.promise;
  const second = loadSbsImage(new Blob([pngHeader()], { type: 'image/png' }));
  try {
    await nextTurn();
    assert.equal(calls, 1);
  } finally {
    pending.reject(new Error('Fallo de decodificación nativa'));
    await Promise.allSettled([rejectedFirst, second]);
  }
  await rejectedFirst;
  const result = await second;
  assert.equal(calls, 2);
  assert.equal(closed, 1);
  assert.equal(result.preparedWidth, 2400);
});

test('un fallo al crear el contexto2D libera canvas y bitmap temporales', async t => {
  let closed = 0;
  const canvas = { width: 0, height: 0, getContext: () => null };
  stubGlobals(t, {
    createImageBitmap: async () => ({ width: 2400, height: 800, close() { closed++; } }),
    document: { createElement: () => canvas },
    HTMLImageElement: class {},
  });
  await assert.rejects(loadSbsImage(new Blob([pngHeader()], { type: 'image/png' })), /preparar/);
  assert.equal(closed, 1);
  assert.equal(canvas.width, 1);
  assert.equal(canvas.height, 1);
});

test('la preparación conserva paridad y aspecto sin ampliar imágenes pequeñas', () => {
  assert.deepEqual(planImageSize(801, 300), {
    width: 800, height: 300, eyeWidth: 400, omittedCenterColumn: true, reduced: false,
  });
  for (const quality of Object.keys(QUALITY_PROFILES)) {
    for (const [width, height] of [[8000, 4000], [10001, 3000], [1274, 3338], [1655, 1948], [4096, 2048]]) {
      const plan = planImageSize(width, height, { quality, maxTextureSize: 4096 });
      const usefulWidth = Math.floor(width / 2) * 2;
      assert.equal(plan.width % 2, 0);
      assert.ok(plan.width <= usefulWidth && plan.height <= height);
      assert.ok(plan.width <= 4096 && plan.height <= 4096);
      assert.ok(plan.width * plan.height <= QUALITY_PROFILES[quality].pixels, `${width}×${height}/${quality}: ${plan.width * plan.height}`);
      assert.ok(Math.abs(plan.height - height * plan.width / usefulWidth) <= 1);
    }
  }
});

test('se rechaza una proporción extrema que no cabe fielmente ni con ancho par mínimo', () => {
  assert.throws(() => planImageSize(4, 32768, { maxTextureSize: 4096 }));
});

test('se respeta el límite de la GPU aunque el perfil admita mayor resolución', () => {
  const plan = planImageSize(8000, 4000, { quality: 'sharp', maxTextureSize: 2048 });
  assert.equal(plan.width, 2048);
  assert.equal(plan.height, 1024);
  assert.equal(plan.reduced, true);
  for (const maxTextureSize of [NaN, Infinity, 0, -1]) {
    assert.throws(() => planImageSize(8000, 4000, { maxTextureSize }), /GPU/);
  }
  for (const quality of ['__proto__', 'constructor', 'unknown']) {
    assert.deepEqual(planImageSize(8000, 4000, { quality }), planImageSize(8000, 4000, { quality: 'auto' }));
  }
});

test('el hash depende de todos los bytes y usa SHA-256 cuando está disponible', async () => {
  const content = new TextEncoder().encode('SBS-content');
  const first = await fingerprintBytes(content);
  assert.equal(await fingerprintBytes(content.slice()), first);
  const changed = content.slice();
  changed[changed.length - 1] ^= 1;
  assert.notEqual(await fingerprintBytes(changed), first);
  if (globalThis.crypto?.subtle) {
    assert.equal(first, `sha256-${createHash('sha256').update(content).digest('hex')}`);
  }
});

test('el hash de respaldo diferencia contenido cuando WebCrypto no está disponible', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
  t.after(() => descriptor ? Object.defineProperty(globalThis, 'crypto', descriptor) : delete globalThis.crypto);
  const first = await fingerprintBytes(new Uint8Array([1, 2, 3]));
  assert.match(first, /^content-[0-9a-f]{16}-3$/);
  assert.equal(await fingerprintBytes(new Uint8Array([1, 2, 3])), first);
  assert.notEqual(await fingerprintBytes(new Uint8Array([1, 2, 4])), first);
});
