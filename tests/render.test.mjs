import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateImageLayout } from '../js/layout.js';
import { DEFAULT_CONFIG } from '../js/settings.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} ≈ ${expected}`);

test('el encuadre neutro contiene cada ojo sin deformarlo', () => {
  for (const [width, height] of [[1200, 600], [390, 844], [844, 390], [3840, 2160]]) {
    const layout = calculateImageLayout(DEFAULT_CONFIG, 2400, 800, width, height);
    assert.ok(layout.renderedWidth <= width / 2 + 1e-10);
    assert.ok(layout.renderedHeight <= height + 1e-10);
    near(layout.renderedWidth / layout.renderedHeight, 1.5);
    assert.deepEqual(layout.left, { x: 0, y: 0 });
    assert.deepEqual(layout.right, { x: 0, y: -0 });
  }
});

test('Half-SBS restaura exactamente el doble de aspecto horizontal por ojo', () => {
  const full = calculateImageLayout(DEFAULT_CONFIG, 1920, 1080, 1600, 900);
  const half = calculateImageLayout({ ...DEFAULT_CONFIG, format: 'half' }, 1920, 1080, 1600, 900);
  near(half.eyeAspect, full.eyeAspect * 2);
  near(half.renderedWidth / half.renderedHeight, 16 / 9);
});

test('paralaje, vertical y encuadre conservan sus porcentajes al redimensionar, rotar o escalar', () => {
  for (const [width, height] of [[1200, 600], [390, 844], [844, 390]]) {
    for (const scale of [40, 100, 180]) {
      const layout = calculateImageLayout({
        ...DEFAULT_CONFIG, parallax: 6, vertical: 2, panX: 10, panY: 4, scale,
      }, 3000, 1000, width, height);
      near((layout.right.x - layout.left.x) / layout.worldWidth, 0.06);
      near((layout.left.y - layout.right.y) / layout.worldHeight, 0.02);
      near((layout.left.x + layout.right.x) / 2 / layout.worldWidth, 0.10);
      near((layout.left.y + layout.right.y) / 2 / layout.worldHeight, -0.04);
    }
  }
});

test('la escala multiplica tamaño y correcciones conjuntamente', () => {
  const config = { ...DEFAULT_CONFIG, panX: 8, panY: 3, parallax: -5, vertical: -2 };
  const original = calculateImageLayout(config, 2000, 800, 1200, 600);
  const enlarged = calculateImageLayout({ ...config, scale: 150 }, 2000, 800, 1200, 600);
  for (const key of ['worldWidth', 'worldHeight', 'renderedWidth', 'renderedHeight']) {
    near(enlarged[key], original[key] * 1.5);
  }
  near(enlarged.left.x, original.left.x * 1.5);
  near(enlarged.right.y, original.right.y * 1.5);
});

test('mantiene signos de corrección y el intercambio no cambia el encuadre', () => {
  const config = { ...DEFAULT_CONFIG, parallax: 4, vertical: 4 };
  const layout = calculateImageLayout(config, 2000, 800, 1200, 600);
  assert.ok(layout.left.x < 0 && layout.right.x > 0);
  assert.ok(layout.left.y > 0 && layout.right.y < 0);
  assert.deepEqual(calculateImageLayout({ ...config, swap: true }, 2000, 800, 1200, 600), layout);
});

test('rechaza dimensiones impares o inválidas antes de sustituir recursos del visor', () => {
  for (const [width, height] of [[2001, 800], [0, 800], [2000, 0], [2000, Infinity], [2.5, 3]]) {
    assert.throws(() => calculateImageLayout(DEFAULT_CONFIG, width, height, 1200, 600), RangeError);
  }
  assert.throws(() => calculateImageLayout(DEFAULT_CONFIG, 2000, 800, 0, 600), RangeError);
  assert.throws(() => calculateImageLayout({ scale: NaN }, 2000, 800, 1200, 600), RangeError);
});
