import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { createPageSession, waitForPage, serializeMetadata } from '../../engine/browser.js';
import { analyzeDOM, assignBadges } from '../../engine/dom-analyzer.js';
import { config } from '../../config.js';
import { checkLicense, UsageLimitError } from '../../license/license.js';
import type { FlowResult, Preset, StepResult } from '../../types.js';
import type { ExecuteFlowInput } from './schema.js';
import { captureStep, getPageMeta } from './step-capture.js';
import { runFlowStep } from './handlers.js';
import { runPreSteps } from './pre-steps.js';
import { createFrameStatsState, resolveSecurityForUrl, updateFrameStats } from './shared.js';
import { captureSummaryScreenshot } from './summary.js';
import { getCjkFontWarning } from '../../domain/diagnostics/cjk-font.js';

function collectFlowTextSamples(input: ExecuteFlowInput): string[] {
  const samples: string[] = [];
  for (const step of input.steps) {
    if ('description' in step && typeof step.description === 'string') {
      samples.push(step.description);
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

export async function executeFlow(input: ExecuteFlowInput): Promise<FlowResult> {
  const licenseStatus = await checkLicense(process.env.LUMOSHOT_LICENSE_KEY);
  if (!licenseStatus.valid) {
    throw new Error('License is invalid or expired. Please verify your license key.');
  }
  if (licenseStatus.plan === 'free' && licenseStatus.at_limit) {
    throw new UsageLimitError(licenseStatus.usage);
  }

  const outputDir = resolve(config.output.directory);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const session = await createPageSession();
  const pageRef = { current: session.page };
  const preset: Preset = (input.preset as Preset) ?? config.capture.default_preset;
  const startTime = Date.now();

  const results: StepResult[] = [];
  let stepNum = 0;
  const startUrl = input.url;
  const frameStats = createFrameStatsState();
  const summaryOnly = input.visualization_mode === 'summary_only';
  const runtimeInput: ExecuteFlowInput = summaryOnly
    ? { ...input, auto_capture_each_step: false }
    : input;
  const flowWarnings: NonNullable<FlowResult['flow_meta']['warnings']> = [];
  const cjkFontWarning = getCjkFontWarning({
    textSamples: collectFlowTextSamples(runtimeInput),
  });
  if (cjkFontWarning) {
    flowWarnings.push({
      type: 'font_missing_cjk',
      message: formatCjkFontWarningMessage(cjkFontWarning),
    });
  }

  try {
    if (input.cookies && input.cookies.length > 0) {
      await session.context.addCookies(input.cookies);
    }

    if (input.pre_steps && input.pre_steps.length > 0) {
      await runPreSteps({
        pageRef,
        preSteps: input.pre_steps,
        defaultWait: runtimeInput.default_wait,
        frameStats,
        resolveSecurityForUrl,
      });
    }

    await pageRef.current.goto(startUrl, { waitUntil: 'domcontentloaded' });
    await waitForPage(pageRef.current, {
      strategy: runtimeInput.default_wait?.strategy,
      timeout: runtimeInput.default_wait?.timeout ?? config.capture.default_wait_timeout,
    });

    for (const step of runtimeInput.steps) {
      stepNum++;
      const currentPage = pageRef.current;
      const analysis = await analyzeDOM(currentPage, resolveSecurityForUrl(currentPage.url()));
      updateFrameStats(frameStats, analysis);
      const viewport = currentPage.viewportSize() ?? config.capture.default_viewport;
      const elements = assignBadges(analysis.elements, {
        width: viewport.width,
        height: viewport.height,
      });
      const meta = await getPageMeta(currentPage);

      if (summaryOnly && step.action === 'capture') {
        results.push({
          step_number: stepNum,
          action: step.action,
          screenshot: '',
          elements,
          meta,
        });
        continue;
      }

      try {
        const stepResult = await runFlowStep({
          step,
          pageRef,
          stepNum,
          outputDir,
          elements,
          meta,
          preset,
          licensePlan: licenseStatus.plan,
          input: runtimeInput,
          frameStats,
          resolveSecurityForUrl,
        });
        results.push(stepResult);
      } catch (err) {
        if (err instanceof UsageLimitError) {
          throw err;
        }
        const screenshot = summaryOnly
          ? ''
          : await captureStep({
              page: pageRef.current,
              stepNumber: stepNum,
              outputDir,
              elements,
              preset,
              plan: licenseStatus.plan,
              outputFormat: runtimeInput.output_format,
              scale: runtimeInput.scale,
              theme: runtimeInput.theme,
            }).catch(() => '');

        results.push({
          step_number: stepNum,
          action: step.action,
          screenshot,
          meta,
          status: 'error',
          error: {
            type: 'unexpected_error',
            message: String(err),
            suggestion: 'Check the screenshot for the current page state.',
          },
        });
      }

      const elemDir = join(outputDir, 'elements');
      if (!existsSync(elemDir)) {
        mkdirSync(elemDir, { recursive: true });
      }
      const { content: elemContent, ext: elemExt } = serializeMetadata(elements);
      const elementsPath = join(elemDir, `step_${String(stepNum).padStart(2, '0')}_elements.${elemExt}`);
      writeFileSync(elementsPath, elemContent);
    }

    let summaryScreenshot = '';
    let summaryStepCount = 0;
    if (summaryOnly) {
      const summaryPage = pageRef.current;
      const summaryAnalysis = await analyzeDOM(summaryPage, resolveSecurityForUrl(summaryPage.url()));
      updateFrameStats(frameStats, summaryAnalysis);
      const viewport = summaryPage.viewportSize() ?? config.capture.default_viewport;
      const summaryElements = assignBadges(summaryAnalysis.elements, {
        width: viewport.width,
        height: viewport.height,
      });
      const summary = await captureSummaryScreenshot({
        page: summaryPage,
        outputDir,
        steps: results,
        elements: summaryElements,
        preset,
        plan: licenseStatus.plan,
        outputFormat: runtimeInput.output_format,
        scale: runtimeInput.scale,
        theme: runtimeInput.theme,
      });
      summaryScreenshot = summary.screenshot;
      summaryStepCount = summary.summaryStepCount;
    }

    const endUrl = pageRef.current.url();
    const duration = Date.now() - startTime;
    const totalScreenshots = results.filter((r) => r.screenshot).length + (summaryScreenshot ? 1 : 0);

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
        viewport: pageRef.current.viewportSize() ?? config.capture.default_viewport,
        device_pixel_ratio: 1,
        browser: 'chromium',
        lumoshot_preset: preset,
        iframe_cross_origin: frameStats.iframeCrossOriginDetected,
        max_cross_origin_frames: frameStats.maxCrossOriginFrames,
      },
      visualization: {
        mode: summaryOnly ? 'summary_only' : 'step',
        ...(summaryScreenshot ? { summary_screenshot: summaryScreenshot, summary_step_count: summaryStepCount } : {}),
      },
      ...(flowWarnings.length > 0 ? { warnings: flowWarnings } : {}),
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
        ...(input.theme ? { theme: input.theme } : {}),
        start_url: startUrl,
        end_url: endUrl,
        viewport: pageRef.current.viewportSize() ?? config.capture.default_viewport,
        output_format: input.output_format ?? 'png',
        scale: input.scale ?? 1,
        visualization_mode: summaryOnly ? 'summary_only' : 'step',
        ...(summaryScreenshot ? { summary_screenshot: summaryScreenshot, summary_step_count: summaryStepCount } : {}),
        ...(flowWarnings.length > 0 ? { warnings: flowWarnings } : {}),
        iframe_cross_origin: frameStats.iframeCrossOriginDetected,
        max_cross_origin_frames: frameStats.maxCrossOriginFrames,
      },
    };
  } finally {
    await session.dispose();
  }
}
