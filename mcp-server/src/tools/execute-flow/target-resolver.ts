import type { Page } from 'playwright';
import type { BoundingBox, InteractiveElement } from '../../types.js';

export type TargetResolvedBy = 'ref' | 'selector' | 'label_query' | 'none';

export interface StepTargetInput {
  ref?: number;
  selector?: string;
  label_query?: string;
}

export interface ResolvedStepTarget {
  element: InteractiveElement | null;
  effectiveBbox: BoundingBox | null;
  resolvedBy: TargetResolvedBy;
}

/**
 * Resolve an interactive target from step fields (ref -> selector -> label_query).
 *
 * Returns the matched InteractiveElement (if found in the current elements list) and
 * an effectiveBbox that can be used for both interaction coordinates and annotations.
 * When resolved via `selector`, the bbox comes from Playwright; the element may be null
 * if the selector target is not in the analyzed elements list.
 */
export async function resolveStepTarget(
  page: Page,
  elements: InteractiveElement[],
  step: StepTargetInput,
): Promise<ResolvedStepTarget> {
  if (step.ref != null) {
    const element = elements.find((e) => e.ref === step.ref) ?? null;
    return { element, effectiveBbox: element?.bbox ?? null, resolvedBy: 'ref' };
  }

  if (step.selector != null) {
    try {
      const box = await page.locator(step.selector).first().boundingBox();
      if (!box) {
        return { element: null, effectiveBbox: null, resolvedBy: 'selector' };
      }
      const effectiveBbox: BoundingBox = [box.x, box.y, box.width, box.height];
      const element = elements.find((e) => {
        const [ex, ey] = e.bbox;
        return Math.abs(ex - box.x) < 10 && Math.abs(ey - box.y) < 10;
      }) ?? null;
      return { element, effectiveBbox, resolvedBy: 'selector' };
    } catch {
      return { element: null, effectiveBbox: null, resolvedBy: 'selector' };
    }
  }

  if (step.label_query != null) {
    const q = step.label_query.toLowerCase().trim();
    const element = elements.find((e) => e.label.toLowerCase().includes(q)) ?? null;
    return { element, effectiveBbox: element?.bbox ?? null, resolvedBy: 'label_query' };
  }

  return { element: null, effectiveBbox: null, resolvedBy: 'none' };
}

