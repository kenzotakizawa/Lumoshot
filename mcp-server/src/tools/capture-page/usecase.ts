import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { basename, join, resolve } from 'path';
import { z } from 'zod';
import sharp from 'sharp';
import { createPageSession, waitForPage, buildFilename } from '../../engine/browser.js';
import { analyzeDOM, assignBadges } from '../../engine/dom-analyzer.js';
import { countRedacted } from '../../engine/masking.js';
import { config } from '../../config.js';
import { checkLicense, incrementUsage, UsageLimitError } from '../../license/license.js';
import { mergeSecurityConfig, resolveSecurityForUrl } from '../../domain/security/redact-policy.js';
import { detectRegionsFromImage, detectRegionsFromPage } from '../../domain/layout/regions.js';
import type { CaptureResult, InteractiveElement, Preset, ScreenRegion } from '../../types.js';

// ─── Input schema ─────────────────────────────────────────────────────────────

export const CapturePageInputSchema = z.object({
  url: z.string().url().optional(),
  image_path: z.string().optional(),
  wait: z
    .object({
      strategy: z.enum(['auto', 'selector', 'timeout']).optional(),
      selector: z.string().optional(),
      timeout: z.number().optional(),
    })
    .optional(),
  capture_mode: z.enum(['auto', 'viewport', 'full', 'element']).optional(),
  element_ref: z.number().optional(),
  element_padding: z.number().optional().default(40),
  scroll_to_ref: z.number().optional(),
  preset: z.enum(['auto', 'precise', 'friendly', 'neutral']).optional().default('auto'),
  output_format: z.enum(['png', 'jpeg']).optional().default('png'),
  scale: z.number().positive().max(4).optional().default(1),
  security: z
    .object({
      redact_secrets: z.boolean().optional(),
      redact_pii: z.boolean().optional(),
      send_input_values: z.boolean().optional(),
    })
    .optional(),
  include_badges: z.boolean().optional().default(true),
  badge_color: z.string().optional(),
  include_regions: z.boolean().optional().default(true),
  region_granularity: z.enum(['coarse', 'normal', 'fine']).optional().default('normal'),
}).superRefine((value, ctx) => {
  const hasUrl = typeof value.url === 'string' && value.url.length > 0;
  const hasImagePath = typeof value.image_path === 'string' && value.image_path.length > 0;

  if (!hasUrl && !hasImagePath) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Either "url" or "image_path" is required.',
      path: ['url'],
    });
    return;
  }

  if (hasUrl && hasImagePath) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Specify only one of "url" or "image_path".',
      path: ['image_path'],
    });
  }

  if (value.capture_mode === 'element' && value.element_ref == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'capture_mode="element" requires element_ref to be specified.',
      path: ['element_ref'],
    });
  }
});

export type CapturePageInput = z.infer<typeof CapturePageInputSchema>;

function shiftElements(
  elements: ReturnType<typeof assignBadges>,
  dx: number,
  dy: number
): ReturnType<typeof assignBadges> {
  return elements.map((el) => ({
    ...el,
    bbox: [el.bbox[0] + dx, el.bbox[1] + dy, el.bbox[2], el.bbox[3]],
    ...(el.badge_position
      ? { badge_position: [el.badge_position[0] + dx, el.badge_position[1] + dy] as [number, number] }
      : {}),
  }));
}

function shiftRegions(
  regions: ScreenRegion[],
  dx: number,
  dy: number,
): ScreenRegion[] {
  return regions.map((region) => ({
    ...region,
    bbox: [
      region.bbox[0] + dx,
      region.bbox[1] + dy,
      region.bbox[2],
      region.bbox[3],
    ],
  }));
}

const BADGE_RENDER_LIMIT_FALLBACK = 24;
const FULL_CAPTURE_BADGE_RENDER_LIMIT = 14;
const AUTO_FULL_PAGE_MAX_VIEWPORTS = 1.6;
const MAX_LOW_PRIORITY_BADGES_IN_COMPACT = 8;

type BadgeSelectionMode = 'full' | 'compact' | 'disabled';

interface BadgeSelectionResult {
  selected: InteractiveElement[];
  mode: BadgeSelectionMode;
  lowPrioritySelectedCount: number;
  lowPrioritySuppressedCount: number;
}

