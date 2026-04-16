import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { z } from 'zod';
import { createPageSession, waitForPage, buildFilename } from '../engine/browser.js';
import { analyzeDOM, assignBadges } from '../engine/dom-analyzer.js';
import { countRedacted } from '../engine/masking.js';
import { config } from '../config.js';
import { checkLicense, incrementUsage, UsageLimitError } from '../license/license.js';
import type { CaptureResult, Preset } from '../types.js';

// ─── Input schema ─────────────────────────────────────────────────────────────

export const CapturePageInputSchema = z.object({
  url: z.string().url(),
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
  preset: z.enum(['auto', 'precise', 'friendly', 'neutral']).optional().default('auto'),
  security: z
    .object({
      redact_secrets: z.boolean().optional(),
      redact_pii: z.boolean().optional(),
      send_input_values: z.boolean().optional(),
    })
    .optional(),
});

export type CapturePageInput = z.infer<typeof CapturePageInputSchema>;

function isTrustedDomain(url: string, trustedDomains: string[]): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return trustedDomains.some((domain) => {
      const d = domain.toLowerCase();
      return hostname === d || hostname.endsWith(`.${d}`);
    });
  } catch {
    return false;
  }
}

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

// ─── Implementation ───────────────────────────────────────────────────────────

export async function capturePage(input: CapturePageInput): Promise<CaptureResult> {
  const licenseStatus = await checkLicense(process.env.LUMOSHOT_LICENSE_KEY);
  if (!licenseStatus.valid) {
    throw new Error('License is invalid or expired. Please verify your license key.');
  }
  if (licenseStatus.plan === 'free' && licenseStatus.at_limit) {
    throw new UsageLimitError(licenseStatus.usage);
  }

  const securityOverrideBase = {
    ...config.security,
    ...input.security,
  };
  const securityOverride = isTrustedDomain(input.url, securityOverrideBase.trusted_domains)
    ? { ...securityOverrideBase, redact_secrets: false, redact_pii: false }
    : securityOverrideBase;

  const session = await createPageSession();
  const { page } = session;

  try {
    await page.goto(input.url, { waitUntil: 'domcontentloaded' });

    await waitForPage(page, {
      strategy: input.wait?.strategy,
      selector: input.wait?.selector,
      timeout: input.wait?.timeout ?? config.capture.default_wait_timeout,
    });

    // Determine capture mode
    const viewportSize = page.viewportSize() ?? config.capture.default_viewport;
    const pageHeight: number = await page.evaluate(() => document.documentElement.scrollHeight);
    const scrollPosition = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));

    let captureMode = input.capture_mode ?? 'auto';
    let captureModeReason: string | undefined;

    if (captureMode === 'auto') {
      if (pageHeight > viewportSize.height * 2) {
        captureMode = 'viewport';
        captureModeReason = `Page height ${pageHeight}px exceeds 2x viewport. Full page available via capture_mode='full'.`;
      } else {
        captureMode = 'full';
      }
    }

    // Analyze DOM
    const analysis = await analyzeDOM(page, securityOverride);
    const elements = assignBadges(analysis.elements);
    let elementsForAnnotation = elements;

    const preset: Preset = input.preset as Preset ?? config.capture.default_preset;

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
        type: 'png',
        clip: {
          x: clipX,
          y: clipY,
          width: clipWidth,
          height: clipHeight,
        },
      });
      elementsForAnnotation = shiftElements(
        elements,
        Math.round(scrollPosition.x - clipX),
        Math.round(scrollPosition.y - clipY)
      );
    } else if (captureMode === 'full') {
      screenshotBuffer = await page.screenshot({ type: 'png', fullPage: true });
      elementsForAnnotation = shiftElements(elements, Math.round(scrollPosition.x), Math.round(scrollPosition.y));
    } else {
      // viewport
      screenshotBuffer = await page.screenshot({ type: 'png' });
    }

    // Inject badges and capture annotated version
    // For capture_page, we inject SVG badges on top of the already-taken screenshot via Sharp
    // (simpler than re-navigating for inject-then-screenshot)
    const { applyAnnotations } = await import('../engine/annotator.js');

    // Save raw screenshot temporarily
    const outputDir = resolve(config.output.directory);
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

    const rawFilename = buildFilename('raw', viewportSize);
    const rawPath = join(outputDir, rawFilename);
    writeFileSync(rawPath, screenshotBuffer);

    // Build badge annotations
    const badgeAnnotations = elementsForAnnotation
      .filter((el) => el.badge_number != null && el.badge_position != null)
      .map((el) => ({
        type: 'step_number' as const,
        ref: el.ref,
        bbox: el.bbox,
        number: el.badge_number!,
      }));
    const redactAnnotations = elementsForAnnotation
      .filter((el) => el.redacted)
      .map((el) => ({
        type: 'mosaic' as const,
        ref: el.ref,
        bbox: el.bbox,
        intensity: 'strong' as const,
      }));

    const { buffer: annotatedBuffer } = await applyAnnotations(
      rawPath,
      [...redactAnnotations, ...badgeAnnotations],
      elementsForAnnotation,
      preset
    );

    const filename = buildFilename('capture', viewportSize);
    const outputPath = join(outputDir, filename);
    writeFileSync(outputPath, annotatedBuffer);

    // Track usage
    incrementUsage(licenseStatus.plan);

    const pageMeta = {
      title: await page.title(),
      url: page.url(),
      viewport: viewportSize,
      device_pixel_ratio: 1,
      scroll_position: scrollPosition,
      captured_at: new Date().toISOString(),
      page_height: pageHeight,
      iframe_cross_origin: analysis.iframe_cross_origin,
      iframe_frame_stats: analysis.frame_stats,
    };

    return {
      screenshot: outputPath,
      elements,
      page_meta: pageMeta,
      diagnostics: {
        font_check: null,
        redacted_count: countRedacted(elements),
        capture_mode_used: captureMode,
        iframe_cross_origin: analysis.iframe_cross_origin,
        iframe_frame_stats: analysis.frame_stats,
        ...(captureModeReason ? { capture_mode_reason: captureModeReason } : {}),
      },
    };
  } finally {
    await session.dispose();
  }
}
