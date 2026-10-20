// Traslaciones expresadas en porcentaje del tamaño visible de CADA ojo.
export const DEFAULT_CONFIG = Object.freeze({
  parallax: 0, scale: 100, panX: 0, panY: 0, vertical: 0, format: 'full', swap: false,
});
export const CONFIG_LIMITS = Object.freeze({
  parallax: [-15, 15], scale: [40, 180], panX: [-50, 50], panY: [-50, 50], vertical: [-10, 10],
});
export const DEFAULT_PREFERENCES = Object.freeze({ quality: 'auto' });
export const QUALITY_PROFILES = Object.freeze({
  economy: { pixels: 3_000_000, maxDimension: 3072 },
  auto: { pixels: 8_000_000, maxDimension: 4096 },
  sharp: { pixels: 16_000_000, maxDimension: 8192 },
});
export const MAX_FILE_BYTES = 30 * 1024 * 1024;
export const MAX_SOURCE_PIXELS = 40_000_000;
