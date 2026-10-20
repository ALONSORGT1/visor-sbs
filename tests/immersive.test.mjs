import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/ui.js', import.meta.url), 'utf8');
const { createImmersiveMode, showToast } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

class Target {
  constructor() {
    this.listeners = new Map();
    this.classes = new Set();
    this.attributes = new Map();
    this.textContent = '';
    this.classList = {
      add: name => this.classes.add(name),
      remove: name => this.classes.delete(name),
      contains: name => this.classes.has(name),
      toggle: (name, force) => force ? this.classes.add(name) : this.classes.delete(name),
    };
  }
  addEventListener(name, handler) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(handler);
  }
  removeEventListener(name, handler) { this.listeners.get(name)?.delete(handler); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  emit(name, event = {}) {
    for (const handler of [...(this.listeners.get(name) || [])]) handler(event);
  }
  listenerCount() { return [...this.listeners.values()].reduce((sum, list) => sum + list.size, 0); }
}

async function flush() { for (let i = 0; i < 15; i++) await Promise.resolve(); }

function setup(t, { wake = false, native = true, delayedExit = false, orientationDelay = false } = {}) {
  const saved = new Map();
  const nodes = Object.fromEntries(['displayWrap', 'viewerStage', 'cardboardBtn', 'fullscreenBtn', 'toast'].map(id => [id, new Target()]));
  const doc = new Target();
  doc.body = new Target();
  doc.fullscreenElement = null;
  doc.visibilityState = 'visible';
  doc.getElementById = id => nodes[id];
  const win = new Target();
  const enterRequests = [];
  const exitRequests = [];
  const wakeRequests = [];
  const orientationRequests = [];
  const raf = new Map();
  let frame = 0;
  let exits = 0;
  let unlocks = 0;
  const nav = {};
  const orientation = {
    lock() {
      const pending = deferred();
      orientationRequests.push(pending);
      if (!orientationDelay) pending.resolve();
      return pending.promise;
    },
    unlock() { unlocks++; },
  };
  if (native) nodes.displayWrap.requestFullscreen = () => {
    const pending = deferred();
    enterRequests.push(pending);
    return pending.promise;
  };
  doc.exitFullscreen = () => {
    exits++;
    const pending = deferred();
    exitRequests.push(pending);
    if (!delayedExit) {
      doc.fullscreenElement = null;
      doc.emit('fullscreenchange');
      pending.resolve();
    }
    return pending.promise;
  };
  if (wake) nav.wakeLock = { request() {
    const pending = deferred();
    wakeRequests.push(pending);
    return pending.promise;
  } };
  const globals = {
    document: doc, window: win, navigator: nav, screen: { orientation },
    requestAnimationFrame: callback => { raf.set(++frame, callback); return frame; },
    cancelAnimationFrame: id => raf.delete(id),
  };
  for (const [key, value] of Object.entries(globals)) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  const states = [];
  const ui = createImmersiveMode(() => {}, { onStateChange: state => states.push(state) });
  // Las solicitudes pendientes se completan también al fallar una aserción.
  t.after(async () => {
    const done = ui.dispose();
    for (const item of enterRequests) item.reject(new Error('cleanup'));
    for (const item of exitRequests) {
      doc.fullscreenElement = null;
      item.resolve();
    }
    for (const item of wakeRequests) item.resolve(sentinel());
    for (const item of orientationRequests) item.resolve();
    await flush();
    await done;
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  function completeEnter(index = enterRequests.length - 1) {
    doc.fullscreenElement = nodes.displayWrap;
    doc.emit('fullscreenchange');
    enterRequests[index].resolve();
  }
  function completeExit(index = exitRequests.length - 1) {
    doc.fullscreenElement = null;
    doc.emit('fullscreenchange');
    exitRequests[index].resolve();
  }
  function visibility(value) { doc.visibilityState = value; doc.emit('visibilitychange'); }
  return { ui, doc, win, nodes, nav, enterRequests, exitRequests, wakeRequests, orientationRequests,
    completeEnter, completeExit, visibility, states, raf, exits: () => exits, unlocks: () => unlocks };
}

function sentinel() {
  const item = new Target();
  item.releases = 0;
  item.release = async () => { item.releases++; item.emit('release'); };
  return item;
}

function tap(stage, timeStamp, pointerType = 'touch', x = 10, y = 10, isPrimary = true) {
  stage.emit('pointerdown', { timeStamp, pointerType, clientX: x, clientY: y, isPrimary, preventDefault() {} });
}

test('cancelar antes de una respuesta fullscreen tardía vuelve a salir de fullscreen', async t => {
  const h = setup(t);
  const entry = h.ui.enterCardboard();
  const exit = h.ui.exitCardboard();
  assert.equal(h.ui.getState().active, false);
  assert.equal(h.nodes.displayWrap.classes.size, 0);
  h.completeEnter();
  await Promise.all([entry, exit]);
  assert.equal(h.doc.fullscreenElement, null);
  assert.equal(h.exits(), 1);
  assert.equal(h.doc.body.classList.contains('cardboard-mode'), false);
});

test('salir y volver a entrar adopta una solicitud tardía sin cerrar la entrada nueva', async t => {
  const h = setup(t);
  const first = h.ui.enterCardboard();
  h.ui.exitCardboard();
  const latest = h.ui.enterCardboard();
  h.completeEnter();
  await Promise.all([first, latest]);
  assert.equal(h.enterRequests.length, 1);
  assert.equal(h.exits(), 0);
  assert.equal(h.ui.getState().active, true);
  assert.equal(h.doc.fullscreenElement, h.nodes.displayWrap);
});

test('una entrada durante la salida nativa espera y mantiene su estado nuevo', async t => {
  const h = setup(t, { delayedExit: true });
  const initial = h.ui.enterCardboard();
  h.completeEnter();
  await initial;
  const exiting = h.ui.exitCardboard();
  const entering = h.ui.enterCardboard();
  h.completeExit();
  await flush();
  assert.equal(h.enterRequests.length, 2);
  assert.equal(h.ui.getState().active, true);
  h.completeEnter(1);
  await Promise.all([exiting, entering]);
  assert.equal(h.ui.getState().fullscreen, true);
  const disposing = h.ui.dispose();
  h.completeExit();
  await disposing;
});

test('fullscreen rechazado conserva la alternativa CSS y Escape permite salir sin toasts', async t => {
  const h = setup(t);
  showToast('Mensaje previo');
  assert.equal(h.nodes.toast.classList.contains('show'), true);
  const entering = h.ui.enterCardboard();
  assert.equal(h.nodes.toast.classList.contains('show'), false);
  h.enterRequests[0].reject(new Error('denied'));
  await entering;
  assert.equal(h.ui.getState().active, true);
  showToast('No superponer');
  assert.equal(h.nodes.toast.classList.contains('show'), false);
  h.doc.emit('keydown', { key: 'Escape' });
  await flush();
  assert.equal(h.ui.getState().active, false);
});

test('una salida fullscreen del navegador retira el modo Cardboard', async t => {
  const h = setup(t);
  const entering = h.ui.enterCardboard();
  h.completeEnter();
  await entering;
  h.doc.fullscreenElement = null;
  h.doc.emit('fullscreenchange');
  await flush();
  assert.equal(h.ui.getState().active, false);
  assert.equal(h.doc.body.classList.contains('cardboard-mode'), false);
  assert.ok(h.unlocks() >= 1);
});

test('doble toque touch o pen sale; mouse, multitouch y toques distantes no salen', async t => {
  const h = setup(t, { native: false });
  await h.ui.enterCardboard();
  tap(h.nodes.viewerStage, 10, 'mouse');
  tap(h.nodes.viewerStage, 100, 'mouse');
  tap(h.nodes.viewerStage, 200, 'touch', 10, 10, false);
  tap(h.nodes.viewerStage, 300, 'touch', 10, 10, false);
  assert.equal(h.ui.getState().active, true);
  tap(h.nodes.viewerStage, 400);
  tap(h.nodes.viewerStage, 500, 'touch', 200, 200);
  assert.equal(h.ui.getState().active, true);
  tap(h.nodes.viewerStage, 700, 'touch', 202, 200);
  await flush();
  assert.equal(h.ui.getState().active, false);
  await h.ui.enterCardboard();
  tap(h.nodes.viewerStage, 1000, 'pen');
  tap(h.nodes.viewerStage, 1200, 'pen');
  await flush();
  assert.equal(h.ui.getState().active, false);
});

test('Wake Lock se libera al ocultar, se recupera al volver y descarta respuestas tardías', async t => {
  const h = setup(t, { wake: true, native: false });
  await h.ui.enterCardboard();
  assert.equal(h.wakeRequests.length, 1);
  h.visibility('hidden');
  const late = sentinel();
  h.wakeRequests[0].resolve(late);
  await flush();
  assert.equal(late.releases, 1);
  assert.equal(h.ui.getState().wakeLock, false);
  h.visibility('visible');
  await flush();
  const visible = sentinel();
  h.wakeRequests[1].resolve(visible);
  await flush();
  assert.equal(h.ui.getState().wakeLock, true);
  h.visibility('hidden');
  assert.equal(visible.releases, 1);
  h.visibility('visible');
  await flush();
  await h.ui.exitCardboard();
  const afterExit = sentinel();
  h.wakeRequests[2].resolve(afterExit);
  await flush();
  assert.equal(afterExit.releases, 1);
  assert.equal(h.wakeRequests.length, 3);
});

test('una solicitud de orientación tardía se desbloquea después de salir', async t => {
  const h = setup(t, { orientationDelay: true });
  const entering = h.ui.enterCardboard();
  h.completeEnter();
  await entering;
  assert.equal(h.orientationRequests.length, 1);
  await h.ui.exitCardboard();
  h.orientationRequests[0].resolve();
  await flush();
  assert.ok(h.unlocks() >= 2);
  assert.equal(h.ui.getState().active, false);
});

test('dispose elimina listeners y limpia fullscreen, orientación y Wake Lock tardíos', async t => {
  const h = setup(t, { wake: true });
  h.ui.enterCardboard();
  await flush();
  const done = h.ui.dispose();
  assert.equal(h.doc.listenerCount(), 0);
  assert.equal(h.win.listenerCount(), 0);
  assert.equal(h.nodes.viewerStage.listenerCount(), 0);
  assert.equal(h.raf.size, 0);
  const late = sentinel();
  h.wakeRequests[0].resolve(late);
  h.completeEnter();
  await done;
  await flush();
  assert.equal(late.releases, 1);
  assert.equal(h.doc.fullscreenElement, null);
  assert.equal(h.ui.getState().disposed, true);
  await h.ui.enterCardboard();
  assert.equal(h.enterRequests.length, 1);
});

test('el botón fullscreen también permite cancelar una solicitud pendiente', async t => {
  const h = setup(t);
  h.nodes.fullscreenBtn.emit('click');
  h.nodes.fullscreenBtn.emit('click');
  h.completeEnter();
  await flush();
  assert.equal(h.doc.fullscreenElement, null);
  assert.equal(h.ui.getState().active, false);
});

test('una salida nativa rechazada admite un segundo intento', async t => {
  const h = setup(t, { delayedExit: true });
  const entry = h.ui.enterCardboard();
  h.completeEnter();
  await entry;
  const firstExit = h.ui.exitCardboard();
  h.exitRequests[0].reject(new Error('browser denied'));
  await firstExit;
  assert.equal(h.ui.getState().active, false);
  assert.equal(h.ui.getState().fullscreen, true);
  const retry = h.ui.exitCardboard();
  h.completeExit(1);
  await retry;
  assert.equal(h.ui.getState().fullscreen, false);
});

test('una excepción síncrona de Wake Lock no bloquea futuros intentos', async t => {
  const h = setup(t, { native: false });
  let requests = 0;
  h.nav.wakeLock = { request() { requests++; throw new Error('not allowed'); } };
  await h.ui.enterCardboard();
  await flush();
  h.visibility('hidden');
  h.visibility('visible');
  await flush();
  assert.equal(requests, 2);
  assert.equal(h.ui.getState().active, true);
});

test('treinta entradas y salidas consecutivas conservan estado y no acumulan listeners', async t => {
  const h = setup(t);
  const initialListeners = h.doc.listenerCount() + h.win.listenerCount() + h.nodes.viewerStage.listenerCount();
  for (let cycle = 0; cycle < 30; cycle++) {
    const entering = h.ui.enterCardboard();
    h.completeEnter();
    await entering;
    assert.equal(h.ui.getState().active, true);
    assert.equal(h.ui.getState().fullscreen, true);
    await h.ui.exitCardboard();
    assert.equal(h.ui.getState().active, false);
    assert.equal(h.ui.getState().fullscreen, false);
  }
  assert.equal(h.enterRequests.length, 30);
  assert.equal(h.exits(), 30);
  assert.equal(h.doc.listenerCount() + h.win.listenerCount() + h.nodes.viewerStage.listenerCount(), initialListeners);
});
