import { analyzeDOM, assignBadges } from '../../engine/dom-analyzer.js';
import { waitForPage } from '../../engine/browser.js';
import { config } from '../../config.js';
import type { BoundingBox, InteractiveElement, Preset, StepResult } from '../../types.js';
import type { ExecuteFlowInput, FlowStep } from './schema.js';
import { resolveStepTarget } from './target-resolver.js';
import { captureStep, getPageMeta } from './step-capture.js';
import type { FrameStatsState, SecurityResolver } from './shared.js';
import { updateFrameStats } from './shared.js';
import { clickAndMaybeSwitchTab } from './tab-tracker.js';

interface ActionRuntimeContext {
  pageRef: { current: import('playwright').Page };
  stepNum: number;
  outputDir: string;
  elements: InteractiveElement[];
  meta: StepResult['meta'];
  preset: Preset;
  licensePlan: 'free' | 'pro';
  input: ExecuteFlowInput;
  frameStats: FrameStatsState;
  resolveSecurityForUrl: SecurityResolver;
}

export interface RunFlowStepContext extends ActionRuntimeContext {
  step: FlowStep;
}

interface ReanalysisResult {
  captureElements: InteractiveElement[];
  captureHighlightRef: number | undefined;
  captureHighlightBbox: BoundingBox | undefined;
}

/**
 * Re-analyzes the DOM after a user action and resolves the element/bbox to highlight.
 * Used by click and select handlers to get fresh element positions post-interaction.
 */
async function reanalyzePageForCapture(
  page: import('playwright').Page,
  ctx: Pick<ActionRuntimeContext, 'frameStats' | 'resolveSecurityForUrl'>,
  priorElements: InteractiveElement[],
  opts: {
    /** Try to find the post-action element by its pre-action label */
    matchLabel?: string;
    /** If element not found by label, resolve bbox from this CSS selector */
    selectorForBbox?: string | null;
    /** Highlight ref to use when DOM re-analysis throws */
    fallbackHighlightRef?: number;
    /** Highlight bbox to use when DOM re-analysis throws */
    fallbackHighlightBbox?: BoundingBox;
    /** If both highlightRef and highlightBbox are null after analysis, fall back to this */
    ensureHighlightBbox?: BoundingBox;
  },
): Promise<ReanalysisResult> {
  let captureElements = priorElements;
  let captureHighlightRef: number | undefined;
  let captureHighlightBbox: BoundingBox | undefined;

  try {
    const afterAnalysis = await analyzeDOM(page, ctx.resolveSecurityForUrl(page.url()));
    updateFrameStats(ctx.frameStats, afterAnalysis);
    const viewport = page.viewportSize() ?? config.capture.default_viewport;
    captureElements = assignBadges(afterAnalysis.elements, {
      width: viewport.width,
      height: viewport.height,
    });
    if (opts.matchLabel) {
      const matchedEl = captureElements.find((e) => e.label === opts.matchLabel);
      captureHighlightRef = matchedEl?.ref;
    }
    if (captureHighlightRef == null && opts.selectorForBbox) {
      const box = await page.locator(opts.selectorForBbox).first().boundingBox().catch(() => null);
      if (box) {
        captureHighlightBbox = [box.x, box.y, box.width, box.height];
      }
    }
  } catch {
    captureElements = priorElements;
    captureHighlightRef = opts.fallbackHighlightRef;
    captureHighlightBbox = opts.fallbackHighlightBbox;
  }

  if (captureHighlightRef == null && captureHighlightBbox == null && opts.ensureHighlightBbox != null) {
    captureHighlightBbox = opts.ensureHighlightBbox;
  }

  return { captureElements, captureHighlightRef, captureHighlightBbox };
}

function targetHints(step: { ref?: number; selector?: string; label_query?: string }): string {
  return [
    step.ref != null && `ref:${step.ref}`,
    step.selector && `selector:"${step.selector}"`,
    step.label_query && `label_query:"${step.label_query}"`,
  ]
    .filter(Boolean)
    .join(', ');
}

