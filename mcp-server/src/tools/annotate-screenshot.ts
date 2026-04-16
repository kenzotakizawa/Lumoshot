import { existsSync, writeFileSync, readdirSync } from 'fs';
import { join, resolve, dirname, basename, extname } from 'path';
import { z } from 'zod';
import { applyAnnotations } from '../engine/annotator.js';
import { config } from '../config.js';
import { checkLicense, isPremiumFeature } from '../license/license.js';
import type { Annotation, AnnotateResult, Preset } from '../types.js';

// ─── Input schema ─────────────────────────────────────────────────────────────

const AnnotationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('box'),
    ref: z.number().optional(),
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    color: z.string().optional(),
    line_width: z.number().optional(),
    label: z.string().optional(),
  }),
  z.object({
    type: z.literal('rounded_box'),
    ref: z.number().optional(),
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    color: z.string().optional(),
    border_radius: z.number().optional(),
  }),
  z.object({
    type: z.literal('arrow'),
    from_ref: z.number().optional(),
    to_ref: z.number().optional(),
    from_bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    to_bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    color: z.string().optional(),
    label: z.string().optional(),
  }),
  z.object({
    type: z.literal('callout'),
    ref: z.number().optional(),
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    text: z.string(),
    tail: z.enum(['auto', 'top', 'bottom', 'left', 'right']).optional(),
    background: z.string().optional(),
    border_color: z.string().optional(),
  }),
  z.object({
    type: z.literal('text'),
    position: z.tuple([z.number(), z.number()]),
    text: z.string(),
    font_size: z.number().optional(),
    color: z.string().optional(),
    background: z.string().optional(),
  }),
  z.object({
    type: z.literal('step_number'),
    ref: z.number().optional(),
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    number: z.number(),
    color: z.string().optional(),
  }),
  z.object({
    type: z.literal('click_icon'),
    ref: z.number().optional(),
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    click_type: z.enum(['left', 'right', 'double']).optional(),
  }),
  z.object({
    type: z.literal('spotlight'),
    ref: z.number().optional(),
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    shape: z.enum(['auto', 'rect', 'ellipse']).optional(),
  }),
  z.object({
    type: z.literal('mosaic'),
    ref: z.number().optional(),
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    intensity: z.enum(['light', 'medium', 'strong']).optional(),
  }),
  z.object({
    type: z.literal('os_frame'),
    style: z.enum(['auto', 'macos', 'windows', 'linux']).optional(),
  }),
  z.object({
    type: z.literal('crop'),
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    ref: z.number().optional(),
    padding: z.number().optional(),
  }),
  z.object({
    type: z.literal('resize'),
    width: z.number(),
  }),
  z.object({
    type: z.literal('before_after'),
    before_ref: z.string(),
    after_ref: z.string(),
    layout: z.enum(['side_by_side', 'overlay']).optional(),
  }),
]);

export const AnnotateScreenshotInputSchema = z.object({
  screenshot_ref: z.string(), // step_NN alias or absolute file path
  annotations: z.array(AnnotationSchema),
  preset: z.enum(['auto', 'precise', 'friendly', 'neutral']).optional().default('auto'),
  // Elements from a prior capture_page call, serialized as JSON
  elements_json: z.string().optional(),
});

export type AnnotateScreenshotInput = z.infer<typeof AnnotateScreenshotInputSchema>;

type BBox = [number, number, number, number];

function bboxFromRef(
  ref: number | undefined,
  elements: Array<{ ref: number; bbox: BBox; [k: string]: unknown }>
): BBox | null {
  if (ref == null) return null;
  const found = elements.find((el) => el.ref === ref);
  return found?.bbox ?? null;
}

function resolveAnnotationBBox(
  annotation: Annotation,
  elements: Array<{ ref: number; bbox: BBox; [k: string]: unknown }>
): BBox | null {
  switch (annotation.type) {
    case 'box':
    case 'rounded_box':
    case 'callout':
    case 'step_number':
    case 'click_icon':
    case 'spotlight':
    case 'mosaic':
    case 'crop':
      return annotation.bbox ?? bboxFromRef(annotation.ref, elements);
    case 'arrow': {
      const from = annotation.from_bbox ?? bboxFromRef(annotation.from_ref, elements);
      const to = annotation.to_bbox ?? bboxFromRef(annotation.to_ref, elements);
      if (!from || !to) return null;
      const left = Math.min(from[0], to[0]);
      const top = Math.min(from[1], to[1]);
      const right = Math.max(from[0] + from[2], to[0] + to[2]);
      const bottom = Math.max(from[1] + from[3], to[1] + to[3]);
      return [left, top, right - left, bottom - top];
    }
    case 'text': {
      const fontSize = annotation.font_size ?? 14;
      const width = Math.max(60, annotation.text.length * Math.max(6, fontSize * 0.6));
      const height = fontSize + 10;
      return [annotation.position[0], annotation.position[1] - fontSize, width, height];
    }
    case 'resize':
    case 'os_frame':
    case 'before_after':
      return null;
  }
}

