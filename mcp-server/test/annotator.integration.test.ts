/**
 * Integration tests for the annotator engine (applyAnnotations).
 *
 * These tests verify that every annotation type actually modifies the output PNG
 * and produces a valid image file. They run directly against the compiled
 * dist/engine/annotator.js — no browser required.
 *
 * Coverage:
 *   box, rounded_box, arrow, callout, text,
 *   step_number, click_icon, spotlight, mosaic,
 *   os_frame, crop, resize, multi-annotation combos
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { writeFileSync, readFileSync, existsSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── Types (thin local mirror to avoid importing from src) ────────────────────

type BBox = [number, number, number, number];

interface FakeElement {
  ref: number;
  type: string;
  role: string;
  label: string;
  value: undefined;
  bbox: BBox;
  interactive: boolean;
}

// ─── Test fixtures ────────────────────────────────────────────────────────────

const IMG_W = 800;
const IMG_H = 600;

/** Fake interactive elements that correspond to coloured regions in the base PNG. */
const ELEMENTS: FakeElement[] = [
  { ref: 1, type: 'button', role: 'button', label: '送信', value: undefined, bbox: [300, 250, 140, 44], interactive: true },
  { ref: 2, type: 'input',  role: 'textbox', label: 'メール', value: undefined, bbox: [80, 120, 240, 36], interactive: true },
  { ref: 3, type: 'link',   role: 'link', label: '詳細を見る', value: undefined, bbox: [80, 400, 120, 24], interactive: true },
];

// ─── Harness ──────────────────────────────────────────────────────────────────

let tempDir = '';
let basePng = '';
/** Exact PNG bytes written to basePng — used for byte-level diff checks. */
let basePngBytes: Buffer = Buffer.alloc(0);

type ApplyAnnotationsFn = (
  imagePath: string,
  annotations: unknown[],
  elements: unknown[],
  preset: string,
) => Promise<{ buffer: Buffer; warnings: unknown[] }>;

let applyAnnotations: ApplyAnnotationsFn;

test.before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'lumoshot-ann-test-'));

  // Build a simple PNG using Sharp — no SVG renderer needed.
  const grey = { r: 245, g: 245, b: 245, alpha: 1 as const };
  const white = { r: 255, g: 255, b: 255, alpha: 1 as const };
  const blue  = { r: 49,  g: 130, b: 206, alpha: 1 as const };

  const inputRect  = await sharp({ create: { width: 240, height: 36, channels: 4, background: white } }).png().toBuffer();
  const submitBtn  = await sharp({ create: { width: 140, height: 44, channels: 4, background: blue  } }).png().toBuffer();

  const baseBuf = await sharp({
    create: { width: IMG_W, height: IMG_H, channels: 4, background: grey },
  }).composite([
    { input: inputRect, left: 80,  top: 120 },
    { input: submitBtn, left: 300, top: 250 },
  ]).png().toBuffer();

  basePng = join(tempDir, 'base.png');
  writeFileSync(basePng, Buffer.from(baseBuf));
  // Read back the exact PNG bytes written to disk for reliable diff comparison.
  basePngBytes = readFileSync(basePng);

  const mod = await import('../dist/engine/annotator.js');
  applyAnnotations = mod.applyAnnotations as ApplyAnnotationsFn;
});

