import { DEFAULT_CONFIG } from './settings.js';

/**
 * Coordenadas ortográficas del par SBS. Los desplazamientos se expresan como
 * porcentajes del tamaño renderizado de UN ojo, incluida su escala: así la
 * corrección conserva su relación con la fotografía al rotar o redimensionar.
 * renderedWidth/Height son píxeles CSS y permiten convertir ajustes antiguos.
 */
export function calculateImageLayout(config, sourceWidth, sourceHeight, viewportWidth, viewportHeight) {
  if (!Number.isInteger(sourceWidth) || sourceWidth < 2 || sourceWidth % 2 !== 0
    || !Number.isInteger(sourceHeight) || sourceHeight < 1) {
    throw new RangeError('La imagen SBS preparada debe tener dimensiones válidas y un ancho par.');
  }
  if (![viewportWidth, viewportHeight].every((value) => Number.isFinite(value) && value > 0)) {
    throw new RangeError('El tamaño del visor debe ser positivo.');
  }
  const params = { ...DEFAULT_CONFIG, ...config };
  if (!['scale', 'parallax', 'panX', 'panY', 'vertical'].every((key) => Number.isFinite(params[key]))
    || params.scale <= 0 || !['full', 'half'].includes(params.format)) {
    throw new RangeError('La configuración de encuadre no es válida.');
  }
  const eyeAspect = (sourceWidth / 2) / sourceHeight * (params.format === 'half' ? 2 : 1);
  const viewportAspect = (viewportWidth / 2) / viewportHeight;
  const fit = Math.min(1, viewportAspect / eyeAspect);
  const worldHeight = 2 * fit * (params.scale / 100);
  const worldWidth = worldHeight * eyeAspect;
  return {
    eyeAspect,
    viewportAspect,
    worldWidth,
    worldHeight,
    renderedWidth: worldWidth * viewportHeight / 2,
    renderedHeight: worldHeight * viewportHeight / 2,
    left: {
      x: worldWidth * (params.panX - params.parallax / 2) / 100,
      y: worldHeight * (-params.panY + params.vertical / 2) / 100,
    },
    right: {
      x: worldWidth * (params.panX + params.parallax / 2) / 100,
      y: worldHeight * (-params.panY - params.vertical / 2) / 100,
    },
  };
}