function overlaps(a: BBox, b: BBox): boolean {
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function detectOverlapWarnings(
  annotations: Annotation[],
  elements: Array<{ ref: number; bbox: BBox; [k: string]: unknown }>
): AnnotateResult['warnings'] {
  const warnings: AnnotateResult['warnings'] = [];
  const seen = new Set<string>();

  for (let i = 0; i < annotations.length; i++) {
    const a = annotations[i];
    const boxA = resolveAnnotationBBox(a, elements);
    if (!boxA) continue;

    for (let j = i + 1; j < annotations.length; j++) {
      const b = annotations[j];
      const boxB = resolveAnnotationBBox(b, elements);
      if (!boxB || !overlaps(boxA, boxB)) continue;

      const key = `${i}:${j}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const refs: number[] = [];
      if ('ref' in a && typeof a.ref === 'number') refs.push(a.ref);
      if ('ref' in b && typeof b.ref === 'number') refs.push(b.ref);

      warnings.push({
        type: 'overlap',
        ...(refs.length > 0 ? { refs } : {}),
        message: `Annotations ${i + 1} and ${j + 1} overlap. Positions may be adjusted automatically.`,
      });
    }
  }

  return warnings;
}

// ─── Helper: resolve screenshot ref to absolute path ─────────────────────────

function resolveScreenshotRef(ref: string): string {
  // If it looks like "step_02" expand to the output dir
  if (/^step_\d+$/.test(ref)) {
    const outputDir = resolve(config.output.directory);
    // Find first matching file
    const files: string[] = readdirSync(outputDir);
    const match = files.find((f: string) => f.startsWith(ref) && f.endsWith('.png'));
    if (match) return join(outputDir, match);
    throw new Error(`No screenshot found for ref "${ref}" in ${outputDir}`);
  }
  // Otherwise treat as absolute/relative path
  const abs = resolve(ref);
  if (!existsSync(abs)) throw new Error(`Screenshot not found: ${abs}`);
  return abs;
}

// ─── Implementation ───────────────────────────────────────────────────────────

export async function annotateScreenshot(input: AnnotateScreenshotInput): Promise<AnnotateResult> {
  const licenseStatus = await checkLicense(process.env.LUMOSHOT_LICENSE_KEY);
  if (!licenseStatus.valid) {
    throw new Error('License is invalid or expired. Please verify your license key.');
  }

  const imagePath = resolveScreenshotRef(input.screenshot_ref);

  // Deserialize elements if provided
  let elements: Array<{ ref: number; bbox: [number, number, number, number]; [k: string]: unknown }> = [];
  if (input.elements_json) {
    try {
      elements = JSON.parse(input.elements_json);
    } catch {
      // ignore parse errors
    }
  }

  const preset: Preset = (input.preset as Preset) ?? config.capture.default_preset;
  const annotations = input.annotations as unknown as Annotation[];

  const hasPremiumFeature = annotations.some((ann) => isPremiumFeature(ann.type));
  if (hasPremiumFeature && licenseStatus.plan !== 'pro') {
    throw new Error('This annotation type is a Pro feature. Upgrade to Pro to use it.');
  }

  const resolvedAnnotations = annotations.map((ann) => {
    if (ann.type !== 'before_after') return ann;
    return {
      ...ann,
      before_ref: resolveScreenshotRef(ann.before_ref),
      after_ref: resolveScreenshotRef(ann.after_ref),
    };
  }) as Annotation[];

  const { buffer, warnings } = await applyAnnotations(
    imagePath,
    resolvedAnnotations,
    elements as unknown as Parameters<typeof applyAnnotations>[2],
    preset
  );
  const overlapWarnings = detectOverlapWarnings(resolvedAnnotations, elements);

  // Write annotated image alongside the original
  const ext = extname(imagePath);
  const base = basename(imagePath, ext);
  const dir = dirname(imagePath);
  const outputPath = join(dir, `${base}_annotated${ext}`);
  writeFileSync(outputPath, buffer);

  return {
    screenshot: outputPath,
    annotations_applied: resolvedAnnotations.length - warnings.length,
    warnings: [...warnings, ...overlapWarnings],
  };
}
