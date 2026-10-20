import * as THREE from 'three';
import { createStereoScene } from './scene.js';
import { calculateImageLayout } from './layout.js';

export { DEFAULT_CONFIG } from './settings.js';
export { calculateImageLayout } from './layout.js';

function halfUV(side, imageWidth) {
  // Un inset de medio texel evita mezclar columnas en la frontera SBS.
  const border = 0.5 / imageWidth;
  const minU = side === 'left' ? border : 0.5 + border;
  const maxU = side === 'left' ? 0.5 - border : 1 - border;
  const geometry = new THREE.PlaneGeometry(1, 1);
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    uv.setX(i, minU + (maxU - minU) * uv.getX(i));
    // flipY=false y UV invertidas funcionan igual para Canvas e ImageBitmap.
    uv.setY(i, 1 - uv.getY(i));
  }
  uv.needsUpdate = true;
  return geometry;
}

function releaseImage(image) {
  // Canvas e ImageBitmap pasan a ser propiedad del visor al aceptar setImage().
  if (typeof image?.close === 'function') image.close();
  else if (typeof image?.getContext === 'function') {
    image.width = 1;
    image.height = 1;
  }
}

/** Visor de pares ya estereoscópicos: no genera nueva profundidad. */
export function createStereoViewer(stage, settings, options = {}) {
  const engine = createStereoScene(stage, options);
  const materialLeft = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.FrontSide });
  const materialRight = materialLeft.clone();
  const placeholder = new THREE.PlaneGeometry(1, 1);
  const meshLeft = new THREE.Mesh(placeholder, materialLeft);
  const meshRight = new THREE.Mesh(placeholder, materialRight);
  engine.sceneLeft.add(meshLeft);
  engine.sceneRight.add(meshRight);

  let texture = null;
  let preparedImage = null;
  let geometryLeft = null;
  let geometryRight = null;
  let imageWidth = 0;
  let imageHeight = 0;
  let imageName = '';
  let currentLayout = null;
  let placeholderDisposed = false;
  let disposed = false;
  meshLeft.visible = false;
  meshRight.visible = false;

  function update() {
    if (disposed || !texture) return;
    const { width, height } = engine.getSize();
    if (!width || !height) return;
    currentLayout = calculateImageLayout(settings, imageWidth, imageHeight, width, height);
    const { worldWidth, worldHeight, left, right } = currentLayout;
    meshLeft.scale.set(worldWidth, worldHeight, 1);
    meshRight.scale.set(worldWidth, worldHeight, 1);
    meshLeft.position.set(left.x, left.y, 0);
    meshRight.position.set(right.x, right.y, 0);
    meshLeft.geometry = settings.swap ? geometryRight : geometryLeft;
    meshRight.geometry = settings.swap ? geometryLeft : geometryRight;
    engine.requestRender();
  }

  function setImage(image, name = 'Imagen SBS') {
    if (disposed) throw new Error('El visor ya se ha cerrado.');
    const width = image?.naturalWidth ?? image?.width;
    const height = image?.naturalHeight ?? image?.height;
    const safeName = String(name);
    const viewport = engine.getSize();
    // Valida antes de tomar propiedad del bitmap y antes de sustituir la imagen.
    calculateImageLayout(settings, width, height, viewport.width, viewport.height);
    if (width > engine.getMaxTextureSize() || height > engine.getMaxTextureSize()) {
      throw new RangeError('La imagen preparada supera la resolución que admite esta GPU.');
    }

    const nextTexture = new THREE.Texture(image);
    nextTexture.colorSpace = THREE.SRGBColorSpace;
    nextTexture.flipY = false;
    nextTexture.minFilter = THREE.LinearFilter;
    nextTexture.magFilter = THREE.LinearFilter;
    nextTexture.generateMipmaps = false;
    nextTexture.needsUpdate = true;
    let nextLeft;
    let nextRight;
    try {
      nextLeft = halfUV('left', width);
      nextRight = halfUV('right', width);
    } catch (error) {
      nextTexture.dispose();
      nextLeft?.dispose();
      nextRight?.dispose();
      throw error;
    }

    const previousTexture = texture;
    const previousImage = preparedImage;
    const previousLeft = geometryLeft;
    const previousRight = geometryRight;
    texture = nextTexture;
    preparedImage = image;
    geometryLeft = nextLeft;
    geometryRight = nextRight;
    imageWidth = width;
    imageHeight = height;
    imageName = safeName;
    materialLeft.map = texture;
    materialRight.map = texture;
    materialLeft.needsUpdate = true;
    materialRight.needsUpdate = true;
    meshLeft.visible = true;
    meshRight.visible = true;
    update();

    // Solo se liberan los recursos anteriores una vez instalada la nueva vista.
    previousTexture?.dispose();
    previousLeft?.dispose();
    previousRight?.dispose();
    if (previousImage !== image) releaseImage(previousImage);
    if (!placeholderDisposed) {
      placeholder.dispose();
      placeholderDisposed = true;
    }
    return getImageInfo();
  }

  function getImageInfo() {
    return imageWidth ? { width: imageWidth, height: imageHeight, name: imageName } : null;
  }

  engine.onResize(update);
  engine.onContextRestored(() => {
    // Three.js reconstruye sus cachés. Conservamos la fuente para reponer GPU.
    if (texture) texture.needsUpdate = true;
    materialLeft.needsUpdate = true;
    materialRight.needsUpdate = true;
    for (const geometry of [geometryLeft, geometryRight]) {
      if (!geometry) continue;
      for (const attribute of Object.values(geometry.attributes)) attribute.needsUpdate = true;
      if (geometry.index) geometry.index.needsUpdate = true;
    }
    update();
  });

  return {
    setImage,
    update,
    getImageInfo,
    getCurrentLayout: () => currentLayout,
    getViewportSize: engine.getSize,
    getMaxTextureSize: engine.getMaxTextureSize,
    getRenderInfo: engine.getRenderInfo,
    setQuality: engine.setQuality,
    resize: engine.resize,
    dispose() {
      if (disposed) return;
      disposed = true;
      geometryLeft?.dispose();
      geometryRight?.dispose();
      if (!placeholderDisposed) placeholder.dispose();
      texture?.dispose();
      releaseImage(preparedImage);
      preparedImage = null;
      texture = null;
      imageWidth = 0;
      imageHeight = 0;
      currentLayout = null;
      materialLeft.dispose();
      materialRight.dispose();
      engine.dispose();
    },
  };
}
