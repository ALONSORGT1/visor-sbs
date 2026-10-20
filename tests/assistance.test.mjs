import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateVerticalAlignment, suggestFormat } from '../js/assistance.js';

const width = 160;
const height = 128;

function texture(seed = 37) {
  let state = seed;
  const image = new Uint8Array(width * height);
  for (let i = 0; i < image.length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    image[i] = state >>> 24;
  }
  return image;
}

function shift(image, dx, dy) {
  const result = new Uint8Array(image.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = x + dx; const sy = y + dy;
      if (sx >= 0 && sx < width && sy >= 0 && sy < height) result[y * width + x] = image[sy * width + sx];
    }
  }
  return result;
}

test('identical textured eyes yield a reliable neutral correction', () => {
  const image = texture();
  const result = estimateVerticalAlignment(image, image, width, height);
  assert.equal(result.reliable, true);
  assert.equal(result.verticalPercent, 0);
  assert.ok(result.matches >= 8);
});

test('vertical correction has the rendered-height percentage and L-up sign', () => {
  const image = texture();
  for (const [dx, dy] of [[13, 5], [-17, -4]]) {
    const result = estimateVerticalAlignment(image, shift(image, dx, dy), width, height);
    assert.equal(result.reliable, true);
    assert.equal(result.verticalPercent, dy / height * 100);
  }
});

test('different horizontal disparities at different depths keep vertical consensus', () => {
  const image = texture();
  const right = shift(image, 15, 3);
  const otherDepth = shift(image, -11, 3);
  for (let y = height / 2; y < height; y++) right.set(otherDepth.subarray(y * width, (y + 1) * width), y * width);
  const result = estimateVerticalAlignment(image, right, width, height);
  assert.equal(result.reliable, true);
  assert.equal(result.verticalPercent, 3 / height * 100);
});

test('flat images do not propose a correction', () => {
  const image = new Uint8Array(width * height).fill(128);
  const result = estimateVerticalAlignment(image, image, width, height);
  assert.equal(result.reliable, false);
  assert.equal(result.verticalPercent, 0);
});

test('repeated checker texture is ambiguous', () => {
  const image = Uint8Array.from({ length: width * height }, (_, i) => (((Math.floor(i / width) >> 3) + ((i % width) >> 3)) % 2) * 220);
  const result = estimateVerticalAlignment(image, shift(image, 8, 4), width, height);
  assert.equal(result.reliable, false);
  assert.equal(result.verticalPercent, 0);
});

test('conflicting vertical offsets cannot become a suggested calibration', () => {
  const image = texture();
  const right = shift(image, 7, 5);
  const otherOffset = shift(image, 7, -5);
  for (let y = height / 2; y < height; y++) right.set(otherOffset.subarray(y * width, (y + 1) * width), y * width);
  assert.equal(estimateVerticalAlignment(image, right, width, height).reliable, false);
});

test('unrelated images and invalid dimensions do not propose corrections', () => {
  assert.equal(estimateVerticalAlignment(texture(), texture(97), width, height).reliable, false);
  assert.equal(estimateVerticalAlignment([], [], 300, 200).reliable, false);
});

test('format dimensions remain ambiguous; filename hints remain suggestions', () => {
  assert.equal(suggestFormat(3840, 1080).format, null);
  assert.equal(suggestFormat(1920, 1080).ambiguous, true);
  assert.equal(suggestFormat(1920, 1080, 'my_half-sbs.jpg').format, 'half');
  assert.equal(suggestFormat(3840, 1080, 'my-full_sbs.jpg').format, 'full');
  assert.ok(suggestFormat(1920, 1080, 'HSBS.png').confidence < 1);
  assert.equal(suggestFormat(1920, 1080, 'HSBS FSBS.png').format, null);
  assert.equal(suggestFormat(1920, 1080, 'HSBS.png', 'full').format, 'full');
});
