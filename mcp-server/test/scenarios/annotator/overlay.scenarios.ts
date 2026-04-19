import test from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import sharp from 'sharp';
import type { AnnotatorHarness, BBox } from '../../helpers/annotator-harness.js';
import { ELEMENTS } from '../../helpers/annotator-harness.js';

// ─── Pixel assertion thresholds ───────────────────────────────────────────────
// Tuned for the harness base image (IMG_W × IMG_H solid-color canvas).
// Adjust if the base image dimensions or background color change.
const MIN_RED_CALLOUT_PIXELS = 2_000; // filled-red callout balloon must cover this many pixels

export function registerAnnotatorOverlayScenarios(
  getHarness: () => AnnotatorHarness,
): void {
  test('box annotation draws a rectangle over an element', async () => {
    const h = getHarness();
    const { buffer } = await h.applyAnnotations(
      h.basePng,
      [{ type: 'box', ref: 1, color: '#E53E3E', line_width: 3, label: 'Submit' }],
      ELEMENTS,
      'precise',
    );
    assert.ok(buffer instanceof Buffer, 'result must be a Buffer');
    assert.ok(h.differsFromBase(buffer), 'box annotation must modify the image');
    const p = h.savePng('box', buffer);
    assert.ok(statSync(p).size > 5_000, 'output must be a real PNG');
  });

  test('rounded_box annotation draws a rounded rectangle', async () => {
    const h = getHarness();
    const { buffer } = await h.applyAnnotations(
      h.basePng,
      [{ type: 'rounded_box', ref: 2, border_radius: 8 }],
      ELEMENTS,
      'friendly',
    );
    assert.ok(h.differsFromBase(buffer), 'rounded_box must modify the image');
  });

  test('identical box annotations are offset outward and report adjustment warning', async () => {
    const h = getHarness();
    const { buffer, warnings } = await h.applyAnnotations(
      h.basePng,
      [
        { type: 'box', ref: 1, color: '#E53E3E', line_width: 2 },
        { type: 'box', ref: 1, color: '#E53E3E', line_width: 2 },
      ],
      ELEMENTS,
      'precise',
    );

    assert.ok(h.differsFromBase(buffer), 'stacked boxes must modify the image');

    const adjusted = (warnings as Array<{
      type: string;
      adjusted?: boolean;
      from?: { bbox?: BBox };
      to?: { bbox?: BBox };
    }>).find((w) =>
      w.type === 'annotation_adjusted'
      && w.adjusted === true
      && !!w.from?.bbox
      && !!w.to?.bbox
      && (w.from!.bbox![0] !== w.to!.bbox![0] || w.from!.bbox![1] !== w.to!.bbox![1]),
    );

    assert.ok(adjusted, 'at least one box should be offset and reported as adjusted');
  });

  test('arrow annotation draws a directed line between two elements', async () => {
    const h = getHarness();
    const { buffer, warnings } = await h.applyAnnotations(
      h.basePng,
      [{ type: 'arrow', from_ref: 2, to_ref: 1, color: '#3182CE', label: '次はここ' }],
      ELEMENTS,
      'friendly',
    );
    assert.ok(buffer instanceof Buffer, 'result must be a Buffer');
    assert.ok(h.differsFromBase(buffer), 'arrow must modify the image');
    const arrowWarnings = (warnings as Array<{ type: string }>).filter((w) => w.type !== 'overlap');
    assert.equal(arrowWarnings.length, 0, `unexpected warnings: ${JSON.stringify(arrowWarnings)}`);
    h.savePng('arrow', buffer);
  });

  test('arrow annotation supports elbow routing', async () => {
    const h = getHarness();
    const { buffer, warnings } = await h.applyAnnotations(
      h.basePng,
      [{ type: 'arrow', from_ref: 2, to_ref: 1, color: '#E53E3E', label: 'elbow path', elbow: true }],
      ELEMENTS,
      'precise',
    );
    assert.ok(h.differsFromBase(buffer), 'elbow arrow must modify the image');
    const nonOverlapWarnings = (warnings as Array<{ type: string }>).filter((w) => w.type !== 'overlap');
    assert.equal(nonOverlapWarnings.length, 0, `unexpected warnings: ${JSON.stringify(nonOverlapWarnings)}`);
    h.savePng('arrow_elbow', buffer);
  });

  test('arrow annotation with explicit bbox coordinates', async () => {
    const h = getHarness();
    const from: BBox = [80, 120, 240, 36];
    const to: BBox = [300, 250, 140, 44];
    const { buffer } = await h.applyAnnotations(
      h.basePng,
      [{ type: 'arrow', from_bbox: from, to_bbox: to, color: '#E53E3E' }],
      [],
      'precise',
    );
    assert.ok(h.differsFromBase(buffer), 'arrow with explicit bbox must modify the image');
  });

  test('callout annotation renders a speech bubble with tail', async () => {
    const h = getHarness();
    const { buffer } = await h.applyAnnotations(
      h.basePng,
      [{ type: 'callout', ref: 1, text: 'ここをクリック\nしてください', tail: 'auto' }],
      ELEMENTS,
      'friendly',
    );
    assert.ok(h.differsFromBase(buffer), 'callout must modify the image');
    h.savePng('callout', buffer);
  });

  test('callout default style uses red-filled bubble for readability', async () => {
    const h = getHarness();
    const { buffer } = await h.applyAnnotations(
      h.basePng,
      [{ type: 'callout', ref: 1, text: 'デフォルト赤吹き出し', tail: 'auto' }],
      ELEMENTS,
      'friendly',
    );

    const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
    let redLikePixels = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      if (r >= 170 && g <= 110 && b <= 110) redLikePixels += 1;
    }
    assert.ok(redLikePixels > MIN_RED_CALLOUT_PIXELS, `expected red-filled callout pixels, got ${redLikePixels}`);
  });

  test('callout annotation with explicit tail direction', async () => {
    const h = getHarness();
    const { buffer } = await h.applyAnnotations(
      h.basePng,
      [{ type: 'callout', ref: 2, text: 'Input here', tail: 'bottom', background: '#FEFCBF', border_color: '#D69E2E' }],
      ELEMENTS,
      'neutral',
    );
    assert.ok(h.differsFromBase(buffer), 'callout with tail=bottom must modify the image');
  });

  test('callout auto placement adjusts when baseline would overlap and reports warning', async () => {
    const h = getHarness();
    const { buffer, warnings } = await h.applyAnnotations(
      h.basePng,
      [
        { type: 'callout', ref: 1, text: 'baseline blocker', tail: 'bottom' },
        { type: 'callout', ref: 1, text: 'auto needs adjustment', tail: 'auto' },
      ],
      ELEMENTS,
      'friendly',
    );

    assert.ok(h.differsFromBase(buffer), 'callout auto adjustment case must modify image');

    const adjusted = (warnings as Array<{
      type: string;
      adjusted?: boolean;
      from?: { tail?: string; bbox?: BBox };
      to?: { tail?: string; bbox?: BBox };
    }>).find((w) =>
      w.type === 'annotation_adjusted'
      && w.adjusted === true
      && !!w.from?.tail
      && !!w.to?.tail
      && (
        w.from!.tail !== w.to!.tail
        || (w.from!.bbox && w.to!.bbox
          && (w.from!.bbox[0] !== w.to!.bbox[0] || w.from!.bbox[1] !== w.to!.bbox[1]))
      ),
    );

    assert.ok(adjusted, 'auto callout should emit annotation_adjusted warning when repositioned');
  });

  test('text annotation renders a label at a given position', async () => {
    const h = getHarness();
    const { buffer } = await h.applyAnnotations(
      h.basePng,
      [{ type: 'text', position: [50, 60], text: 'Step 1: メールを入力', font_size: 16, color: '#1A202C', background: '#FFF' }],
      ELEMENTS,
      'friendly',
    );
    assert.ok(h.differsFromBase(buffer), 'text annotation must modify the image');
  });

  test('step_number annotation renders a numbered badge', async () => {
    const h = getHarness();
    const { buffer } = await h.applyAnnotations(
      h.basePng,
      [
        { type: 'step_number', ref: 2, number: 1 },
        { type: 'step_number', ref: 1, number: 2 },
      ],
      ELEMENTS,
      'friendly',
    );
    assert.ok(h.differsFromBase(buffer), 'step_number badges must modify the image');
  });

  test('step_number adjusts position when preferred spot overlaps with callout (T-8)', async () => {
    const h = getHarness();
    const { buffer, warnings } = await h.applyAnnotations(
      h.basePng,
      [
        { type: 'callout', ref: 1, text: 'preferred slot blocker', tail: 'left' },
        { type: 'step_number', ref: 1, number: 1 },
      ],
      ELEMENTS,
      'friendly',
    );
    assert.ok(h.differsFromBase(buffer), 'callout + step_number must modify image');

    const adjusted = (warnings as Array<{
      type: string;
      adjusted?: boolean;
      message?: string;
    }>).find((w) => w.type === 'annotation_adjusted' && w.adjusted === true && (w.message ?? '').includes('Step badge'));
    assert.ok(adjusted, 'step badge overlap should be auto-adjusted and reported');
  });

  test('click_icon annotation renders a cursor at the element centre', async () => {
    const h = getHarness();
    const { buffer } = await h.applyAnnotations(
      h.basePng,
      [{ type: 'click_icon', ref: 1, click_type: 'left' }],
      ELEMENTS,
      'friendly',
    );
    assert.ok(h.differsFromBase(buffer), 'click_icon must modify the image');
  });

  test('click_icon annotation double-click variant', async () => {
    const h = getHarness();
    const { buffer } = await h.applyAnnotations(
      h.basePng,
      [{ type: 'click_icon', ref: 1, click_type: 'double' }],
      ELEMENTS,
      'precise',
    );
    assert.ok(h.differsFromBase(buffer), 'click_icon double must modify the image');
  });

  test('spotlight annotation darkens everything outside the target', async () => {
    const h = getHarness();
    const { buffer } = await h.applyAnnotations(
      h.basePng,
      [{ type: 'spotlight', ref: 1, shape: 'rect' }],
      ELEMENTS,
      'friendly',
    );
    assert.ok(h.differsFromBase(buffer), 'spotlight must modify the image bytes');
    h.savePng('spotlight', buffer);
  });

  test('spotlight annotation ellipse shape', async () => {
    const h = getHarness();
    const { buffer } = await h.applyAnnotations(
      h.basePng,
      [{ type: 'spotlight', ref: 2, shape: 'ellipse' }],
      ELEMENTS,
      'neutral',
    );
    assert.ok(h.differsFromBase(buffer), 'spotlight ellipse must modify the image');
  });

  test('mosaic annotation blurs the target region', async () => {
    const h = getHarness();
    const mixedBbox: BBox = [70, 110, 270, 56];
    const { buffer } = await h.applyAnnotations(
      h.basePng,
      [{ type: 'mosaic', bbox: mixedBbox, intensity: 'strong' }],
      [],
      'precise',
    );
    assert.ok(buffer instanceof Buffer);
    assert.ok(h.differsFromBase(buffer), 'mosaic must modify the image bytes');
    h.savePng('mosaic', buffer);
  });
}
