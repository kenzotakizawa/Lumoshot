import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { z } from 'zod';
import type { Page } from 'playwright';
import { createPageSession, waitForPage, buildFilename, serializeMetadata } from '../engine/browser.js';
import { analyzeDOM, assignBadges } from '../engine/dom-analyzer.js';
import { applyAnnotations } from '../engine/annotator.js';
import { config } from '../config.js';
import { checkLicense, incrementUsage, UsageLimitError } from '../license/license.js';
import type { FlowResult, StepResult, InteractiveElement, Preset, Annotation } from '../types.js';

// ─── Input schema ─────────────────────────────────────────────────────────────

const FlowStepSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('capture') }),
  z.object({ action: z.literal('click'), ref: z.number(), description: z.string().optional() }),
  z.object({ action: z.literal('fill'), ref: z.number(), value: z.string() }),
  z.object({ action: z.literal('scroll'), direction: z.enum(['up', 'down', 'left', 'right']), amount: z.number().default(300) }),
  z.object({ action: z.literal('hover'), ref: z.number() }),
  z.object({ action: z.literal('select'), ref: z.number(), value: z.string() }),
  z.object({
    action: z.literal('wait'),
    strategy: z.enum(['auto', 'selector', 'timeout']).optional(),
    selector: z.string().optional(),
    timeout: z.number().optional(),
  }),
]);

export const ExecuteFlowInputSchema = z.object({
  url: z.string().url(),
  preset: z.enum(['auto', 'precise', 'friendly', 'neutral']).optional().default('auto'),
  steps: z.array(FlowStepSchema),
  auto_capture_each_step: z.boolean().optional().default(true),
  default_wait: z
    .object({
      strategy: z.enum(['auto', 'selector', 'timeout']).optional(),
      timeout: z.number().optional(),
    })
    .optional(),
});

export type ExecuteFlowInput = z.infer<typeof ExecuteFlowInputSchema>;
type FlowStep = z.infer<typeof FlowStepSchema>;

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

function resolveSecurityForUrl(url: string) {
  if (isTrustedDomain(url, config.security.trusted_domains)) {
    return { ...config.security, redact_secrets: false, redact_pii: false };
  }
  return config.security;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getPageMeta(page: Page) {
  return {
    url: page.url(),
    viewport: page.viewportSize() ?? config.capture.default_viewport,
    captured_at: new Date().toISOString(),
    scroll_position: await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY })),
  };
}

async function captureStep(
  page: Page,
  stepNumber: number,
  outputDir: string,
  elements: InteractiveElement[],
  preset: Preset,
  plan: 'free' | 'pro',
  actionAnnotation?: {
    type: 'click_icon' | 'step_number';
    ref?: number;
    number?: number;
    click_type?: 'left' | 'right' | 'double';
  }
): Promise<string> {
  const viewport = page.viewportSize() ?? config.capture.default_viewport;
  const rawBuf = await page.screenshot({ type: 'png' });
  const rawFilename = buildFilename(`step_${String(stepNumber).padStart(2, '0')}_raw`, viewport);
  const rawPath = join(outputDir, 'raw', rawFilename);

  // Ensure raw dir
  const rawDir = join(outputDir, 'raw');
  if (!existsSync(rawDir)) mkdirSync(rawDir, { recursive: true });
  writeFileSync(rawPath, rawBuf);

  // Build annotations
  const annotations: Annotation[] = elements
    .filter((el) => el.redacted)
    .map((el) => ({
      type: 'mosaic' as const,
      ref: el.ref,
      bbox: el.bbox,
      intensity: 'strong' as const,
    }));

  if (actionAnnotation) {
    if (actionAnnotation.type === 'click_icon' && actionAnnotation.ref != null) {
      annotations.push({
        type: 'click_icon' as const,
        ref: actionAnnotation.ref,
        click_type: actionAnnotation.click_type ?? 'left',
      });
    } else if (actionAnnotation.type === 'step_number' && actionAnnotation.ref != null) {
      annotations.push({
        type: 'step_number' as const,
        ref: actionAnnotation.ref,
        number: actionAnnotation.number ?? stepNumber,
      });
    }
  }

  const { buffer } = await applyAnnotations(rawPath, annotations, elements, preset);
  const filename = buildFilename(`step_${String(stepNumber).padStart(2, '0')}`, viewport);
  const outputPath = join(outputDir, filename);
  writeFileSync(outputPath, buffer);
  incrementUsage(plan);
  return outputPath;
}

