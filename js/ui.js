let toastTimeout;
export function showToast(message) {
  const el = document.getElementById('toast');
  clearTimeout(toastTimeout);
  el.textContent = message;
  el.classList.add('show');
  toastTimeout = setTimeout(() => el.classList.remove('show'), 3500);
}

/** Pantalla completa auténtica cuando el navegador lo admite; CSS inmersivo si no. */
export function createImmersiveMode(onLayoutChange) {
  const wrap = document.getElementById('displayWrap');
  const stage = document.getElementById('viewerStage');
  const button = document.getElementById('cardboardBtn');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  let inCardboard = false;
  let nativeFullscreenStarted = false;
  let lastTap = 0;

  function layout() {
    requestAnimationFrame(() => onLayoutChange());
    setTimeout(onLayoutChange, 130);
  }

  async function enterCardboard() {
    if (inCardboard) return;
    inCardboard = true;
    nativeFullscreenStarted = false;
    document.body.classList.add('cardboard-mode');
    layout();
    try {
      if (wrap.requestFullscreen) {
        await wrap.requestFullscreen({ navigationUI: 'hide' });
        nativeFullscreenStarted = true;
      }
    } catch {
      // iOS Safari u otros navegadores pueden rechazar fullscreen en elementos comunes.
      showToast('Vista inmersiva activada. Gira el teléfono horizontalmente.');
    }
    try {
      if (screen.orientation?.lock && document.fullscreenElement) {
        await screen.orientation.lock('landscape');
      }
    } catch {
      // Bloqueo de orientación opcional; depende del navegador y del dispositivo.
    }
    layout();
  }

  async function exitCardboard() {
    if (!inCardboard) return;
    inCardboard = false;
    nativeFullscreenStarted = false;
    document.body.classList.remove('cardboard-mode');
    try { if (screen.orientation?.unlock) screen.orientation.unlock(); } catch { /* opcional */ }
    if (document.fullscreenElement && document.exitFullscreen) {
      try { await document.exitFullscreen(); } catch { /* posible cambio simultáneo */ }
    }
    layout();
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      if (inCardboard) await exitCardboard();
      else await document.exitFullscreen();
      return;
    }
    if (!wrap.requestFullscreen) {
      showToast('Este navegador no admite pantalla completa para esta página.');
      return;
    }
    try { await wrap.requestFullscreen(); layout(); }
    catch { showToast('El navegador bloqueó la pantalla completa.'); }
  }

  function fullscreenChanged() {
    if (inCardboard && nativeFullscreenStarted && !document.fullscreenElement) {
      exitCardboard();
    }
    layout();
  }

  function tapped(event) {
    if (!inCardboard || event.pointerType === 'mouse') return;
    const time = Date.now();
    if (time - lastTap < 800) { lastTap = 0; exitCardboard(); }
    else { lastTap = time; }
  }

  function keydown(event) {
    if (event.key === 'Escape' && inCardboard) exitCardboard();
  }

  button.addEventListener('click', enterCardboard);
  fullscreenBtn.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', fullscreenChanged);
  document.addEventListener('keydown', keydown);
  stage.addEventListener('pointerdown', tapped);

  return { enterCardboard, exitCardboard };
}
