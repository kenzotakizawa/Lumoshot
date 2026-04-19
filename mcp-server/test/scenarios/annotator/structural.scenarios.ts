import test from 'node:test';
import assert from 'node:assert/strict';
import type { AnnotatorHarness } from '../../helpers/annotator-harness.js';
import { ELEMENTS, IMG_H, IMG_W } from '../../helpers/annotator-harness.js';

export function registerAnnotatorStructuralScenarios(
  getHarness: () => AnnotatorHarness,
): void {
  test('crop annotation reduces image dimensions', async () => {
    const h = getHarness();
    const { buffer } = await h.applyAnnotations(
      h.basePng,
      [{ type: 'crop', ref: 1, padding: 20 }],
      ELEMENTS,
      'friendly',
    );
    const meta = await h.imgMeta(buffer);
    assert.ok((meta.width ?? IMG_W) < IMG_W, `crop width ${meta.width} should be less than ${IMG_W}`);
    assert.ok((meta.height ?? IMG_H) < IMG_H, `crop height ${meta.height} should be less than ${IMG_H}`);
  });

  test('crop annotation with explicit bbox', async () => {
    const h = getHarness();
    const { buffer } = await h.applyAnnotations(
      h.basePng,
      [{ type: 'crop', bbox: [200, 200, 300, 200] as [number, number, number, number] }],
      [],
      'neutral',
    );
    const meta = await h.imgMeta(buffer);
    assert.ok((meta.width ?? IMG_W) <= 300, 'crop to explicit bbox should limit width');
    assert.ok((meta.height ?? IMG_H) <= 200, 'crop to explicit bbox should limit height');
  });

  test('resize annotation produces the requested width', async () => {
    const h = getHarness();
    const targetWidth = 400;
    const { buffer } = await h.applyAnnotations(
      h.basePng,
      [{ type: 'resize', width: targetWidth }],
      [],
      'friendly',
    );
    const meta = await h.imgMeta(buffer);
    assert.equal(meta.width, targetWidth, `resized width must be ${targetWidth}`);
    assert.ok((meta.height ?? IMG_H) < IMG_H, 'resize should proportionally reduce height too');
  });

  test('os_frame (macos) annotation adds a title bar on top', async () => {
    const h = getHarness();
    const { buffer } = await h.applyAnnotations(
      h.basePng,
      [{ type: 'os_frame', style: 'macos' }],
      [],
      'friendly',
    );
    const meta = await h.imgMeta(buffer);
    assert.ok((meta.height ?? IMG_H) > IMG_H, `os_frame should increase image height (got ${meta.height})`);
    assert.equal(meta.width, IMG_W, 'os_frame should preserve image width');
  });

  test('os_frame (windows) annotation adds a title bar', async () => {
    const h = getHarness();
    const { buffer } = await h.applyAnnotations(
      h.basePng,
      [{ type: 'os_frame', style: 'windows' }],
      [],
      'neutral',
    );
    const meta = await h.imgMeta(buffer);
    assert.ok((meta.height ?? IMG_H) > IMG_H, 'windows os_frame should increase image height');
  });
}