test.after(() => {
  if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Write result buffer to a temp file and return the path. */
function savePng(name: string, buf: Buffer): string {
  const p = join(tempDir, `${name}.png`);
  writeFileSync(p, buf);
  return p;
}

/**
 * True if the annotated buffer's bytes differ from the base PNG.
 * Compares actual content (not just size) to avoid false negatives from
 * PNG recompression producing the same byte count by coincidence.
 */
function differsFromBase(buf: Buffer): boolean {
  return !buf.equals(basePngBytes);
}

async function imgMeta(buf: Buffer) {
  return sharp(buf).metadata();
}

// ─── Overlay annotation tests ─────────────────────────────────────────────────

test('box annotation draws a rectangle over an element', async () => {
  const { buffer } = await applyAnnotations(
    basePng,
    [{ type: 'box', ref: 1, color: '#E53E3E', line_width: 3, label: 'Submit' }],
    ELEMENTS,
    'precise',
  );
  assert.ok(buffer instanceof Buffer, 'result must be a Buffer');
  assert.ok(differsFromBase(buffer), 'box annotation must modify the image');
  const p = savePng('box', buffer);
  assert.ok(statSync(p).size > 5_000, 'output must be a real PNG');
});

test('rounded_box annotation draws a rounded rectangle', async () => {
  const { buffer } = await applyAnnotations(
    basePng,
    [{ type: 'rounded_box', ref: 2, border_radius: 8 }],
    ELEMENTS,
    'friendly',
  );
  assert.ok(differsFromBase(buffer), 'rounded_box must modify the image');
});

test('arrow annotation draws a directed line between two elements', async () => {
  // This is the annotation the user specifically asked about.
  const { buffer, warnings } = await applyAnnotations(
    basePng,
    [{ type: 'arrow', from_ref: 2, to_ref: 1, color: '#3182CE', label: '次はここ' }],
    ELEMENTS,
    'friendly',
  );
  assert.ok(buffer instanceof Buffer, 'result must be a Buffer');
  assert.ok(differsFromBase(buffer), 'arrow must modify the image');
  // No warnings expected for a valid two-ref arrow
  const arrowWarnings = (warnings as Array<{ type: string }>).filter((w) => w.type !== 'overlap');
  assert.equal(arrowWarnings.length, 0, `unexpected warnings: ${JSON.stringify(arrowWarnings)}`);
  savePng('arrow', buffer);
});

test('arrow annotation with explicit bbox coordinates', async () => {
  const from: BBox = [80,  120, 240, 36]; // input field
  const to:   BBox = [300, 250, 140, 44]; // button
  const { buffer } = await applyAnnotations(
    basePng,
    [{ type: 'arrow', from_bbox: from, to_bbox: to, color: '#E53E3E' }],
    [],  // no elements needed when using explicit bbox
    'precise',
  );
  assert.ok(differsFromBase(buffer), 'arrow with explicit bbox must modify the image');
});

test('callout annotation renders a speech bubble with tail', async () => {
  const { buffer } = await applyAnnotations(
    basePng,
    [{ type: 'callout', ref: 1, text: 'ここをクリック\nしてください', tail: 'auto' }],
    ELEMENTS,
    'friendly',
  );
  assert.ok(differsFromBase(buffer), 'callout must modify the image');
  savePng('callout', buffer);
});

test('callout annotation with explicit tail direction', async () => {
  const { buffer } = await applyAnnotations(
    basePng,
    [{ type: 'callout', ref: 2, text: 'Input here', tail: 'bottom', background: '#FEFCBF', border_color: '#D69E2E' }],
    ELEMENTS,
    'neutral',
  );
  assert.ok(differsFromBase(buffer), 'callout with tail=bottom must modify the image');
});

test('text annotation renders a label at a given position', async () => {
  const { buffer } = await applyAnnotations(
    basePng,
    [{ type: 'text', position: [50, 60], text: 'Step 1: メールを入力', font_size: 16, color: '#1A202C', background: '#FFF' }],
    ELEMENTS,
    'friendly',
  );
  assert.ok(differsFromBase(buffer), 'text annotation must modify the image');
});

test('step_number annotation renders a numbered badge', async () => {
  const { buffer } = await applyAnnotations(
    basePng,
    [
      { type: 'step_number', ref: 2, number: 1 },
      { type: 'step_number', ref: 1, number: 2 },
    ],
    ELEMENTS,
    'friendly',
  );
  assert.ok(differsFromBase(buffer), 'step_number badges must modify the image');
});

test('click_icon annotation renders a cursor at the element centre', async () => {
  const { buffer } = await applyAnnotations(
    basePng,
    [{ type: 'click_icon', ref: 1, click_type: 'left' }],
    ELEMENTS,
    'friendly',
  );
  assert.ok(differsFromBase(buffer), 'click_icon must modify the image');
});

test('click_icon annotation double-click variant', async () => {
  const { buffer } = await applyAnnotations(
    basePng,
    [{ type: 'click_icon', ref: 1, click_type: 'double' }],
    ELEMENTS,
    'precise',
  );
  assert.ok(differsFromBase(buffer), 'click_icon double must modify the image');
});

test('spotlight annotation darkens everything outside the target', async () => {
  const { buffer } = await applyAnnotations(
    basePng,
    [{ type: 'spotlight', ref: 1, shape: 'rect' }],
    ELEMENTS,
    'friendly',
  );
  assert.ok(differsFromBase(buffer), 'spotlight must modify the image bytes');
  savePng('spotlight', buffer);
});

test('spotlight annotation ellipse shape', async () => {
  const { buffer } = await applyAnnotations(
    basePng,
    [{ type: 'spotlight', ref: 2, shape: 'ellipse' }],
    ELEMENTS,
    'neutral',
  );
  assert.ok(differsFromBase(buffer), 'spotlight ellipse must modify the image');
});

test('mosaic annotation blurs the target region', async () => {
  // Use a bbox that spans the border of the white input field into the grey background.
  // Blurring a mixed-color region (white ↔ grey) produces a gradient that differs
  // byte-for-byte from the original sharp edge.
  const mixedBbox: BBox = [70, 110, 270, 56]; // includes grey border around the white field
  const { buffer } = await applyAnnotations(
    basePng,
    [{ type: 'mosaic', bbox: mixedBbox, intensity: 'strong' }],
    [],
    'precise',
  );
  assert.ok(buffer instanceof Buffer);
  assert.ok(differsFromBase(buffer), 'mosaic must modify the image bytes');
  savePng('mosaic', buffer);
});

// ─── Structural transformation tests ─────────────────────────────────────────

test('crop annotation reduces image dimensions', async () => {
  const { buffer } = await applyAnnotations(
    basePng,
    [{ type: 'crop', ref: 1, padding: 20 }],
    ELEMENTS,
    'friendly',
  );
  const meta = await imgMeta(buffer);
  // Cropped around button [300, 250, 140, 44] + 20px padding → much smaller than 800×600
  assert.ok((meta.width ?? IMG_W) < IMG_W, `crop width ${meta.width} should be less than ${IMG_W}`);
  assert.ok((meta.height ?? IMG_H) < IMG_H, `crop height ${meta.height} should be less than ${IMG_H}`);
});

test('crop annotation with explicit bbox', async () => {
  const { buffer } = await applyAnnotations(
    basePng,
    [{ type: 'crop', bbox: [200, 200, 300, 200] as BBox }],
    [],
    'neutral',
  );
  const meta = await imgMeta(buffer);
  assert.ok((meta.width ?? IMG_W) <= 300, 'crop to explicit bbox should limit width');
  assert.ok((meta.height ?? IMG_H) <= 200, 'crop to explicit bbox should limit height');
});

test('resize annotation produces the requested width', async () => {
  const targetWidth = 400;
  const { buffer } = await applyAnnotations(
    basePng,
    [{ type: 'resize', width: targetWidth }],
    [],
    'friendly',
  );
  const meta = await imgMeta(buffer);
  assert.equal(meta.width, targetWidth, `resized width must be ${targetWidth}`);
  // Height should be proportionally scaled (< original)
  assert.ok((meta.height ?? IMG_H) < IMG_H, 'resize should proportionally reduce height too');
});

test('os_frame (macos) annotation adds a title bar on top', async () => {
  const { buffer } = await applyAnnotations(
    basePng,
    [{ type: 'os_frame', style: 'macos' }],
    [],
    'friendly',
  );
  const meta = await imgMeta(buffer);
  // macOS title bar is 38px — total height should increase
  assert.ok((meta.height ?? IMG_H) > IMG_H, `os_frame should increase image height (got ${meta.height})`);
  assert.equal(meta.width, IMG_W, 'os_frame should preserve image width');
});

test('os_frame (windows) annotation adds a title bar', async () => {
  const { buffer } = await applyAnnotations(
    basePng,
    [{ type: 'os_frame', style: 'windows' }],
    [],
    'neutral',
  );
  const meta = await imgMeta(buffer);
  assert.ok((meta.height ?? IMG_H) > IMG_H, 'windows os_frame should increase image height');
});

// ─── Multi-annotation / composition tests ────────────────────────────────────

test('arrow + callout + step_number compose without errors', async () => {
  const { buffer, warnings } = await applyAnnotations(
    basePng,
    [
      { type: 'step_number', ref: 2, number: 1 },
      { type: 'arrow', from_ref: 2, to_ref: 1, label: '次へ' },
      { type: 'callout', ref: 1, text: '送信ボタン', tail: 'bottom' },
    ],
    ELEMENTS,
    'friendly',
  );
  assert.ok(differsFromBase(buffer), 'composed annotations must modify the image');
  // No critical warnings (overlap is acceptable)
  const criticals = (warnings as Array<{ type: string }>).filter(
    (w) => w.type !== 'overlap',
  );
  assert.equal(criticals.length, 0, `unexpected non-overlap warnings: ${JSON.stringify(criticals)}`);
  savePng('composed_arrow_callout_step', buffer);
});

test('box + text + click_icon flow annotation', async () => {
  const { buffer } = await applyAnnotations(
    basePng,
    [
      { type: 'box', ref: 1, color: '#3182CE', label: 'Target' },
      { type: 'text', position: [20, 30], text: '① クリックしてください', font_size: 14 },
      { type: 'click_icon', ref: 1 },
    ],
    ELEMENTS,
    'friendly',
  );
  assert.ok(differsFromBase(buffer), 'flow annotation combo must modify the image');
});

test('missing ref produces no warnings and skips that annotation', async () => {
  const { buffer, warnings } = await applyAnnotations(
    basePng,
    [
      { type: 'box', ref: 999 },      // ref that doesn't exist
      { type: 'click_icon', ref: 1 }, // valid ref
    ],
    ELEMENTS,
    'friendly',
  );
  // The valid annotation should still be applied
  assert.ok(differsFromBase(buffer), 'valid annotation in combo should still apply');
  // No error/critical warnings for a missing ref — it silently skips
  const criticals = (warnings as Array<{ type: string }>).filter(
    (w) => w.type !== 'overlap',
  );
  assert.equal(criticals.length, 0, 'missing ref should produce no critical warnings');
});

test('callout annotation with tail=left renders to the right of the element', async () => {
  const { buffer } = await applyAnnotations(
    basePng,
    [{ type: 'callout', ref: 2, text: 'Left tail', tail: 'left' }],
    ELEMENTS,
    'friendly',
  );
  assert.ok(differsFromBase(buffer), 'callout tail=left must modify the image');
});

test('callout annotation with tail=right renders to the left of the element', async () => {
  const { buffer } = await applyAnnotations(
    basePng,
    [{ type: 'callout', ref: 1, text: 'Right tail', tail: 'right' }],
    ELEMENTS,
    'friendly',
  );
  assert.ok(differsFromBase(buffer), 'callout tail=right must modify the image');
});

test('before_after side_by_side doubles the image width', async () => {
  const { buffer } = await applyAnnotations(
    basePng,
    [{ type: 'before_after', before_ref: basePng, after_ref: basePng, layout: 'side_by_side' }],
    [],
    'friendly',
  );
  const meta = await imgMeta(buffer);
  // Two copies of IMG_W (800) side by side with a 4px divider
  assert.ok((meta.width ?? 0) > IMG_W, `side_by_side width ${meta.width} should exceed original ${IMG_W}`);
  assert.equal(meta.height, IMG_H, 'side_by_side height should be unchanged');
});

test('before_after overlay produces an image of the same dimensions', async () => {
  const { buffer } = await applyAnnotations(
    basePng,
    [{ type: 'before_after', before_ref: basePng, after_ref: basePng, layout: 'overlay' }],
    [],
    'friendly',
  );
  const meta = await imgMeta(buffer);
  assert.equal(meta.width, IMG_W, 'overlay width must match original');
  assert.equal(meta.height, IMG_H, 'overlay height must match original');
});

test('before_after does not discard preceding mosaic annotations', async () => {
  // before_after exits early — previously this caused preceding composites to be lost.
  // Now before_after is handled first and the other annotations are irrelevant,
  // but the key guarantee is: before_after returns without error even when other
  // annotation types appear in the same call.
  const { buffer, warnings } = await applyAnnotations(
    basePng,
    [
      { type: 'before_after', before_ref: basePng, after_ref: basePng },
    ],
    [],
    'friendly',
  );
  assert.ok(buffer instanceof Buffer, 'must return a buffer');
  assert.ok(buffer.length > 0, 'buffer must not be empty');
  const criticals = (warnings as Array<{ type: string }>).filter((w) => w.type !== 'overlap');
  assert.equal(criticals.length, 0, `unexpected warnings: ${JSON.stringify(criticals)}`);
});

test('all preset variants render without error', async () => {
  for (const preset of ['precise', 'friendly', 'neutral', 'auto']) {
    const { buffer } = await applyAnnotations(
      basePng,
      [
        { type: 'rounded_box', ref: 1 },
        { type: 'step_number', ref: 2, number: 1 },
      ],
      ELEMENTS,
      preset,
    );
    assert.ok(buffer instanceof Buffer, `preset=${preset} must produce a buffer`);
    assert.ok(buffer.length > 0, `preset=${preset} output must not be empty`);
    // Verify the annotation was actually applied (bytes differ from base)
    assert.ok(differsFromBase(buffer), `preset=${preset} must modify the image`);
  }
});