async function runCaptureAction(
  ctx: ActionRuntimeContext,
): Promise<StepResult> {
  const page = ctx.pageRef.current;
  const screenshot = await captureStep({
    page,
    stepNumber: ctx.stepNum,
    outputDir: ctx.outputDir,
    elements: ctx.elements,
    preset: ctx.preset,
    plan: ctx.licensePlan,
    outputFormat: ctx.input.output_format,
    scale: ctx.input.scale,
    theme: ctx.input.theme,
  });
  return {
    step_number: ctx.stepNum,
    action: 'capture',
    screenshot,
    elements: ctx.elements,
    meta: ctx.meta,
  };
}

async function runClickAction(
  ctx: ActionRuntimeContext,
  step: Extract<FlowStep, { action: 'click' }>,
): Promise<StepResult> {
  let page = ctx.pageRef.current;
  const elements = ctx.elements;

  const { element: el, effectiveBbox: clickBbox, resolvedBy: clickResolvedBy } = await resolveStepTarget(page, elements, step);
  if (!el && !clickBbox) {
    const screenshot = await captureStep({
      page,
      stepNumber: ctx.stepNum,
      outputDir: ctx.outputDir,
      elements: ctx.elements,
      preset: ctx.preset,
      plan: ctx.licensePlan,
      outputFormat: ctx.input.output_format,
      scale: ctx.input.scale,
      theme: ctx.input.theme,
    });
    return {
      step_number: ctx.stepNum,
      action: 'click',
      screenshot,
      meta: ctx.meta,
      status: 'error',
      error: {
        type: 'element_not_found',
        message: `Target not found (tried: ${targetHints(step)}). Page may have changed.`,
        suggestion: 'Re-run capture_page to get updated refs, or use selector/label_query.',
      },
    };
  }

  const [ex, ey, ew, eh] = clickBbox!;
  const clickTarget = async () => {
    if (clickResolvedBy === 'selector' && step.selector != null) {
      await page.locator(step.selector).first().click();
    } else {
      await page.mouse.click(ex + ew / 2, ey + eh / 2);
    }
  };

  const tabResult = await clickAndMaybeSwitchTab(page, clickTarget);
  if (tabResult.switched) {
    ctx.pageRef.current = tabResult.page;
    page = tabResult.page;
  }

  if (!ctx.input.auto_capture_each_step) {
    return {
      step_number: ctx.stepNum,
      action: 'click',
      screenshot: '',
      meta: ctx.meta,
      target_ref: el?.ref ?? step.ref,
      target_label: el?.label,
      target_bbox: clickBbox ?? undefined,
      description: step.description,
    };
  }

  try {
    await waitForPage(page, {
      strategy: ctx.input.default_wait?.strategy ?? 'auto',
      timeout: ctx.input.default_wait?.timeout ?? 3000,
    });
  } catch {
    // Navigation-induced context change: continue with post-action re-analysis fallback.
  }

  const { captureElements, captureHighlightRef, captureHighlightBbox } = await reanalyzePageForCapture(
    page,
    ctx,
    elements,
    {
      matchLabel: el?.label,
      selectorForBbox: el ? null : step.selector,
      fallbackHighlightRef: el?.ref,
      fallbackHighlightBbox: el ? undefined : (clickBbox ?? undefined),
      ensureHighlightBbox: clickBbox ?? undefined,
    },
  );

  const screenshot = await captureStep({
    page,
    stepNumber: ctx.stepNum,
    outputDir: ctx.outputDir,
    elements: captureElements,
    preset: ctx.preset,
    plan: ctx.licensePlan,
    outputFormat: ctx.input.output_format,
    scale: ctx.input.scale,
    theme: ctx.input.theme,
    actionAnnotation:
      captureHighlightRef != null
        ? { type: 'click_icon', ref: captureHighlightRef }
        : captureHighlightBbox != null
          ? { type: 'click_icon', bbox: captureHighlightBbox }
          : undefined,
    highlightRef: captureHighlightRef,
    description: step.description,
    highlightBbox: captureHighlightBbox,
    calloutStyle: {
      ...(step.callout_background ? { background: step.callout_background } : {}),
      ...(step.callout_border_color ? { borderColor: step.callout_border_color } : {}),
      ...(step.callout_text_color ? { textColor: step.callout_text_color } : {}),
    },
  });

  return {
    step_number: ctx.stepNum,
    action: 'click',
    screenshot,
    meta: ctx.meta,
    target_ref: el?.ref ?? step.ref,
    target_label: el?.label,
    target_bbox: captureHighlightBbox ?? clickBbox ?? undefined,
    description: step.description,
    annotation: { type: 'click_icon', position: [ex, ey] },
  };
}

