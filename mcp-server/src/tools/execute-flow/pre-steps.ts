import { waitForPage } from '../../engine/browser.js';
import { analyzeDOM } from '../../engine/dom-analyzer.js';
import { config } from '../../config.js';
import type { ExecuteFlowInput, PreFlowStep } from './schema.js';
import { resolveStepTarget } from './target-resolver.js';
import type { FrameStatsState, SecurityResolver } from './shared.js';
import { updateFrameStats } from './shared.js';
import { clickAndMaybeSwitchTab } from './tab-tracker.js';

type WaitLike = {
  strategy?: 'auto' | 'selector' | 'timeout';
  selector?: string;
  timeout?: number;
};

interface RunPreStepsOptions {
  pageRef: { current: import('playwright').Page };
  preSteps: PreFlowStep[];
  defaultWait?: ExecuteFlowInput['default_wait'];
  frameStats: FrameStatsState;
  resolveSecurityForUrl: SecurityResolver;
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

function waitConfig(defaultWait: ExecuteFlowInput['default_wait'], override?: WaitLike): WaitLike {
  return {
    strategy: override?.strategy ?? defaultWait?.strategy ?? 'auto',
    selector: override?.selector,
    timeout: override?.timeout ?? defaultWait?.timeout ?? config.capture.default_wait_timeout,
  };
}

async function resolvePreStepTarget(
  page: import('playwright').Page,
  step: { ref?: number; selector?: string; label_query?: string },
  frameStats: FrameStatsState,
  resolveSecurityForUrl: SecurityResolver,
) {
  const analysis = await analyzeDOM(page, resolveSecurityForUrl(page.url()));
  updateFrameStats(frameStats, analysis);
  return resolveStepTarget(page, analysis.elements, step);
}

export async function runPreSteps(opts: RunPreStepsOptions): Promise<void> {
  const { pageRef, preSteps, defaultWait, frameStats, resolveSecurityForUrl } = opts;

  for (let i = 0; i < preSteps.length; i++) {
    const step = preSteps[i];
    const idx = i + 1;
    let page = pageRef.current;

    try {
      if (step.action === 'navigate') {
        await page.goto(step.url, { waitUntil: 'domcontentloaded' });
        await waitForPage(page, waitConfig(defaultWait, step.wait));
        continue;
      }

      if (step.action === 'wait') {
        await waitForPage(page, waitConfig(defaultWait, step));
        continue;
      }

      const { element, effectiveBbox, resolvedBy } = await resolvePreStepTarget(
        page,
        step,
        frameStats,
        resolveSecurityForUrl,
      );

      if (!element && !effectiveBbox) {
        throw new Error(`Target not found (tried: ${targetHints(step)}).`);
      }

      if (step.action === 'click') {
        const [x, y, w, h] = effectiveBbox!;
        const clickTarget = async () => {
          if (resolvedBy === 'selector' && step.selector != null) {
            await page.locator(step.selector).first().click();
          } else {
            await page.mouse.click(x + w / 2, y + h / 2);
          }
        };
        const tabResult = await clickAndMaybeSwitchTab(page, clickTarget);
        if (tabResult.switched) {
          pageRef.current = tabResult.page;
          page = tabResult.page;
        }
        await waitForPage(page, waitConfig(defaultWait));
        continue;
      }

      if (step.action === 'fill') {
        const [x, y, w, h] = effectiveBbox!;
        const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

        if (resolvedBy === 'selector' && step.selector != null) {
          await page.locator(step.selector).first().click();
          await page.keyboard.press(`${modifier}+a`);
          await page.keyboard.type(step.value);
        } else {
          await page.mouse.click(x + w / 2, y + h / 2);
          await page.keyboard.press(`${modifier}+a`);
          await page.keyboard.type(step.value);
        }
        continue;
      }

      if (step.action === 'select') {
        const [x, y, w, h] = effectiveBbox!;
        const strategy = step.strategy ?? 'auto';

        const clickTargetToOpenCombobox = async () => {
          if (resolvedBy === 'selector' && step.selector != null) {
            await page.locator(step.selector).first().click();
          } else {
            await page.mouse.click(x + w / 2, y + h / 2);
          }
        };

        const tryNativeSelect = async (): Promise<boolean> => {
          try {
            if (resolvedBy === 'selector' && step.selector != null) {
              await page.selectOption(step.selector, step.value);
              return true;
            }
            if (element) {
              await page.selectOption(`[data-lumoshot-ref="${element.ref}"]`, step.value);
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
              const count = await candidate.count().catch(() => 0);
              if (count < 1) continue;
              if (!(await candidate.isVisible().catch(() => false))) continue;
              await candidate.click();
              return true;
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

        let succeeded = false;
        if (strategy === 'native') {
          succeeded = await tryNativeSelect();
        } else if (strategy === 'combobox') {
          succeeded = await tryComboboxSelect();
        } else {
          succeeded = await tryNativeSelect();
          if (!succeeded) {
            succeeded = await tryComboboxSelect();
          }
        }

        if (!succeeded) {
          throw new Error(`Failed to select "${step.value}" using strategy "${strategy}".`);
        }

        await waitForPage(page, waitConfig(defaultWait));
      }
    } catch (err) {
      throw new Error(`pre_steps[${idx}] ${step.action} failed: ${String(err)}`);
    }
  }
}