function resolveAutoCaptureMode(
  pageHeight: number,
  viewportHeight: number,
): { mode: 'viewport' | 'full'; reason?: string } {
  const thresholdPx = Math.max(1, Math.round(viewportHeight * AUTO_FULL_PAGE_MAX_VIEWPORTS));
  if (pageHeight > thresholdPx) {
    return {
      mode: 'viewport',
      reason:
        `Page height ${pageHeight}px exceeds auto threshold `
        + `${AUTO_FULL_PAGE_MAX_VIEWPORTS.toFixed(1)}x viewport (${thresholdPx}px). `
        + `Full page available via capture_mode='full'.`,
    };
  }
  return { mode: 'full' };
}

function isLowPriorityBadge(el: InteractiveElement): boolean {
  return el.type === 'link' || el.type === 'clickable';
}

function badgeBucketPriority(el: InteractiveElement): 0 | 1 | 2 | 3 {
  switch (el.type) {
    case 'button':
    case 'input':
    case 'select':
    case 'checkbox':
    case 'radio':
    case 'tab':
    case 'menu_item':
    case 'toggle':
      return 0;
    case 'clickable':
      return 1;
    case 'link':
      return 2;
    default:
      return 3;
  }
}

function scanOrderCompare(a: InteractiveElement, b: InteractiveElement): number {
  const y = a.bbox[1] - b.bbox[1];
  if (y !== 0) return y;
  const x = a.bbox[0] - b.bbox[0];
  if (x !== 0) return x;
  return a.ref - b.ref;
}

function selectBadgeElementsForOverlay(
  elements: InteractiveElement[],
  includeBadges: boolean,
  maxBadgeOverlays: number,
): BadgeSelectionResult {
  const withBadgeInfo = elements.filter((el) => el.badge_number != null && el.badge_position != null);
  if (!includeBadges) {
    return { selected: [], mode: 'disabled', lowPrioritySelectedCount: 0, lowPrioritySuppressedCount: 0 };
  }
  if (maxBadgeOverlays <= 0) {
    return { selected: [], mode: 'disabled', lowPrioritySelectedCount: 0, lowPrioritySuppressedCount: 0 };
  }
  if (withBadgeInfo.length <= maxBadgeOverlays) {
    return {
      selected: withBadgeInfo,
      mode: 'full',
      lowPrioritySelectedCount: withBadgeInfo.filter(isLowPriorityBadge).length,
      lowPrioritySuppressedCount: 0,
    };
  }

  const buckets: InteractiveElement[][] = [[], [], [], []];
  for (const el of withBadgeInfo) {
    buckets[badgeBucketPriority(el)].push(el);
  }
  for (const bucket of buckets) {
    bucket.sort(scanOrderCompare);
  }

  const selected: InteractiveElement[] = [];
  let lowPrioritySelectedCount = 0;
  for (let bucketIdx = 0; bucketIdx < buckets.length; bucketIdx++) {
    const bucket = buckets[bucketIdx]!;
    const isLowPriorityBucket = bucketIdx >= 2;
    for (const el of bucket) {
      if (selected.length >= maxBadgeOverlays) break;
      if (isLowPriorityBucket && lowPrioritySelectedCount >= MAX_LOW_PRIORITY_BADGES_IN_COMPACT) continue;
      selected.push(el);
      if (isLowPriorityBadge(el)) {
        lowPrioritySelectedCount += 1;
      }
    }
    if (selected.length >= maxBadgeOverlays) break;
  }

  const lowPriorityTotal = withBadgeInfo.filter(isLowPriorityBadge).length;
  const lowPrioritySuppressedCount = Math.max(0, lowPriorityTotal - lowPrioritySelectedCount);

  // Compact mode intentionally reorders for visual scanability (top-left to bottom-right).
  selected.sort(scanOrderCompare);

  return { selected, mode: 'compact', lowPrioritySelectedCount, lowPrioritySuppressedCount };
}

// ─── Implementation ───────────────────────────────────────────────────────────

