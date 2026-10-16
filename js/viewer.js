import * as THREE from 'three';
import { createStereoScene } from './scene.js';

export const DEFAULT_CONFIG = Object.freeze({
  parallax: 0,       // px: separa o acerca las vistas en sentidos opuestos
  scale: 100,        // %: tamaño de ambas vistas
  panX: 0,          // px: desplazamiento horizontal compartido
  panY: 0,          // px: desplazamiento vertical compartido
  vertical: 0,      // px: corrige diferencia vertical ENTRE ojos
  format: 'full',   // 'full': SBS completo; 'half': Half-SBS (comprimido)
  swap: false,      // intercambiar L y R
});

function halfUV(side, imageWidth) {
  // Evita la mezcla de columnas en la frontera entre mitades por filtrado lineal.
  const border = 0.5 / imageWidth;
  const minU = side === 'left' ? border : 0.5 + border;
  const maxU = side === 'left' ? 0.5 - border : 1 - border;
  const geometry = new THREE.PlaneGeometry(1, 1);
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    const oldU = uv.getX(i);
    uv.setX(i, minU + (maxU - minU) * oldU);
  }
  uv.needsUpdate = true;
  return geometry;
}

/**
 * Visor SBS para imágenes ya estereoscópicas, no una StereoCamera.
 * Mantiene el aspecto de cada ojo y permite calibrar los dos planos de forma simultánea.
 */
export function createStereoViewer(stage, settings) {
  const engine = createStereoScene(stage);
  const params = settings;
  const materialLeft = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.FrontSide });
  const materialRight = materialLeft.clone();
  const placeholder = new THREE.PlaneGeometry(1, 1);
  const meshLeft = new THREE.Mesh(placeholder, materialLeft);
  const meshRight = new THREE.Mesh(placeholder, materialRight);
  engine.sceneLeft.add(meshLeft);
  engine.sceneRight.add(meshRight);

  let texture = null;
  let geometryLeft = null;
  let geometryRight = null;
  let imageWidth = 0;
  let imageHeight = 0;
  let imageName = '';
  meshLeft.visible = false;
  meshRight.visible = false;

  function update() {
    if (!texture) return;
    const { width, height } = engine.getSize();
    if (!width || !height) return;

    // Relación de aspecto de UNA vista: el modo Half-SBS corrige la compresión horizontal.
    const eyeAspect = params.format === 'half'
      ? imageWidth / imageHeight
      : (imageWidth / 2) / imageHeight;
    const viewportAspect = (width / 2) / height;
    const fit = Math.min(1, viewportAspect / eyeAspect);
    const worldHeight = 2 * fit * (params.scale / 100);
    const worldWidth = worldHeight * eyeAspect;
    const px = 2 / height; // Convierte px CSS en unidades ortográficas.

    meshLeft.scale.set(worldWidth, worldHeight, 1);
    meshRight.scale.set(worldWidth, worldHeight, 1);
    meshLeft.position.set((params.panX - params.parallax / 2) * px, (-params.panY + params.vertical / 2) * px, 0);
    meshRight.position.set((params.panX + params.parallax / 2) * px, (-params.panY - params.vertical / 2) * px, 0);
    meshLeft.geometry = params.swap ? geometryRight : geometryLeft;
    meshRight.geometry = params.swap ? geometryLeft : geometryRight;
    engine.requestRender();
  }

  function setImage(img, name) {
    const newTexture = new THREE.Texture(img);
    newTexture.colorSpace = THREE.SRGBColorSpace;
    newTexture.minFilter = THREE.LinearFilter;
    newTexture.magFilter = THREE.LinearFilter;
    newTexture.generateMipmaps = false;
    newTexture.needsUpdate = true;
    const newLeft = halfUV('left', img.naturalWidth);
    const newRight = halfUV('right', img.naturalWidth);

    // Primero asignamos la nueva textura y geometría; luego liberamos la anterior.
    materialLeft.map = newTexture;
    materialRight.map = newTexture;
    materialLeft.needsUpdate = true;
    materialRight.needsUpdate = true;
    texture?.dispose();
    geometryLeft?.dispose();
    geometryRight?.dispose();
    if (placeholder && !geometryLeft) placeholder.dispose();
    texture = newTexture;
    geometryLeft = newLeft;
    geometryRight = newRight;
    imageWidth = img.naturalWidth;
    imageHeight = img.naturalHeight;
    imageName = name;
    meshLeft.visible = true;
    meshRight.visible = true;
    update();
    return { width: imageWidth, height: imageHeight, name: imageName };
  }

  function getImageInfo() {
    return imageWidth ? { width: imageWidth, height: imageHeight, name: imageName } : null;
  }

  engine.onResize(update);
  return {
    setImage,
    update,
    getImageInfo,
    resize: engine.resize,
    dispose() {
      geometryLeft?.dispose();
      geometryRight?.dispose();
      texture?.dispose();
      materialLeft.dispose();
      materialRight.dispose();
      engine.dispose();
    },
  };
}
