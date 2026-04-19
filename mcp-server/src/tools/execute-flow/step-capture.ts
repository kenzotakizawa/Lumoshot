import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Page } from 'playwright';
import sharp from 'sharp';
import { buildFilename } from '../../engine/browser.js';
import { applyAnnotations } from '../../engine/annotation/pipeline.js';
import { resolveTheme } from '../../engine/annotation/presets.js';
import { config } from '../../config.js';
import { incrementUsage } from '../../license/license.js';
import type { Annotation, BoundingBox, InteractiveElement, Preset, StepResult, Theme } from '../../types.js';

export interface CaptureStepActionAnnotation {
  type: 'click_icon' | 'step_number';
  ref?: number;
  // Used when resolved via selector/label_query and ref is unavailable
  bbox?: BoundingBox;
  number?: number;
  color?: string;
  click_type?: 'left' | 'right' | 'double';
}

export interface CaptureStepOptions {
  page: Page;
  stepNumber: number;
  outputDir: string;
  elements: InteractiveElement[];
  preset: Preset;
  plan: 'free' | 'pro';
  actionAnnotation?: CaptureStepActionAnnotation;
  highlightRef?: number;
  description?: string;
  // Fallback when highlightRef is not in elements
  highlightBbox?: BoundingBox;
  outputFormat?: 'png' | 'jpeg';
  scale?: number;
  theme?: Theme;
  calloutStyle?: {
    background?: string;
    borderColor?: string;
    textColor?: string;
  };
}

export async function getPageMeta(page: Page): Promise<StepResult['meta']> {
  return {
    url: page.url(),
    viewport: page.viewportSize() ?? config.capture.default_viewport,
    captured_at: new Date().toISOString(),
    scroll_position: await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY })),
  };
}

export async function captureStep(options: CaptureStepOptions): Promise<string> {
  const {
    page,
    stepNumber,
    outputDir,
    elements,
    preset,
    plan,
    actionAnnotation,
    highlightRef,
    description,
    highlightBbox,
    outputFormat = 'png',
    scale = 1,
    theme,
    calloutStyle,
  } = options;

  const viewport = page.viewportSize() ?? config.capture.default_viewport;
  const rawBuf = await page.screenshot({
    type: outputFormat,
    ...(outputFormat === 'jpeg' ? { quality: 90 } : {}),
  });
  const rawFilename = buildFilename(`step_${String(stepNumber).padStart(2, '0')}_raw`, viewport, undefined, outputFormat);
  const rawPath = join(outputDir, 'raw', rawFilename);

  const rawDir = join(outputDir, 'raw');
  if (!existsSync(rawDir)) {
    mkdirSync(rawDir, { recursive: true });
  }
  writeFileSync(rawPath, rawBuf);

  const annotations: Annotation[] = elements
    .filter((el) => el.redacted)
    .map((el) => ({
      type: 'mosaic' as const,
      ref: el.ref,
      bbox: el.bbox,
      intensity: 'strong' as const,
    }));

  const themePrimary = theme ? (resolveTheme(theme)?.primary ?? '#E53E3E') : '#E53E3E';

  if (highlightRef != null) {
    annotations.push({ type: 'box' as const, ref: highlightRef, color: themePrimary, line_width: 2 });
    if (description) {
      annotations.push({
        type: 'callout' as const,
        ref: highlightRef,
        text: description,
        tail: 'auto',
        ...(calloutStyle?.background ? { background: calloutStyle.background } : {}),
        ...(calloutStyle?.borderColor ? { border_color: calloutStyle.borderColor } : {}),
        ...(calloutStyle?.textColor ? { text_color: calloutStyle.textColor } : {}),
      });
    }
  } else if (highlightBbox != null) {
    annotations.push({ type: 'box' as const, bbox: highlightBbox, color: themePrimary, line_width: 2 });
    if (description) {
      annotations.push({
        type: 'callout' as const,
        bbox: highlightBbox,
        text: description,
        tail: 'auto',
        ...(calloutStyle?.background ? { background: calloutStyle.background } : {}),
        ...(calloutStyle?.borderColor ? { border_color: calloutStyle.borderColor } : {}),
        ...(calloutStyle?.textColor ? { text_color: calloutStyle.textColor } : {}),
      });
    }
  }

  if (actionAnnotation) {
    if (actionAnnotation.type === 'click_icon') {
      const clickColor = actionAnnotation.color ?? themePrimary;
      if (actionAnnotation.ref != null) {
        annotations.push({
          type: 'click_icon' as const,
          ref: actionAnnotation.ref,
          color: clickColor,
          click_type: actionAnnotation.click_type ?? 'left',
        });
      } else if (actionAnnotation.bbox != null) {
        annotations.push({
          type: 'click_icon' as const,
          bbox: actionAnnotation.bbox,
          color: clickColor,
          click_type: actionAnnotation.click_type ?? 'left',
        });
      }
    } else if (actionAnnotation.type === 'step_number') {
      if (actionAnnotation.ref != null) {
        annotations.push({
          type: 'step_number' as const,
          ref: actionAnnotation.ref,
          number: actionAnnotation.number ?? stepNumber,
          ...(actionAnnotation.color ? { color: actionAnnotation.color } : {}),
        });
      } else if (actionAnnotation.bbox != null) {
        annotations.push({
          type: 'step_number' as const,
          bbox: actionAnnotation.bbox,
          number: actionAnnotation.number ?? stepNumber,
          ...(actionAnnotation.color ? { color: actionAnnotation.color } : {}),
        });
      }
    }
  }

  const dpr = config.capture.device_pixel_ratio;
  const { buffer: annotatedBaseBuffer } = await applyAnnotations(rawPath, annotations, elements, preset, { theme, dpr });

  if (!config.output.keep_raw) {
    try { unlinkSync(rawPath); } catch { /* best-effort cleanup */ }
  }

  let outputBuffer = Buffer.from(annotatedBaseBuffer);

  if (Math.abs(scale - 1) > 1e-6) {
    const meta = await sharp(outputBuffer).metadata();
    const baseWidth = meta.width ?? viewport.width;
    const width = Math.max(1, Math.round(baseWidth * scale));
    const resized = sharp(outputBuffer).resize({ width, kernel: 'lanczos3' });
    outputBuffer = outputFormat === 'jpeg'
      ? Buffer.from(await resized.jpeg({ quality: 90 }).toBuffer())
      : Buffer.from(await resized.png().toBuffer());
  } else if (outputFormat === 'jpeg') {
    outputBuffer = Buffer.from(await sharp(outputBuffer).jpeg({ quality: 90 }).toBuffer());
  }

  const filename = buildFilename(`step_${String(stepNumber).padStart(2, '0')}`, viewport, undefined, outputFormat);
  const outputPath = join(outputDir, filename);
  writeFileSync(outputPath, outputBuffer);
  incrementUsage(plan);
  return outputPath;
}