export async function capturePage(input: CapturePageInput): Promise<CaptureResult> {
  const licenseStatus = await checkLicense(process.env.LUMOSHOT_LICENSE_KEY);
  if (!licenseStatus.valid) {
    throw new Error('License is invalid or expired. Please verify your license key.');
  }
  if (licenseStatus.plan === 'free' && licenseStatus.at_limit) {
    throw new UsageLimitError(licenseStatus.usage);
  }

  const screenshotType = input.output_format ?? 'png';
  const outputScale = input.scale ?? 1;
  const includeRegions = input.include_regions !== false;
  const regionGranularity = input.region_granularity ?? 'normal';
  const outputDir = resolve(config.output.directory);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  // Runtime guard: capture_mode='element' requires element_ref
  if (input.capture_mode === 'element' && input.element_ref == null) {
    throw new Error('capture_mode="element" requires element_ref to be specified.');
  }

  if (input.image_path && !input.url) {
    const resolvedImagePath = resolve(input.image_path);
    if (!existsSync(resolvedImagePath)) {
      throw new Error(`image_path not found: ${resolvedImagePath}`);
    }

    const sourceMeta = await sharp(resolvedImagePath).metadata();
    const sourceWidth = sourceMeta.width ?? config.capture.default_viewport.width;
    const sourceHeight = sourceMeta.height ?? config.capture.default_viewport.height;

    let transform = sharp(resolvedImagePath);
    if (Math.abs(outputScale - 1) > 1e-6) {
      const resizedWidth = Math.max(1, Math.round(sourceWidth * outputScale));
      transform = transform.resize({ width: resizedWidth, kernel: 'lanczos3' });
    }

    const outputBuffer = screenshotType === 'jpeg'
      ? Buffer.from(await transform.jpeg({ quality: 90 }).toBuffer())
      : Buffer.from(await transform.png().toBuffer());

    const outputMeta = await sharp(outputBuffer).metadata();
    const outputViewport = {
      width: outputMeta.width ?? sourceWidth,
      height: outputMeta.height ?? sourceHeight,
    };

    const filename = buildFilename('capture', outputViewport, undefined, screenshotType);
    const outputPath = join(outputDir, filename);
    writeFileSync(outputPath, outputBuffer);

    const regions = includeRegions
      ? await detectRegionsFromImage(outputPath, { granularity: regionGranularity })
      : [];

    incrementUsage(licenseStatus.plan);

    return {
      screenshot: outputPath,
      elements: [],
      regions,
      page_meta: {
        title: basename(resolvedImagePath),
        url: `file://${resolvedImagePath}`,
        viewport: outputViewport,
        device_pixel_ratio: 1,
        scroll_position: { x: 0, y: 0 },
        captured_at: new Date().toISOString(),
        page_height: outputViewport.height,
      },
      diagnostics: {
        font_check: null,
        redacted_count: 0,
        capture_mode_used: 'image',
        region_count: regions.length,
        region_source: regions.length > 0 ? 'image' : 'none',
      },
    };
  }

  const targetUrl = input.url;
  if (!targetUrl) {
    throw new Error('url is required when image_path is not provided.');
  }

  const securityOverrideBase = mergeSecurityConfig(config.security, input.security);
  const securityOverride = resolveSecurityForUrl(targetUrl, securityOverrideBase);

  const session = await createPageSession();
  const { page } = session;

  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

    await waitForPage(page, {
      strategy: input.wait?.strategy,
      selector: input.wait?.selector,
      timeout: input.wait?.timeout ?? config.capture.default_wait_timeout,
    });

    // Determine capture mode (auto is resolved later using final page metrics)
    const viewportSize = page.viewportSize() ?? config.capture.default_viewport;
    let pageHeight: number = await page.evaluate(() => document.documentElement.scrollHeight);
    let scrollPosition = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));

    const requestedCaptureMode = input.capture_mode ?? 'auto';
    let captureMode = requestedCaptureMode;
    let captureModeReason: string | undefined;
    let regionShiftX = 0;
    let regionShiftY = 0;

    // Analyze DOM
    let analysis = await analyzeDOM(page, securityOverride);
    let elements = assignBadges(analysis.elements, {
      width: viewportSize.width,
      height: viewportSize.height,
    });

    let scrollToRefResult: 'applied' | 'ref_not_found' | undefined;
    if (input.scroll_to_ref != null) {
      const target = elements.find((el) => el.ref === input.scroll_to_ref);
      if (target) {
        scrollToRefResult = 'applied';
        await page.evaluate(([x, y, w, h]) => {
          const targetX = Math.max(0, Math.round(window.scrollX + x + w / 2 - window.innerWidth / 2));
          const targetY = Math.max(0, Math.round(window.scrollY + y + h / 2 - window.innerHeight / 2));
          window.scrollTo({ left: targetX, top: targetY, behavior: 'instant' });
        }, target.bbox);
        await page.waitForTimeout(120);
        scrollPosition = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
        pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
        analysis = await analyzeDOM(page, securityOverride);
        elements = assignBadges(analysis.elements, {
          width: viewportSize.width,
          height: viewportSize.height,
        });
      } else {
        scrollToRefResult = 'ref_not_found';
      }
    }

    let elementsForAnnotation = elements;

    const preset: Preset = input.preset as Preset ?? config.capture.default_preset;

    if (requestedCaptureMode === 'auto') {
      pageHeight = await page.evaluate(() => {
        const docH = document.documentElement?.scrollHeight ?? 0;
        const bodyH = document.body?.scrollHeight ?? 0;
        return Math.max(docH, bodyH);
      });
      const autoMode = resolveAutoCaptureMode(pageHeight, viewportSize.height);
      captureMode = autoMode.mode;
      captureModeReason = autoMode.reason;
    }

    // Take screenshot
    let screenshotBuffer: Buffer;

    if (captureMode === 'element' && input.element_ref != null) {
      const el = elements.find((e) => e.ref === input.element_ref);
      if (!el) {
        throw new Error(`element_ref ${input.element_ref} not found in current DOM`);
      }
      const pad = input.element_padding ?? 40;
      const [ex, ey, ew, eh] = el.bbox;
      const clipX = Math.max(0, Math.round(ex + scrollPosition.x - pad));
      const clipY = Math.max(0, Math.round(ey + scrollPosition.y - pad));
      const clipWidth = Math.max(1, Math.round(ew + pad * 2));
      const clipHeight = Math.max(1, Math.round(eh + pad * 2));
      screenshotBuffer = await page.screenshot({
        type: screenshotType,
        ...(screenshotType === 'jpeg' ? { quality: 90 } : {}),
        clip: {
          x: clipX,
          y: clipY,
          width: clipWidth,
          height: clipHeight,
        },
      });
      regionShiftX = Math.round(scrollPosition.x - clipX);
      regionShiftY = Math.round(scrollPosition.y - clipY);
      elementsForAnnotation = shiftElements(
        elements,
        regionShiftX,
        regionShiftY,
      );
    } else if (captureMode === 'full') {
      screenshotBuffer = await page.screenshot({
        type: screenshotType,
        ...(screenshotType === 'jpeg' ? { quality: 90 } : {}),
        fullPage: true,
      });
      regionShiftX = Math.round(scrollPosition.x);
      regionShiftY = Math.round(scrollPosition.y);
      elementsForAnnotation = shiftElements(elements, regionShiftX, regionShiftY);
    } else {
      // viewport
      screenshotBuffer = await page.screenshot({
        type: screenshotType,
        ...(screenshotType === 'jpeg' ? { quality: 90 } : {}),
      });
    }

    // Inject badges and capture annotated version
    // For capture_page, we inject SVG badges on top of the already-taken screenshot via Sharp
    // (simpler than re-navigating for inject-then-screenshot)
    const { applyAnnotations } = await import('../../engine/annotation/pipeline.js');

    const rawFilename = buildFilename('raw', viewportSize, undefined, screenshotType);
    const rawPath = join(outputDir, rawFilename);
    writeFileSync(rawPath, screenshotBuffer);

    // Build badge annotations (skipped when include_badges is explicitly false)
    const includeBadges = input.include_badges !== false;
    const configuredBadgeLimit = Number.isFinite(config.capture.max_badge_overlays)
      ? Math.floor(config.capture.max_badge_overlays)
      : BADGE_RENDER_LIMIT_FALLBACK;
    const baseBadgeRenderLimit = configuredBadgeLimit > 0 ? configuredBadgeLimit : 0;
    const effectiveBadgeRenderLimit = captureMode === 'full'
      ? Math.min(baseBadgeRenderLimit, FULL_CAPTURE_BADGE_RENDER_LIMIT)
      : baseBadgeRenderLimit;
    const {
      selected: badgeElementsForOverlay,
      mode: badgeDensityMode,
      lowPrioritySelectedCount,
      lowPrioritySuppressedCount,
    } = selectBadgeElementsForOverlay(elementsForAnnotation, includeBadges, effectiveBadgeRenderLimit);
    const badgeRenderedCount = badgeElementsForOverlay.length;
    const badgeSuppressedCount = elementsForAnnotation
      .filter((el) => el.badge_number != null && el.badge_position != null).length - badgeRenderedCount;
    const badgeAnnotations = badgeElementsForOverlay.map((el, idx) => ({
      type: 'step_number' as const,
      ref: el.ref,
      bbox: el.bbox,
      number: badgeDensityMode === 'compact' ? idx + 1 : el.badge_number!,
      ...(input.badge_color ? { color: input.badge_color } : {}),
    }));
    const redactAnnotations = elementsForAnnotation
      .filter((el) => el.redacted)
      .map((el) => ({
        type: 'mosaic' as const,
        ref: el.ref,
        bbox: el.bbox,
        intensity: 'strong' as const,
      }));

    const dpr = config.capture.device_pixel_ratio;
    const { buffer: annotatedBaseBuffer } = await applyAnnotations(
      rawPath,
      [...redactAnnotations, ...badgeAnnotations],
      elementsForAnnotation,
      preset,
      { dpr }
    );

    if (!config.output.keep_raw) {
      try { unlinkSync(rawPath); } catch { /* best-effort cleanup */ }
    }

    let annotatedBuffer = Buffer.from(annotatedBaseBuffer);
    if (Math.abs(outputScale - 1) > 1e-6) {
      const metaOut = await sharp(annotatedBuffer).metadata();
      const baseWidth = metaOut.width ?? viewportSize.width;
      const targetWidth = Math.max(1, Math.round(baseWidth * outputScale));
      const resized = sharp(annotatedBuffer).resize({ width: targetWidth, kernel: 'lanczos3' });
      annotatedBuffer = screenshotType === 'jpeg'
        ? Buffer.from(await resized.jpeg({ quality: 90 }).toBuffer())
        : Buffer.from(await resized.png().toBuffer());
    } else if (screenshotType === 'jpeg') {
      annotatedBuffer = Buffer.from(await sharp(annotatedBuffer).jpeg({ quality: 90 }).toBuffer());
    }

    const filename = buildFilename('capture', viewportSize, undefined, screenshotType);
    const outputPath = join(outputDir, filename);
    writeFileSync(outputPath, annotatedBuffer);

    const baseRegions = includeRegions
      ? await detectRegionsFromPage(page, elements, { granularity: regionGranularity })
      : [];
    const regions = (regionShiftX !== 0 || regionShiftY !== 0)
      ? shiftRegions(baseRegions, regionShiftX, regionShiftY)
      : baseRegions;

    // Track usage
    incrementUsage(licenseStatus.plan);

    const pageMeta = {
      title: await page.title(),
      url: page.url(),
      viewport: viewportSize,
      device_pixel_ratio: dpr,
      scroll_position: scrollPosition,
      captured_at: new Date().toISOString(),
      page_height: pageHeight,
      iframe_cross_origin: analysis.iframe_cross_origin,
      iframe_frame_stats: analysis.frame_stats,
    };

    return {
      screenshot: outputPath,
      elements,
      regions,
      page_meta: pageMeta,
      diagnostics: {
        font_check: null,
        redacted_count: countRedacted(elements),
        capture_mode_used: captureMode,
        iframe_cross_origin: analysis.iframe_cross_origin,
        iframe_frame_stats: analysis.frame_stats,
        badge_density_mode: badgeDensityMode,
        badge_numbering_mode:
          badgeDensityMode === 'disabled' ? 'disabled' : badgeDensityMode === 'compact' ? 'reindexed' : 'original',
        badge_limit_used: effectiveBadgeRenderLimit,
        badge_rendered_count: badgeRenderedCount,
        badge_suppressed_count: Math.max(0, badgeSuppressedCount),
        badge_low_priority_selected_count: lowPrioritySelectedCount,
        badge_low_priority_suppressed_count: lowPrioritySuppressedCount,
        region_count: regions.length,
        region_source: regions.length > 0 ? regions[0]?.source ?? 'dom' : 'none',
        ...(captureModeReason ? { capture_mode_reason: captureModeReason } : {}),
        ...(scrollToRefResult != null ? { scroll_to_ref_result: scrollToRefResult } : {}),
      },
    };
  } finally {
    await session.dispose();
  }
}
