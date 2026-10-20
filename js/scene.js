import * as THREE from 'three';

// Presupuestos del framebuffer completo, compartido por ambos ojos. Auto y
// nitidez usan el DPR real; solo se reduce cuando lo exige el presupuesto o GPU.
export const RENDER_QUALITY = Object.freeze({
  auto: Object.freeze({ maxPixels: 8_000_000, maxPixelRatio: Infinity }),
  sharp: Object.freeze({ maxPixels: 16_000_000, maxPixelRatio: Infinity }),
  economy: Object.freeze({ maxPixels: 2_000_000, maxPixelRatio: 1 }),
});

/** Un renderer con dos escenas. Las fotografías se redibujan bajo demanda. */
export function createStereoScene(stage, { onStatus } = {}) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    depth: false,
    stencil: false,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor('#060d19', 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  stage.prepend(renderer.domElement);

  const sceneLeft = new THREE.Scene();
  const sceneRight = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 5;
  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let quality = 'auto';
  let frameId = null;
  let resizeListener = null;
  let restoreListener = null;
  let destroyed = false;
  let contextLost = false;
  let restorationPending = false;
  let renderErrorReported = false;
  let maxBufferDimension = readMaxBufferDimension();

  function readMaxBufferDimension() {
    const gl = renderer.getContext();
    const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    return Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), viewport[0], viewport[1]);
  }

  function getSize() { return { width, height }; }

  function getRenderInfo() {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    return { quality, pixelRatio, bufferWidth: size.x, bufferHeight: size.y };
  }

  function renderEye(scene, x, eyeWidth) {
    const aspect = eyeWidth / height;
    camera.left = -aspect;
    camera.right = aspect;
    camera.updateProjectionMatrix();
    renderer.setViewport(x, 0, eyeWidth, height);
    renderer.setScissor(x, 0, eyeWidth, height);
    renderer.render(scene, camera);
  }

  function render() {
    if (destroyed || contextLost || !width || !height) return;
    try {
      const leftWidth = Math.floor(width / 2);
      renderer.setScissorTest(true);
      renderEye(sceneLeft, 0, leftWidth);
      renderEye(sceneRight, leftWidth, width - leftWidth);
      renderer.setScissorTest(false);
      renderErrorReported = false;
      if (restorationPending) {
        restorationPending = false;
        onStatus?.('WebGL recuperado. La imagen y la calibración se han restaurado.', 'success');
      }
    } catch (error) {
      renderer.setScissorTest(false);
      if (!renderErrorReported) {
        renderErrorReported = true;
        onStatus?.('No se pudo dibujar la imagen. Prueba una calidad menor o una imagen más pequeña.', 'error');
        console.error('StereoLab: fallo de renderizado.', error);
      }
    }
  }

  function requestRender() {
    if (frameId !== null || destroyed || contextLost) return;
    frameId = requestAnimationFrame(() => { frameId = null; render(); });
  }

  function resize() {
    if (destroyed || contextLost) return;
    const rect = stage.getBoundingClientRect();
    const nextWidth = Math.max(2, Math.round(rect.width));
    const nextHeight = Math.max(1, Math.round(rect.height));
    const budget = RENDER_QUALITY[quality];
    const deviceRatio = Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0
      ? window.devicePixelRatio : 1;
    const nextRatio = Math.min(
      deviceRatio,
      budget.maxPixelRatio,
      Math.sqrt(budget.maxPixels / (nextWidth * nextHeight)),
      maxBufferDimension / nextWidth,
      maxBufferDimension / nextHeight,
    );
    const sizeChanged = width !== nextWidth || height !== nextHeight;
    const ratioChanged = pixelRatio !== nextRatio;
    width = nextWidth;
    height = nextHeight;
    pixelRatio = nextRatio;
    if (sizeChanged || ratioChanged) {
      // Cambia tamaño y DPR juntos: evita reservar temporalmente el tamaño
      // anterior con un DPR mayor al salir de una vista grande.
      renderer.setDrawingBufferSize(width, height, pixelRatio);
      resizeListener?.();
    }
    requestRender();
  }

  function handleContextLost(event) {
    event.preventDefault(); // Permite que el navegador restaure el contexto.
    if (destroyed) return;
    contextLost = true;
    restorationPending = false;
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    onStatus?.('Se perdió el contexto WebGL. Esperando su recuperación; tus ajustes se conservan.', 'warning');
  }

  function handleContextRestored() {
    if (destroyed) return;
    // Three.js registra su listener antes que este y reconstruye sus cachés GPU.
    // El visor conserva la fuente decodificada para volver a subir la textura.
    try {
      renderer.setClearColor('#060d19', 1);
      maxBufferDimension = readMaxBufferDimension();
      restoreListener?.();
      contextLost = false;
      restorationPending = true;
      renderErrorReported = false;
      resize();
      requestRender();
    } catch (error) {
      contextLost = true;
      onStatus?.('No se pudo recuperar WebGL. Recarga la página si el navegador no vuelve a intentarlo.', 'error');
      console.error('StereoLab: fallo al recuperar WebGL.', error);
    }
  }

  function handleVisibility() {
    if (document.visibilityState === 'visible') resize();
  }

  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  observer?.observe(stage);
  renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
  renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  document.addEventListener('visibilitychange', handleVisibility);
  resize();

  return {
    sceneLeft,
    sceneRight,
    getSize,
    getRenderInfo,
    getMaxTextureSize: () => renderer.capabilities.maxTextureSize,
    requestRender,
    resize,
    setQuality(value) {
      if (!Object.hasOwn(RENDER_QUALITY, value)) throw new RangeError('Calidad de renderizado no válida.');
      quality = value;
      resize();
      return getRenderInfo();
    },
    onResize(callback) { resizeListener = callback; callback(); },
    onContextRestored(callback) { restoreListener = callback; },
    dispose() {
      if (destroyed) return;
      destroyed = true;
      if (frameId !== null) cancelAnimationFrame(frameId);
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
      document.removeEventListener('visibilitychange', handleVisibility);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