async function runFillAction(
  ctx: ActionRuntimeContext,
  step: Extract<FlowStep, { action: 'fill' }>,
): Promise<StepResult> {
  const page = ctx.pageRef.current;
  const elements = ctx.elements;
  const { element: fillEl, effectiveBbox: fillBbox, resolvedBy: fillResolvedBy } = await resolveStepTarget(page, elements, step);

  if (!fillEl && !fillBbox) {
    const screenshot = await captureStep({
      page,
      stepNumber: ctx.stepNum,
      outputDir: ctx.outputDir,
      elements: ctx.elements,
      preset: ctx.preset,
      plan: ctx.licensePlan,
      outputFormat: ctx.input.output_format,
      scale: ctx.input.scale,
      theme: ctx.input.theme,
    });
    return {
      step_number: ctx.stepNum,
      action: 'fill',
      screenshot,
      meta: ctx.meta,
      status: 'error',
      error: {
        type: 'element_not_found',
        message: `Target not found (tried: ${targetHints(step)}).`,
        suggestion: 'Re-run capture_page to get updated refs, or use selector/label_query.',
      },
    };
  }

  const [fx, fy, fw, fh] = fillBbox!;
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

  if (fillResolvedBy === 'selector' && step.selector != null) {
    await page.locator(step.selector).first().click();
    await page.keyboard.press(`${modifier}+a`);
    await page.keyboard.type(step.value);
  } else {
    await page.mouse.click(fx + fw / 2, fy + fh / 2);
    await page.keyboard.press(`${modifier}+a`);
    await page.keyboard.type(step.value);
  }

  if (!ctx.input.auto_capture_each_step) {
    return {
      step_number: ctx.stepNum,
      action: 'fill',
      screenshot: '',
      meta: ctx.meta,
      target_ref: fillEl?.ref ?? step.ref,
      target_bbox: fillBbox ?? undefined,
      description: step.description,
      filled_value: step.value,
    };
  }

  const fillHighlightRef = fillEl?.ref;
  const fillHighlightBbox = fillEl ? undefined : (fillBbox ?? undefined);
  const fillBadgeColor = step.badge_color ?? ctx.input.badge_color;
  const screenshot = await captureStep({
    page,
    stepNumber: ctx.stepNum,
    outputDir: ctx.outputDir,
    elements: ctx.elements,
    preset: ctx.preset,
    plan: ctx.licensePlan,
    outputFormat: ctx.input.output_format,
    scale: ctx.input.scale,
    theme: ctx.input.theme,
    actionAnnotation:
      fillHighlightRef != null
        ? { type: 'step_number', ref: fillHighlightRef, number: ctx.stepNum, color: fillBadgeColor }
        : { type: 'step_number', bbox: fillHighlightBbox, number: ctx.stepNum, color: fillBadgeColor },
    highlightRef: fillHighlightRef,
    description: step.description,
    highlightBbox: fillHighlightBbox,
    calloutStyle: {
      ...(step.callout_background ? { background: step.callout_background } : {}),
      ...(step.callout_border_color ? { borderColor: step.callout_border_color } : {}),
      ...(step.callout_text_color ? { textColor: step.callout_text_color } : {}),
    },
  });

  return {
    step_number: ctx.stepNum,
    action: 'fill',
    screenshot,
    meta: ctx.meta,
    target_ref: fillEl?.ref ?? step.ref,
    target_label: fillEl?.label,
    target_bbox: fillBbox ?? undefined,
    description: step.description,
    filled_value: step.value,
    annotation: { type: 'step_number', position: [fx, fy], badge_number: ctx.stepNum },
  };
}

