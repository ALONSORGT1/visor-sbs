let toastTimeout;

function clearToast() {
  clearTimeout(toastTimeout);
  const el = document.getElementById('toast');
  if (el) {
    el.classList.remove('show');
    el.textContent = '';
  }
}

export function showToast(message) {
  clearToast();
  const el = document.getElementById('toast');
  // Los mensajes nunca deben superponerse a los ojos dentro del visor.
  if (!el || document.body.classList.contains('cardboard-mode')) return;
  el.textContent = String(message);
  el.classList.add('show');
  toastTimeout = setTimeout(() => el.classList.remove('show'), 3500);
}

/** Fullscreen nativo cuando es posible, con una alternativa CSS para móviles. */
export function createImmersiveMode(onLayoutChange, options = {}) {
  const wrap = document.getElementById('displayWrap');
  const stage = document.getElementById('viewerStage');
  const button = document.getElementById('cardboardBtn');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const listeners = [];
  let active = false;
  let disposed = false;
  let fullscreenDesired = false;
  let fullscreenIntent = 0;
  let fullscreenAttempt = -1;
  let nativeSeen = false;
  let exitingNative = false;
  let revision = 0;
  let syncing = false;
  let syncPromise = Promise.resolve();
  let layoutFrame = null;
  let layoutTimer = null;
  let lastTap = null;
  let wakeLock = null;
  let wakeRequest = null;
  let wakeVersion = 0;
  let orientationLocked = false;
  let orientationPending = false;
  let orientationAttempt = -1;

  function getState() {
    return {
      active,
      fullscreen: Boolean(wrap && document.fullscreenElement === wrap),
      wakeLock: Boolean(wakeLock),
      disposed,
    };
  }

  function notify() {
    // Un consumidor no debe impedir liberar fullscreen o Wake Lock.
    try { options.onStateChange?.(getState()); } catch { /* consumidor opcional */ }
  }

  function layout() {
    if (disposed) return;
    if (layoutFrame === null) {
      layoutFrame = requestAnimationFrame(() => {
        layoutFrame = null;
        if (!disposed) onLayoutChange();
      });
    }
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(() => {
      layoutTimer = null;
      if (!disposed) onLayoutChange();
    }, 130);
  }

  function setActive(value) {
    active = value && !disposed;
    lastTap = null;
    document.body.classList.toggle('cardboard-mode', active);
    button?.setAttribute('aria-pressed', String(active));
    if (active) clearToast();
    refreshWakeLock();
    refreshOrientation();
    notify();
    layout();
  }

  function wantsWakeLock() {
    return active && !disposed && document.visibilityState !== 'hidden';
  }

  function releaseWakeLock() {
    wakeVersion++;
    const previous = wakeLock;
    wakeLock = null;
    if (previous) {
      try { Promise.resolve(previous.release()).catch(() => {}); } catch { /* opcional */ }
      notify();
    }
  }

  function refreshWakeLock() {
    if (!wantsWakeLock()) {
      releaseWakeLock();
      return;
    }
    if (wakeLock || wakeRequest || !navigator.wakeLock?.request) return;
    const version = ++wakeVersion;
    // Invalida solicitudes que se resuelven después de salir u ocultar la pestaña.
    wakeRequest = (async () => {
      // Asigna wakeRequest antes de admitir también excepciones síncronas del API.
      await Promise.resolve();
      try {
        if (!wantsWakeLock() || version !== wakeVersion) return;
        const sentinel = await navigator.wakeLock.request('screen');
        if (!wantsWakeLock() || version !== wakeVersion) {
          try { await sentinel.release(); } catch { /* el navegador ya lo liberó */ }
          return;
        }
        wakeLock = sentinel;
        sentinel.addEventListener('release', () => {
          if (wakeLock === sentinel) {
            wakeLock = null;
            notify();
          }
        }, { once: true });
        notify();
      } catch {
        // Navegación insegura, batería baja y denegación no bloquean el visor.
      } finally {
        wakeRequest = null;
        if (version !== wakeVersion && wantsWakeLock()) refreshWakeLock();
      }
    })();
  }

  function wantsOrientationLock() {
    return active && !disposed && options.lockOrientation !== false &&
      document.visibilityState !== 'hidden' &&
      wrap && document.fullscreenElement === wrap;
  }

  function unlockOrientation() {
    if (orientationLocked || orientationPending) {
      try { screen.orientation?.unlock?.(); } catch { /* opcional */ }
    }
    orientationLocked = false;
  }

  function refreshOrientation() {
    if (!wantsOrientationLock()) {
      unlockOrientation();
      return;
    }
    if (orientationLocked || orientationPending ||
        orientationAttempt === fullscreenIntent || !screen.orientation?.lock) return;
    orientationAttempt = fullscreenIntent;
    orientationPending = true;
    const intent = fullscreenIntent;
    (async () => {
      try {
        await screen.orientation.lock('landscape');
        orientationLocked = true;
        if (!wantsOrientationLock()) unlockOrientation();
      } catch { /* la orientación es una mejora opcional */ }
      finally {
        orientationPending = false;
        if (intent !== fullscreenIntent && wantsOrientationLock()) refreshOrientation();
      }
    })();
  }

  function reconcileFullscreen() {
    if (syncing) return syncPromise;
    syncing = true;
    let completedRevision = revision;
    // Una operación nativa en curso. Una entrada nueva adopta una solicitud
    // pendiente; una respuesta antigua nunca puede cerrar esa entrada nueva.
    syncPromise = (async () => {
      do {
        completedRevision = revision;
        if (fullscreenDesired && !disposed && !document.fullscreenElement &&
            fullscreenAttempt !== fullscreenIntent) {
          fullscreenAttempt = fullscreenIntent;
          if (wrap?.requestFullscreen) {
            try {
              await wrap.requestFullscreen({ navigationUI: 'hide' });
              nativeSeen = document.fullscreenElement === wrap;
            } catch {
              if (!active && !disposed && fullscreenDesired) {
                showToast('El navegador bloqueó la pantalla completa.');
              }
            }
          } else if (!active && !disposed) {
            showToast('Este navegador no admite pantalla completa para esta página.');
          }
        } else if ((!fullscreenDesired || disposed) &&
                   wrap && document.fullscreenElement === wrap && document.exitFullscreen) {
          exitingNative = true;
          try { await document.exitFullscreen(); }
          catch {
            if (!disposed) showToast('No se pudo salir de pantalla completa. Usa Escape o el gesto del navegador.');
          } finally { exitingNative = false; }
          nativeSeen = document.fullscreenElement === wrap;
        }
        refreshOrientation();
        notify();
        layout();
      } while (completedRevision !== revision);
    })().finally(() => {
      syncing = false;
      // Atiende cambios entre la última iteración y su resolución.
      if (completedRevision !== revision) reconcileFullscreen();
    });
    return syncPromise;
  }

  function enterCardboard() {
    if (disposed) return Promise.resolve();
    if (!active) {
      fullscreenDesired = true;
      fullscreenIntent++;
      revision++;
      nativeSeen = Boolean(wrap && document.fullscreenElement === wrap);
      setActive(true);
    }
    return reconcileFullscreen();
  }

  function exitCardboard() {
    fullscreenDesired = false;
    revision++;
    setActive(false);
    return reconcileFullscreen();
  }

  function toggleFullscreen() {
    if (disposed) return;
    if (fullscreenDesired || document.fullscreenElement === wrap) return exitCardboard();
    fullscreenDesired = true;
    fullscreenIntent++;
    revision++;
    return reconcileFullscreen();
  }

  function fullscreenChanged() {
    const fullscreen = Boolean(wrap && document.fullscreenElement === wrap);
    if (!fullscreen) orientationAttempt = -1;
    if (!fullscreen && nativeSeen && !exitingNative) {
      // Escape y los controles nativos del navegador son también una salida.
      fullscreenDesired = false;
      revision++;
      setActive(false);
    }
    nativeSeen = fullscreen;
    refreshOrientation();
    notify();
    layout();
    if (fullscreen && (!fullscreenDesired || disposed)) reconcileFullscreen();
  }

  function tapped(event) {
    if (!active || !['touch', 'pen'].includes(event.pointerType) || event.isPrimary === false) return;
    const time = Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now();
    const x = Number(event.clientX) || 0;
    const y = Number(event.clientY) || 0;
    if (lastTap && time >= lastTap.time && time - lastTap.time <= 550 &&
        Math.hypot(x - lastTap.x, y - lastTap.y) <= 70) {
      event.preventDefault();
      exitCardboard();
    } else {
      lastTap = { time, x, y };
    }
  }

  function keydown(event) {
    if (event.key === 'Escape' && active) exitCardboard();
  }

  function visibilityChanged() {
    refreshWakeLock();
    if (document.visibilityState !== 'hidden') {
      orientationAttempt = -1;
      layout();
    }
    refreshOrientation();
  }

  function listen(target, event, handler) {
    if (!target) return;
    target.addEventListener(event, handler);
    listeners.push(() => target.removeEventListener(event, handler));
  }

  function dispose() {
    if (disposed) return syncPromise;
    disposed = true;
    fullscreenDesired = false;
    revision++;
    setActive(false);
    clearToast();
    listeners.splice(0).forEach(remove => remove());
    if (layoutFrame !== null) cancelAnimationFrame(layoutFrame);
    clearTimeout(layoutTimer);
    layoutFrame = layoutTimer = null;
    return reconcileFullscreen();
  }

  listen(button, 'click', enterCardboard);
  listen(fullscreenBtn, 'click', toggleFullscreen);
  listen(document, 'fullscreenchange', fullscreenChanged);
  listen(document, 'keydown', keydown);
  listen(document, 'visibilitychange', visibilityChanged);
  listen(stage, 'pointerdown', tapped);
  listen(window, 'pagehide', exitCardboard);
  notify();

  return { enterCardboard, exitCardboard, dispose, getState };
}
