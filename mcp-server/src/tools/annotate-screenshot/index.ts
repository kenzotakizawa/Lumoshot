import { writeFileSync } from 'fs';
import { join, resolve, dirname, basename, extname } from 'path';
import { z } from 'zod';
import sharp from 'sharp';
import { applyAnnotations } from '../../engine/annotation/pipeline.js';
import { config } from '../../config.js';
import { checkLicense, isPremiumFeature } from '../../license/license.js';
import { resolveScreenshotRef as resolveScreenshotRefAlias } from '../../domain/output/screenshot-ref.js';
import { getCjkFontWarning } from '../../domain/diagnostics/cjk-font.js';
import type { Annotation, AnnotateResult, Preset, Theme } from '../../types.js';
import { detectOverlapWarnings } from './resolver.js';

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
    elbow: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('callout'),
    ref: z.number().optional(),
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    text: z.string(),
    tail: z.enum(['auto', 'top', 'bottom', 'left', 'right']).optional(),
    background: z.string().optional(),
    border_color: z.string().optional(),
    text_color: z.string().optional(),
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
    color: z.string().optional(),
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
    before_label: z.string().optional(),
    after_label: z.string().optional(),
  }),
]);

export const AnnotateScreenshotInputSchema = z.object({
  screenshot_ref: z.string(), // step_NN alias or absolute file path
  annotations: z.array(AnnotationSchema),
  preset: z.enum(['auto', 'precise', 'friendly', 'neutral']).optional().default('auto'),
  theme: z.enum(['red', 'blue', 'mono']).optional(),
  output_format: z.enum(['png', 'jpeg']).optional().default('png'),
  scale: z.number().positive().max(4).optional().default(1),
  // Elements from a prior capture_page call, serialized as JSON
  elements_json: z.string().optional(),
});

export type AnnotateScreenshotInput = z.infer<typeof AnnotateScreenshotInputSchema>;

// ─── Implementation ───────────────────────────────────────────────────────────

function collectAnnotationTextSamples(annotations: Annotation[]): string[] {
  const samples: string[] = [];
  for (const annotation of annotations) {
    switch (annotation.type) {
      case 'callout':
      case 'text':
        samples.push(annotation.text);
        break;
      case 'box':
      case 'arrow':
        if (annotation.label) {
          samples.push(annotation.label);
        }
        break;
      case 'before_after':
        if (annotation.before_label) {
          samples.push(annotation.before_label);
        }
        if (annotation.after_label) {
          samples.push(annotation.after_label);
        }
        break;
      default:
        break;
    }
  }
  return samples;
}

function formatCjkFontWarningMessage(
  warning: NonNullable<ReturnType<typeof getCjkFontWarning>>,
): string {
  if (!warning.install_command) {
    return warning.message;
  }
  return `${warning.message} Install command (${warning.diagnosis.os}): ${warning.install_command}`;
}

export async function annotateScreenshot(input: AnnotateScreenshotInput): Promise<AnnotateResult> {
  const licenseStatus = await checkLicense(process.env.LUMOSHOT_LICENSE_KEY);
  if (!licenseStatus.valid) {
    throw new Error('License is invalid or expired. Please verify your license key.');
  }

  const outputDir = resolve(config.output.directory);
  const imagePath = resolveScreenshotRefAlias(input.screenshot_ref, { outputDirectory: outputDir });

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
  const theme: Theme | undefined = input.theme as Theme | undefined;
  const annotations = input.annotations as unknown as Annotation[];

  const hasPremiumFeature = annotations.some((ann) => isPremiumFeature(ann.type));
  if (hasPremiumFeature && licenseStatus.plan !== 'pro') {
    throw new Error('This annotation type is a Pro feature. Upgrade to Pro to use it.');
  }

  const resolvedAnnotations = annotations.map((ann) => {
    if (ann.type !== 'before_after') return ann;
    return {
      ...ann,
      before_ref: resolveScreenshotRefAlias(ann.before_ref, { outputDirectory: outputDir }),
      after_ref: resolveScreenshotRefAlias(ann.after_ref, { outputDirectory: outputDir }),
    };
  }) as Annotation[];

  const dpr = config.capture.device_pixel_ratio;
  const { buffer, warnings } = await applyAnnotations(
    imagePath,
    resolvedAnnotations,
    elements as unknown as Parameters<typeof applyAnnotations>[2],
    preset,
    { theme, dpr }
  );
  const overlapWarnings = detectOverlapWarnings(resolvedAnnotations, elements);
  const cjkFontWarning = getCjkFontWarning({
    textSamples: collectAnnotationTextSamples(resolvedAnnotations),
  });

  let outputBuffer = Buffer.from(buffer);
  const outputFormat = input.output_format ?? 'png';
  const scale = input.scale ?? 1;

  if (Math.abs(scale - 1) > 1e-6) {
    const meta = await sharp(outputBuffer).metadata();
    const baseWidth = meta.width ?? 1280;
    const resizedWidth = Math.max(1, Math.round(baseWidth * scale));
    const resized = sharp(outputBuffer).resize({ width: resizedWidth, kernel: 'lanczos3' });
    outputBuffer = outputFormat === 'jpeg'
      ? Buffer.from(await resized.jpeg({ quality: 90 }).toBuffer())
      : Buffer.from(await resized.png().toBuffer());
  } else if (outputFormat === 'jpeg') {
    outputBuffer = Buffer.from(await sharp(outputBuffer).jpeg({ quality: 90 }).toBuffer());
  }

  // Write annotated image alongside the original
  const sourceExt = extname(imagePath);
  const base = basename(imagePath, sourceExt);
  const dir = dirname(imagePath);
  const outputPath = join(dir, `${base}_annotated${outputFormat === 'jpeg' ? '.jpg' : '.png'}`);
  writeFileSync(outputPath, outputBuffer);

  return {
    screenshot: outputPath,
    annotations_applied: resolvedAnnotations.length - warnings.length,
    warnings: [
      ...warnings,
      ...overlapWarnings,
      ...(cjkFontWarning
        ? [{ type: 'font_missing_cjk', message: formatCjkFontWarningMessage(cjkFontWarning) }]
        : []),
    ],
  };
}