async function runScrollAction(
  ctx: ActionRuntimeContext,
  step: Extract<FlowStep, { action: 'scroll' }>,
): Promise<StepResult> {
  const page = ctx.pageRef.current;
  const scrollMap: Record<typeof step.direction, [number, number]> = {
    up: [0, -step.amount],
    down: [0, step.amount],
    left: [-step.amount, 0],
    right: [step.amount, 0],
  };
  const [sx, sy] = scrollMap[step.direction];
  await page.mouse.wheel(sx, sy);
  await page.waitForTimeout(300);

  if (!ctx.input.auto_capture_each_step) {
    return { step_number: ctx.stepNum, action: 'scroll', screenshot: '', meta: ctx.meta };
  }

  const analysisAfterScroll = await analyzeDOM(page, ctx.resolveSecurityForUrl(page.url()));
  updateFrameStats(ctx.frameStats, analysisAfterScroll);
  const viewport = page.viewportSize() ?? config.capture.default_viewport;
  const els2 = assignBadges(analysisAfterScroll.elements, {
    width: viewport.width,
    height: viewport.height,
  });
  const screenshot = await captureStep({
    page,
    stepNumber: ctx.stepNum,
    outputDir: ctx.outputDir,
    elements: els2,
    preset: ctx.preset,
    plan: ctx.licensePlan,
    outputFormat: ctx.input.output_format,
    scale: ctx.input.scale,
    theme: ctx.input.theme,
  });
  return {
    step_number: ctx.stepNum,
    action: 'scroll',
    screenshot,
    elements: els2,
    meta: await getPageMeta(page),
  };
}

async function runHoverAction(
  ctx: ActionRuntimeContext,
  step: Extract<FlowStep, { action: 'hover' }>,
): Promise<StepResult> {
  const page = ctx.pageRef.current;
  const { element: hoverEl, effectiveBbox: hoverBbox, resolvedBy: hoverResolvedBy } = await resolveStepTarget(page, ctx.elements, step);
  if (!hoverEl && !hoverBbox) {
    return {
      step_number: ctx.stepNum,
      action: 'hover',
      screenshot: '',
      meta: ctx.meta,
      status: 'error',
      error: {
        type: 'element_not_found',
        message: 'Target not found for hover.',
        suggestion: 'Re-run capture_page or use selector/label_query.',
      },
    };
  }

  const [hx, hy, hw, hh] = hoverBbox!;
  if (hoverResolvedBy === 'selector' && step.selector != null) {
    await page.locator(step.selector).first().hover();
  } else {
    await page.mouse.move(hx + hw / 2, hy + hh / 2);
  }
  await page.waitForTimeout(500);

  if (!ctx.input.auto_capture_each_step) {
    return {
      step_number: ctx.stepNum,
      action: 'hover',
      screenshot: '',
      meta: ctx.meta,
      target_ref: hoverEl?.ref ?? step.ref,
      target_bbox: hoverBbox ?? undefined,
    };
  }

  const screenshot = await captureStep({
    page,
    stepNumber: ctx.stepNum,
    outputDir: ctx.outputDir,
    elements: ctx.elements,
    preset: ctx.preset,
    plan: ctx.licensePlan,
    outputFormat: ctx.input.output_format,
    scale: ctx.input.scale,
    theme: ctx.input.theme,
  });

  return {
    step_number: ctx.stepNum,
    action: 'hover',
    screenshot,
    meta: ctx.meta,
    target_ref: hoverEl?.ref ?? step.ref,
    target_label: hoverEl?.label,
    target_bbox: hoverBbox ?? undefined,
  };
}

