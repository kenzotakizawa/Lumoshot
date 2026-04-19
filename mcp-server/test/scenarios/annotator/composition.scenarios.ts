import test from 'node:test';
import assert from 'node:assert/strict';
import type { AnnotatorHarness } from '../../helpers/annotator-harness.js';
import { ELEMENTS, IMG_H, IMG_W } from '../../helpers/annotator-harness.js';

export function registerAnnotatorCompositionScenarios(
  getHarness: () => AnnotatorHarness,
): void {
  test('arrow + callout + step_number compose without errors', async () => {
    const h = getHarness();
    const { buffer, warnings } = await h.applyAnnotations(
      h.basePng,
      [
        { type: 'step_number', ref: 2, number: 1 },
        { type: 'arrow', from_ref: 2, to_ref: 1, label: '次へ' },
        { type: 'callout', ref: 1, text: '送信ボタン', tail: 'bottom' },
      ],
      ELEMENTS,
      'friendly',
    );
    assert.ok(h.differsFromBase(buffer), 'composed annotations must modify the image');
    const criticals = (warnings as Array<{ type: string }>).filter((w) => w.type !== 'overlap');
    assert.equal(criticals.length, 0, `unexpected non-overlap warnings: ${JSON.stringify(criticals)}`);
    h.savePng('composed_arrow_callout_step', buffer);
  });

  test('box + text + click_icon flow annotation', async () => {
    const h = getHarness();
    const { buffer } = await h.applyAnnotations(
      h.basePng,
      [
        { type: 'box', ref: 1, color: '#3182CE', label: 'Target' },
        { type: 'text', position: [20, 30], text: '① クリックしてください', font_size: 14 },
        { type: 'click_icon', ref: 1 },
      ],
      ELEMENTS,
      'friendly',
    );
    assert.ok(h.differsFromBase(buffer), 'flow annotation combo must modify the image');
  });

  test('missing ref produces no warnings and skips that annotation', async () => {
    const h = getHarness();
    const { buffer, warnings } = await h.applyAnnotations(
      h.basePng,
      [
        { type: 'box', ref: 999 },
        { type: 'click_icon', ref: 1 },
      ],
      ELEMENTS,
      'friendly',
    );
    assert.ok(h.differsFromBase(buffer), 'valid annotation in combo should still apply');
    const criticals = (warnings as Array<{ type: string }>).filter((w) => w.type !== 'overlap');
    assert.equal(criticals.length, 0, 'missing ref should produce no critical warnings');
  });

  test('callout annotation with tail=left renders to the right of the element', async () => {
    const h = getHarness();
    const { buffer } = await h.applyAnnotations(
      h.basePng,
      [{ type: 'callout', ref: 2, text: 'Left tail', tail: 'left' }],
      ELEMENTS,
      'friendly',
    );
    assert.ok(h.differsFromBase(buffer), 'callout tail=left must modify the image');
  });

  test('callout annotation with tail=right renders to the left of the element', async () => {
    const h = getHarness();
    const { buffer } = await h.applyAnnotations(
      h.basePng,
      [{ type: 'callout', ref: 1, text: 'Right tail', tail: 'right' }],
      ELEMENTS,
      'friendly',
    );
    assert.ok(h.differsFromBase(buffer), 'callout tail=right must modify the image');
  });

  test('before_after side_by_side keeps original canvas size with labeled panels', async () => {
    // Design intent: side_by_side fits both panels *within* the original canvas dimensions
    // rather than doubling the output width. Each panel is scaled down to
    //   panelWidth = floor((canvasW - padding*2 - gap) / 2)
    // so the output image stays at IMG_W × IMG_H (same as the input).
    // This avoids producing oversized images when used inside tool pipelines.
    const h = getHarness();
    const { buffer } = await h.applyAnnotations(
      h.basePng,
      [{
        type: 'before_after',
        before_ref: h.basePng,
        after_ref: h.basePng,
        layout: 'side_by_side',
        before_label: 'Before',
        after_label: 'After',
      }],
      [],
      'friendly',
    );
    const meta = await h.imgMeta(buffer);
    assert.equal(meta.width, IMG_W, `side_by_side width should remain ${IMG_W}`);
    assert.equal(meta.height, IMG_H, `side_by_side height should remain ${IMG_H}`);
    assert.ok(h.differsFromBase(buffer), 'side_by_side output should differ from the base image');
  });

  test('before_after overlay produces an image of the same dimensions', async () => {
    const h = getHarness();
    const { buffer } = await h.applyAnnotations(
      h.basePng,
      [{ type: 'before_after', before_ref: h.basePng, after_ref: h.basePng, layout: 'overlay' }],
      [],
      'friendly',
    );
    const meta = await h.imgMeta(buffer);
    assert.equal(meta.width, IMG_W, 'overlay width must match original');
    assert.equal(meta.height, IMG_H, 'overlay height must match original');
  });

  test('before_after does not discard preceding mosaic annotations', async () => {
    const h = getHarness();
    const { buffer, warnings } = await h.applyAnnotations(
      h.basePng,
      [{ type: 'before_after', before_ref: h.basePng, after_ref: h.basePng }],
      [],
      'friendly',
    );
    assert.ok(buffer instanceof Buffer, 'must return a buffer');
    assert.ok(buffer.length > 0, 'buffer must not be empty');
    const criticals = (warnings as Array<{ type: string }>).filter((w) => w.type !== 'overlap');
    assert.equal(criticals.length, 0, `unexpected warnings: ${JSON.stringify(criticals)}`);
  });

  test('all preset variants render without error', async () => {
    const h = getHarness();
    for (const preset of ['precise', 'friendly', 'neutral', 'auto']) {
      const { buffer } = await h.applyAnnotations(
        h.basePng,
        [
          { type: 'rounded_box', ref: 1 },
          { type: 'step_number', ref: 2, number: 1 },
        ],
        ELEMENTS,
        preset,
      );
      assert.ok(buffer instanceof Buffer, `preset=${preset} must produce a buffer`);
      assert.ok(buffer.length > 0, `preset=${preset} output must not be empty`);
      assert.ok(h.differsFromBase(buffer), `preset=${preset} must modify the image`);
    }
  });
}
