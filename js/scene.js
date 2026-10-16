import * as THREE from 'three';

/**
 * Un único WebGLRenderer y dos escenas, una por ojo.
 * No generamos estereoscopía nueva: cada escena dibuja la mitad SBS correspondiente.
 */
export function createStereoScene(stage) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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
  let scheduled = false;
  let resizeListener = null;
  let destroyed = false;

  function getSize() { return { width, height }; }

  function render() {
    if (destroyed || !width || !height) return;
    const leftWidth = Math.floor(width / 2);
    const rightWidth = width - leftWidth;
    const aspect = (width / 2) / height;
    camera.left = -aspect;
    camera.right = aspect;
    camera.top = 1;
    camera.bottom = -1;
    camera.updateProjectionMatrix();

    renderer.setScissorTest(true);
    renderer.setViewport(0, 0, leftWidth, height);
    renderer.setScissor(0, 0, leftWidth, height);
    renderer.render(sceneLeft, camera);
    renderer.setViewport(leftWidth, 0, rightWidth, height);
    renderer.setScissor(leftWidth, 0, rightWidth, height);
    renderer.render(sceneRight, camera);
    renderer.setScissorTest(false);
  }

  function requestRender() {
    if (scheduled || destroyed) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; render(); });
  }

  function resize() {
    if (destroyed) return;
    const rect = stage.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (w !== width || h !== height) {
      width = w;
      height = h;
      renderer.setSize(width, height, false);
      resizeListener?.();
    }
    requestRender();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  resize();

  return {
    sceneLeft,
    sceneRight,
    getSize,
    requestRender,
    resize,
    onResize(callback) { resizeListener = callback; callback(); },
    dispose() {
      destroyed = true;
      observer.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