async function runSelectAction(
  ctx: ActionRuntimeContext,
  step: Extract<FlowStep, { action: 'select' }>,
): Promise<StepResult> {
  const page = ctx.pageRef.current;
  const elements = ctx.elements;
  const { element: selEl, effectiveBbox: resolvedSelectBbox, resolvedBy: selResolvedBy } = await resolveStepTarget(page, elements, step);
  if (!selEl && !resolvedSelectBbox) {
    return {
      step_number: ctx.stepNum,
      action: 'select',
      screenshot: '',
      meta: ctx.meta,
      status: 'error',
      error: {
        type: 'element_not_found',
        message: 'Target not found for select.',
        suggestion: 'Re-run capture_page or use selector/label_query.',
      },
    };
  }

  const selBbox = resolvedSelectBbox!;
  const [sx2, sy2, sw2] = selBbox;
  const selectStrategy = step.strategy ?? 'auto';

  const clickTargetToOpenCombobox = async () => {
    if (selResolvedBy === 'selector' && step.selector != null) {
      await page.locator(step.selector).first().click();
    } else {
      await page.mouse.click(sx2 + sw2 / 2, sy2 + selBbox[3] / 2);
    }
  };

  const tryNativeSelect = async (): Promise<boolean> => {
    try {
      if (selResolvedBy === 'selector' && step.selector != null) {
        await page.selectOption(step.selector, step.value);
        return true;
      }
      if (selEl) {
        await page.selectOption(`[data-lumoshot-ref="${selEl.ref}"]`, step.value);
        return true;
      }
    } catch {
      // fall through
    }
    return false;
  };

  const tryComboboxSelect = async (): Promise<boolean> => {
    try {
      await clickTargetToOpenCombobox();
      await page.waitForTimeout(300);

      const candidates = [
        page.getByRole('option', { name: step.value }).first(),
        page.locator('[role="option"]').filter({ hasText: step.value }).first(),
        page.locator('[role="listbox"] [role="option"]').filter({ hasText: step.value }).first(),
        page.locator(`[role="option"][data-value="${step.value}"]`).first(),
        page.locator(`[role="option"][value="${step.value}"]`).first(),
        page.locator(`[data-value="${step.value}"]`).first(),
        page.locator(`[value="${step.value}"]`).first(),
      ];

      for (const candidate of candidates) {
        try {
          const count = await candidate.count();
          if (count < 1) continue;
          if (!(await candidate.isVisible().catch(() => false))) continue;
          await candidate.click();
          return true;
        } catch {
          // try next candidate
        }
      }

      const comboInputCandidates = [
        page.locator('input[role="combobox"]').first(),
        page.locator('[role="combobox"] input').first(),
      ];
      for (const inputCandidate of comboInputCandidates) {
        const exists = await inputCandidate.count().catch(() => 0);
        if (exists < 1) continue;
        const visible = await inputCandidate.isVisible().catch(() => false);
        if (!visible) continue;
        await inputCandidate.fill(step.value).catch(() => {});
        await page.keyboard.press('Enter').catch(() => {});
        return true;
      }

      await page.keyboard.press('ArrowDown').catch(() => {});
      await page.keyboard.press('Enter').catch(() => {});
      return true;
    } catch {
      // fall through
    }
    return false;
  };

  let selectSucceeded = false;
  if (selectStrategy === 'native') {
    selectSucceeded = await tryNativeSelect();
  } else if (selectStrategy === 'combobox') {
    selectSucceeded = await tryComboboxSelect();
  } else {
    selectSucceeded = await tryNativeSelect();
    if (!selectSucceeded) {
      selectSucceeded = await tryComboboxSelect();
    }
  }

  if (selectSucceeded) {
    try {
      await waitForPage(page, {
        strategy: ctx.input.default_wait?.strategy ?? 'auto',
        timeout: ctx.input.default_wait?.timeout ?? 3000,
      });
    } catch {
      // Select may not trigger navigation.
    }
  } else {
    const screenshot = ctx.input.auto_capture_each_step
      ? await captureStep({
          page,
          stepNumber: ctx.stepNum,
          outputDir: ctx.outputDir,
          elements: ctx.elements,
          preset: ctx.preset,
          plan: ctx.licensePlan,
          outputFormat: ctx.input.output_format,
          scale: ctx.input.scale,
          theme: ctx.input.theme,
          highlightRef: selEl?.ref,
          description: step.description,
          highlightBbox: selEl ? undefined : (selBbox ?? undefined),
          calloutStyle: {
            ...(step.callout_background ? { background: step.callout_background } : {}),
            ...(step.callout_border_color ? { borderColor: step.callout_border_color } : {}),
            ...(step.callout_text_color ? { textColor: step.callout_text_color } : {}),
          },
        })
      : '';

    return {
      step_number: ctx.stepNum,
      action: 'select',
      screenshot,
      meta: ctx.meta,
      status: 'error',
      target_ref: selEl?.ref ?? step.ref,
      target_label: selEl?.label,
      target_bbox: selBbox ?? undefined,
      description: step.description,
      error: {
        type: 'select_option_not_found',
        message: `Failed to select "${step.value}" using strategy "${selectStrategy}".`,
        suggestion: 'Try strategy="combobox" for custom dropdowns, or re-run capture_page for updated targets.',
      },
    };
  }

  if (!ctx.input.auto_capture_each_step) {
    return {
      step_number: ctx.stepNum,
      action: 'select',
      screenshot: '',
      meta: ctx.meta,
      target_ref: selEl?.ref ?? step.ref,
      target_bbox: selBbox ?? undefined,
      description: step.description,
    };
  }

  const { captureElements, captureHighlightRef, captureHighlightBbox } = await reanalyzePageForCapture(
    page,
    ctx,
    elements,
    {
      matchLabel: selEl?.label,
      selectorForBbox: selEl ? null : (selResolvedBy === 'selector' ? step.selector : null),
      fallbackHighlightRef: selEl?.ref,
      fallbackHighlightBbox: selEl ? undefined : (selBbox ?? undefined),
    },
  );

  const screenshot = await captureStep({
    page,
    stepNumber: ctx.stepNum,
    outputDir: ctx.outputDir,
    elements: captureElements,
    preset: ctx.preset,
    plan: ctx.licensePlan,
    outputFormat: ctx.input.output_format,
    scale: ctx.input.scale,
    theme: ctx.input.theme,
    highlightRef: captureHighlightRef,
    description: step.description,
    highlightBbox: captureHighlightBbox,
    calloutStyle: {
      ...(step.callout_background ? { background: step.callout_background } : {}),
      ...(step.callout_border_color ? { borderColor: step.callout_border_color } : {}),
      ...(step.callout_text_color ? { textColor: step.callout_text_color } : {}),
    },
  });
  return {
    step_number: ctx.stepNum,
    action: 'select',
    screenshot,
    meta: ctx.meta,
    target_ref: selEl?.ref ?? step.ref,
    target_label: selEl?.label,
    target_bbox: captureHighlightBbox ?? selBbox ?? undefined,
    description: step.description,
  };
}

