import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import type { Page } from 'playwright';
import { buildFilename } from '../../engine/browser.js';
import { config } from '../../config.js';
import { applyAnnotations } from '../../engine/annotation/pipeline.js';
import type { Annotation, BoundingBox, InteractiveElement, Preset, StepResult, Theme } from '../../types.js';
import { incrementUsage } from '../../license/license.js';

export interface SummaryScreenshotOptions {
  page: Page;
  outputDir: string;
  steps: StepResult[];
  elements: InteractiveElement[];
  preset: Preset;
  plan: 'free' | 'pro';
  outputFormat?: 'png' | 'jpeg';
  scale?: number;
  theme?: Theme;
}

function isActionableStep(step: StepResult): boolean {
  if (step.status === 'error' || step.status === 'timeout') return false;
  return step.action === 'click' || step.action === 'fill' || step.action === 'select' || step.action === 'hover';
}

function resolveStepBbox(step: StepResult, elements: InteractiveElement[]): BoundingBox | undefined {
  if (step.target_bbox) return step.target_bbox;
  if (step.target_ref == null) return undefined;
  return elements.find((el) => el.ref === step.target_ref)?.bbox;
}

function buildSummaryAnnotations(
  steps: StepResult[],
  elements: InteractiveElement[],
): { annotations: Annotation[]; includedStepCount: number } {
  const annotations: Annotation[] = elements
    .filter((el) => el.redacted)
    .map((el) => ({
      type: 'mosaic',
      ref: el.ref,
      bbox: el.bbox,
      intensity: 'strong',
    }));

  let prevBbox: BoundingBox | undefined;
  let includedStepCount = 0;
  for (const step of steps) {
    if (!isActionableStep(step)) continue;
    const bbox = resolveStepBbox(step, elements);
    if (!bbox) continue;

    includedStepCount += 1;
    annotations.push({
      type: 'box',
      bbox,
      line_width: 2,
    });
    annotations.push({
      type: 'step_number',
      bbox,
      number: includedStepCount,
    });
    if (step.description) {
      annotations.push({
        type: 'callout',
        bbox,
        text: step.description,
        tail: 'auto',
      });
    }
    if (prevBbox) {
      annotations.push({
        type: 'arrow',
        from_bbox: prevBbox,
        to_bbox: bbox,
        elbow: true,
      });
    }
    prevBbox = bbox;
  }

  return { annotations, includedStepCount };
}

export async function captureSummaryScreenshot(options: SummaryScreenshotOptions): Promise<{
  screenshot: string;
  summaryStepCount: number;
}> {
  const {
    page,
    outputDir,
    steps,
    elements,
    preset,
    plan,
    outputFormat = 'png',
    scale = 1,
    theme,
  } = options;

  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const rawDir = join(outputDir, 'raw');
  if (!existsSync(rawDir)) {
    mkdirSync(rawDir, { recursive: true });
  }

  const rawBuf = await page.screenshot({
    type: outputFormat,
    ...(outputFormat === 'jpeg' ? { quality: 90 } : {}),
  });

  const rawFilename = buildFilename('summary_raw', viewport, undefined, outputFormat);
  const rawPath = join(rawDir, rawFilename);
  writeFileSync(rawPath, rawBuf);

  const { annotations, includedStepCount } = buildSummaryAnnotations(steps, elements);
  const dpr = config.capture.device_pixel_ratio;
  const { buffer: annotatedBaseBuffer } = await applyAnnotations(rawPath, annotations, elements, preset, { theme, dpr });

  if (!config.output.keep_raw) {
    try { unlinkSync(rawPath); } catch { /* best-effort cleanup */ }
  }

  let outputBuffer = Buffer.from(annotatedBaseBuffer);

  if (Math.abs(scale - 1) > 1e-6) {
    const meta = await sharp(outputBuffer).metadata();
    const baseWidth = meta.width ?? viewport.width;
    const resizedWidth = Math.max(1, Math.round(baseWidth * scale));
    const resized = sharp(outputBuffer).resize({ width: resizedWidth, kernel: 'lanczos3' });
    outputBuffer = outputFormat === 'jpeg'
      ? Buffer.from(await resized.jpeg({ quality: 90 }).toBuffer())
      : Buffer.from(await resized.png().toBuffer());
  } else if (outputFormat === 'jpeg') {
    outputBuffer = Buffer.from(await sharp(outputBuffer).jpeg({ quality: 90 }).toBuffer());
  }

  const summaryFilename = buildFilename('summary', viewport, undefined, outputFormat);
  const summaryPath = join(outputDir, summaryFilename);
  writeFileSync(summaryPath, outputBuffer);

  incrementUsage(plan);
  return { screenshot: summaryPath, summaryStepCount: includedStepCount };
}