// ─── Implementation ───────────────────────────────────────────────────────────

export async function executeFlow(input: ExecuteFlowInput): Promise<FlowResult> {
  const licenseStatus = await checkLicense(process.env.LUMOSHOT_LICENSE_KEY);
  if (!licenseStatus.valid) {
    throw new Error('License is invalid or expired. Please verify your license key.');
  }
  if (licenseStatus.plan === 'free' && licenseStatus.at_limit) {
    throw new UsageLimitError(licenseStatus.usage);
  }

  const outputDir = resolve(config.output.directory);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const session = await createPageSession();
  const { page } = session;
  const preset: Preset = (input.preset as Preset) ?? config.capture.default_preset;
  const startTime = Date.now();

  const results: StepResult[] = [];
  let stepNum = 0;
  const startUrl = input.url;
  let iframeCrossOriginDetected = false;
  let maxCrossOriginFrames = 0;

  try {
    await page.goto(startUrl, { waitUntil: 'domcontentloaded' });
    await waitForPage(page, {
      strategy: input.default_wait?.strategy,
      timeout: input.default_wait?.timeout ?? config.capture.default_wait_timeout,
    });

    for (const step of input.steps) {
      stepNum++;
      const analysis = await analyzeDOM(page, resolveSecurityForUrl(page.url()));
      if (analysis.iframe_cross_origin) {
        iframeCrossOriginDetected = true;
      }
      if (analysis.frame_stats.cross_origin_frames > maxCrossOriginFrames) {
        maxCrossOriginFrames = analysis.frame_stats.cross_origin_frames;
      }
      const elements = assignBadges(analysis.elements);
      const meta = await getPageMeta(page);

      try {
        switch (step.action) {
          case 'capture': {
            const screenshot = await captureStep(page, stepNum, outputDir, elements, preset, licenseStatus.plan);
            results.push({ step_number: stepNum, action: 'capture', screenshot, elements, meta });
            break;
          }

          case 'click': {
            const el = elements.find((e) => e.ref === step.ref);
            if (!el) {
              const screenshot = await captureStep(page, stepNum, outputDir, elements, preset, licenseStatus.plan);
              results.push({
                step_number: stepNum, action: 'click', screenshot, meta,
                status: 'error',
                error: {
                  type: 'element_not_found',
                  message: `ref:${step.ref} not found in current DOM. Page may have changed.`,
                  suggestion: 'Re-run capture_page to get updated element refs.',
                },
              });
              break;
            }

            const [ex, ey, ew, eh] = el.bbox;
            await page.mouse.click(ex + ew / 2, ey + eh / 2);

            if (input.auto_capture_each_step) {
              // waitForPage may throw if the click triggered a navigation that
              // destroyed the current execution context — that's expected, ignore it.
              try {
                await waitForPage(page, {
                  strategy: input.default_wait?.strategy ?? 'auto',
                  timeout: input.default_wait?.timeout ?? 3000,
                });
              } catch { /* navigation-induced context change, continue */ }

              const screenshot = await captureStep(
                page,
                stepNum,
                outputDir,
                elements,
                preset,
                licenseStatus.plan,
                {
                  type: 'click_icon',
                  ref: step.ref,
                }
              );
              results.push({
                step_number: stepNum, action: 'click', screenshot, meta,
                target_ref: step.ref, target_label: el.label,
                annotation: { type: 'click_icon', position: [ex, ey] },
              });
            } else {
              results.push({
                step_number: stepNum, action: 'click',
                screenshot: '', meta,
                target_ref: step.ref, target_label: el.label,
              });
            }
            break;
          }

          case 'fill': {
            const el = elements.find((e) => e.ref === step.ref);
            if (!el) {
              const screenshot = await captureStep(page, stepNum, outputDir, elements, preset, licenseStatus.plan);
              results.push({
                step_number: stepNum, action: 'fill', screenshot, meta,
                status: 'error',
                error: {
                  type: 'element_not_found',
                  message: `ref:${step.ref} not found. Page may have changed.`,
                  suggestion: 'Re-run capture_page to get updated element refs.',
                },
              });
              break;
            }

            const [fx, fy, fw, fh] = el.bbox;
            await page.mouse.click(fx + fw / 2, fy + fh / 2);
            // Select all existing text then type the new value
            const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
            await page.keyboard.press(`${modifier}+a`);
            await page.keyboard.type(step.value);

            if (input.auto_capture_each_step) {
              const screenshot = await captureStep(page, stepNum, outputDir, elements, preset, licenseStatus.plan, {
                type: 'step_number',
                ref: step.ref,
                number: stepNum,
              });
              results.push({
                step_number: stepNum, action: 'fill', screenshot, meta,
                target_ref: step.ref, target_label: el.label,
                filled_value: step.value,
                annotation: { type: 'step_number', position: [fx, fy], badge_number: stepNum },
              });
            } else {
              results.push({ step_number: stepNum, action: 'fill', screenshot: '', meta, target_ref: step.ref, filled_value: step.value });
            }
            break;
          }

          case 'scroll': {
            const scrollMap = { up: [0, -step.amount], down: [0, step.amount], left: [-step.amount, 0], right: [step.amount, 0] };
            const [sx, sy] = scrollMap[step.direction];
            await page.mouse.wheel(sx, sy);
            await page.waitForTimeout(300);

            if (input.auto_capture_each_step) {
              const analysisAfterScroll = await analyzeDOM(page, resolveSecurityForUrl(page.url()));
              if (analysisAfterScroll.iframe_cross_origin) {
                iframeCrossOriginDetected = true;
              }
              if (analysisAfterScroll.frame_stats.cross_origin_frames > maxCrossOriginFrames) {
                maxCrossOriginFrames = analysisAfterScroll.frame_stats.cross_origin_frames;
              }
              const els2 = assignBadges(analysisAfterScroll.elements);
              const screenshot = await captureStep(page, stepNum, outputDir, els2, preset, licenseStatus.plan);
              results.push({ step_number: stepNum, action: 'scroll', screenshot, elements: els2, meta: await getPageMeta(page) });
            } else {
              results.push({ step_number: stepNum, action: 'scroll', screenshot: '', meta });
            }
            break;
          }

          case 'hover': {
            const el = elements.find((e) => e.ref === step.ref);
            if (!el) {
              results.push({ step_number: stepNum, action: 'hover', screenshot: '', meta, status: 'error', error: { type: 'element_not_found', message: `ref:${step.ref} not found.`, suggestion: 'Re-run capture_page.' } });
              break;
            }
            const [hx, hy, hw, hh] = el.bbox;
            await page.mouse.move(hx + hw / 2, hy + hh / 2);
            await page.waitForTimeout(500); // Wait for tooltip

            if (input.auto_capture_each_step) {
              const screenshot = await captureStep(page, stepNum, outputDir, elements, preset, licenseStatus.plan);
              results.push({ step_number: stepNum, action: 'hover', screenshot, meta, target_ref: step.ref, target_label: el.label });
            } else {
              results.push({ step_number: stepNum, action: 'hover', screenshot: '', meta, target_ref: step.ref });
            }
            break;
          }

          case 'select': {
            const el = elements.find((e) => e.ref === step.ref);
            if (!el) {
              results.push({ step_number: stepNum, action: 'select', screenshot: '', meta, status: 'error', error: { type: 'element_not_found', message: `ref:${step.ref} not found.`, suggestion: 'Re-run capture_page.' } });
              break;
            }
            const [sx2, sy2, sw2] = el.bbox;
            // Try Playwright locator-based select
            try {
              await page.selectOption(`[data-lumoshot-ref="${step.ref}"]`, step.value).catch(async () => {
                await page.mouse.click(sx2 + sw2 / 2, sy2 + el.bbox[3] / 2);
              });
            } catch { /* ignore */ }

            if (input.auto_capture_each_step) {
              const screenshot = await captureStep(page, stepNum, outputDir, elements, preset, licenseStatus.plan);
              results.push({ step_number: stepNum, action: 'select', screenshot, meta, target_ref: step.ref, target_label: el.label });
            } else {
              results.push({ step_number: stepNum, action: 'select', screenshot: '', meta, target_ref: step.ref });
            }
            break;
          }

          case 'wait': {
            try {
              await waitForPage(page, {
                strategy: step.strategy ?? input.default_wait?.strategy ?? 'auto',
                selector: step.selector,
                timeout: step.timeout ?? input.default_wait?.timeout ?? config.capture.default_wait_timeout,
              });
              results.push({ step_number: stepNum, action: 'wait', screenshot: '', meta });
            } catch {
              const screenshot = await captureStep(page, stepNum, outputDir, elements, preset, licenseStatus.plan);
              results.push({
                step_number: stepNum, action: 'wait', screenshot, meta,
                status: 'timeout',
                error: {
                  type: 'wait_timeout',
                  message: `${step.selector ? `Selector '${step.selector}'` : 'Wait condition'} not fulfilled within timeout.`,
                  suggestion: `Check if navigation succeeded. Current URL: ${page.url()}`,
                },
              });
            }
            break;
          }
        }
      } catch (err) {
        if (err instanceof UsageLimitError) {
          throw err;
        }
        const screenshot = await captureStep(page, stepNum, outputDir, elements, preset, licenseStatus.plan).catch(() => '');
        results.push({
          step_number: stepNum, action: step.action, screenshot, meta,
          status: 'error',
          error: {
            type: 'unexpected_error',
            message: String(err),
            suggestion: 'Check the screenshot for the current page state.',
          },
        });
      }

      // Save element metadata for this step
      const elemDir = join(outputDir, 'elements');
      if (!existsSync(elemDir)) mkdirSync(elemDir, { recursive: true });
      const { content: elemContent, ext: elemExt } = serializeMetadata(elements);
      const elementsPath = join(elemDir, `step_${String(stepNum).padStart(2, '0')}_elements.${elemExt}`);
      writeFileSync(elementsPath, elemContent);
    }

    const endUrl = page.url();
    const duration = Date.now() - startTime;
    const totalScreenshots = results.filter((r) => r.screenshot).length;

    // Write flow_meta.json
    const flowMeta = {
      lumoshot_version: '0.1.0',
      flow: {
        start_url: startUrl,
        end_url: endUrl,
        total_steps: stepNum,
        duration_ms: duration,
        started_at: new Date(startTime).toISOString(),
        completed_at: new Date().toISOString(),
      },
      environment: {
        os: process.platform,
        viewport: session.page.viewportSize() ?? config.capture.default_viewport,
        device_pixel_ratio: 1,
        browser: 'chromium',
        lumoshot_preset: preset,
        iframe_cross_origin: iframeCrossOriginDetected,
        max_cross_origin_frames: maxCrossOriginFrames,
      },
      steps: results.map((r) => ({
        step_number: r.step_number,
        action: r.action,
        screenshot: r.screenshot,
        url: r.meta.url,
        captured_at: r.meta.captured_at,
      })),
    };
    const { content: flowMetaContent, ext: flowMetaExt } = serializeMetadata(flowMeta);
    writeFileSync(join(outputDir, `flow_meta.${flowMetaExt}`), flowMetaContent);

    return {
      steps: results,
      flow_meta: {
        total_steps: stepNum,
        total_screenshots: totalScreenshots,
        duration_ms: duration,
        preset,
        start_url: startUrl,
        end_url: endUrl,
        viewport: session.page.viewportSize() ?? config.capture.default_viewport,
        iframe_cross_origin: iframeCrossOriginDetected,
        max_cross_origin_frames: maxCrossOriginFrames,
      },
    };
  } finally {
    await session.dispose();
  }
}