async function runWaitAction(
  ctx: ActionRuntimeContext,
  step: Extract<FlowStep, { action: 'wait' }>,
): Promise<StepResult> {
  const page = ctx.pageRef.current;
  try {
    await waitForPage(page, {
      strategy: step.strategy ?? ctx.input.default_wait?.strategy ?? 'auto',
      selector: step.selector,
      timeout: step.timeout ?? ctx.input.default_wait?.timeout ?? config.capture.default_wait_timeout,
    });
    return {
      step_number: ctx.stepNum,
      action: 'wait',
      screenshot: '',
      meta: ctx.meta,
    };
  } catch {
    const screenshot = await captureStep({
      page,
      stepNumber: ctx.stepNum,
      outputDir: ctx.outputDir,
      elements: ctx.elements,
      preset: ctx.preset,
      plan: ctx.licensePlan,
      outputFormat: ctx.input.output_format,
      scale: ctx.input.scale,
      theme: ctx.input.theme,
    });
    return {
      step_number: ctx.stepNum,
      action: 'wait',
      screenshot,
      meta: ctx.meta,
      status: 'timeout',
      error: {
        type: 'wait_timeout',
        message: `${step.selector ? `Selector '${step.selector}'` : 'Wait condition'} not fulfilled within timeout.`,
        suggestion: `Check if navigation succeeded. Current URL: ${page.url()}`,
      },
    };
  }
}

export async function runFlowStep(ctx: RunFlowStepContext): Promise<StepResult> {
  switch (ctx.step.action) {
    case 'capture':
      return runCaptureAction(ctx);
    case 'click':
      return runClickAction(ctx, ctx.step);
    case 'fill':
      return runFillAction(ctx, ctx.step);
    case 'scroll':
      return runScrollAction(ctx, ctx.step);
    case 'hover':
      return runHoverAction(ctx, ctx.step);
    case 'select':
      return runSelectAction(ctx, ctx.step);
    case 'wait':
      return runWaitAction(ctx, ctx.step);
  }
}
