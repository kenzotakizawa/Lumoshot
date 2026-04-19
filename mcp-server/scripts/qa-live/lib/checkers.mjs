import {
  checkScreenshotArtifact,
  countByType,
  getLabelHits,
  hasLabel,
  normalizeLabel,
} from './utils.mjs';

export function checkW3Forms(result) {
  const typeCounts = countByType(result.elements);
  const labels = result.elements.map((el) => el.label).filter(Boolean);
  const inputs = typeCounts.input ?? 0;
  const firstNameFound = hasLabel(labels, 'first name');
  const formsContextFound = hasLabel(labels, 'html forms') || hasLabel(labels, 'forms');
  const screenshotCheck = checkScreenshotArtifact(result.screenshot);
  const pass = inputs >= 2 && firstNameFound && formsContextFound && screenshotCheck.ok;

  const failedCriteria = [];
  if (inputs < 2) failedCriteria.push(`inputs=${inputs} (need >=2)`);
  if (!firstNameFound) failedCriteria.push('label "first name" not found');
  if (!formsContextFound) failedCriteria.push('label "html forms" / "forms" not found');
  if (!screenshotCheck.ok) failedCriteria.push(screenshotCheck.reason);

  return {
    pass,
    reason: pass
      ? `inputs=${inputs}, first_name_label=ok, forms_context=ok, ${screenshotCheck.reason}`
      : `failed: ${failedCriteria.join('; ')}`,
    failed_criteria: failedCriteria,
  };
}

export function checkWikipediaCapture(result) {
  const typeCounts = countByType(result.elements);
  const labels = result.elements.map((el) => el.label).filter(Boolean);
  const inputs = typeCounts.input ?? 0;
  const links = typeCounts.link ?? 0;
  const hasSearch = hasLabel(labels, 'search') || hasLabel(labels, '検索');
  const hasWikiBrand = hasLabel(labels, 'wikipedia') || hasLabel(labels, 'ウィキペディア');
  const screenshotCheck = checkScreenshotArtifact(result.screenshot);
  const pass = inputs >= 1 && links >= 8 && hasSearch && hasWikiBrand && screenshotCheck.ok;

  const failedCriteria = [];
  if (inputs < 1) failedCriteria.push(`inputs=${inputs} (need >=1)`);
  if (links < 8) failedCriteria.push(`links=${links} (need >=8)`);
  if (!hasSearch) failedCriteria.push('search label not found');
  if (!hasWikiBrand) failedCriteria.push('Wikipedia label not found');
  if (!screenshotCheck.ok) failedCriteria.push(screenshotCheck.reason);

  return {
    pass,
    reason: pass
      ? `inputs=${inputs}, links=${links}, search/wiki=ok, ${screenshotCheck.reason}`
      : `failed: ${failedCriteria.join('; ')}`,
    failed_criteria: failedCriteria,
  };
}

export function checkAmazonLike(result) {
  const typeCounts = countByType(result.elements);
  const labels = result.elements.map((el) => el.label).filter(Boolean);
  const inputs = typeCounts.input ?? 0;
  const links = typeCounts.link ?? 0;
  const hasSearch = hasLabel(labels, 'search') || hasLabel(labels, '検索');
  const hasAccount =
    hasLabel(labels, 'account')
    || hasLabel(labels, 'sign in')
    || hasLabel(labels, 'アカウント')
    || hasLabel(labels, 'ログイン')
    || hasLabel(labels, 'サインイン');
  const hasCart = hasLabel(labels, 'cart') || hasLabel(labels, 'カート');
  const screenshotCheck = checkScreenshotArtifact(result.screenshot);
  const pass = inputs >= 1 && links >= 3 && hasSearch && hasAccount && hasCart && screenshotCheck.ok;

  const failedCriteria = [];
  if (inputs < 1) failedCriteria.push(`inputs=${inputs} (need >=1)`);
  if (links < 3) failedCriteria.push(`links=${links} (need >=3)`);
  if (!hasSearch) failedCriteria.push('label "search" not found');
  if (!hasAccount) failedCriteria.push('label "account" / "sign in" not found');
  if (!hasCart) failedCriteria.push('label "cart" not found');
  if (!screenshotCheck.ok) failedCriteria.push(screenshotCheck.reason);

  return {
    pass,
    reason: pass
      ? `inputs=${inputs}, links=${links}, search/account/cart(multilang)=ok, ${screenshotCheck.reason}`
      : `failed: ${failedCriteria.join('; ')}`,
    failed_criteria: failedCriteria,
  };
}

export function checkW3FormsFlow(result) {
  const steps = Array.isArray(result?.steps) ? result.steps : [];
  const screenshots = steps.filter((s) => s?.screenshot);
  const screenshotErrors = [];
  for (const step of screenshots) {
    const c = checkScreenshotArtifact(step.screenshot);
    if (!c.ok) screenshotErrors.push(`step_${step.step_number}:${c.reason}`);
  }

  const fillAnnotated = steps.filter((s) => s.action === 'fill' && s.annotation?.type === 'step_number').length;
  const clickAnnotated = steps.filter((s) => s.action === 'click' && s.annotation?.type === 'click_icon').length;
  const errors = steps.filter((s) => s.status === 'error' || s.status === 'timeout').length;

  const pass =
    steps.length >= 3
    && screenshots.length >= 2
    && screenshotErrors.length === 0
    && fillAnnotated >= 1
    && clickAnnotated >= 1
    && errors === 0;

  const failedCriteria = [];
  if (steps.length < 3) failedCriteria.push(`steps=${steps.length} (need >=3)`);
  if (screenshots.length < 2) failedCriteria.push(`screenshots=${screenshots.length} (need >=2)`);
  if (screenshotErrors.length > 0) failedCriteria.push(`screenshot_errors=${screenshotErrors.join('|')}`);
  if (fillAnnotated < 1) failedCriteria.push(`fill_annotations=${fillAnnotated} (need >=1)`);
  if (clickAnnotated < 1) failedCriteria.push(`click_annotations=${clickAnnotated} (need >=1)`);
  if (errors > 0) failedCriteria.push(`step_errors=${errors} (need 0)`);

  return {
    pass,
    reason: pass
      ? `steps=${steps.length}, screenshots=${screenshots.length}, fill_annotations=${fillAnnotated}, click_annotations=${clickAnnotated}, errors=${errors}`
      : `failed: ${failedCriteria.join('; ')}`,
    failed_criteria: failedCriteria,
  };
}

export function checkWikipediaFlow(result, startUrl) {
  const steps = Array.isArray(result?.steps) ? result.steps : [];
  const screenshots = steps.filter((s) => s?.screenshot);
  const screenshotErrors = [];
  for (const step of screenshots) {
    const c = checkScreenshotArtifact(step.screenshot);
    if (!c.ok) screenshotErrors.push(`step_${step.step_number}:${c.reason}`);
  }

  const fillAnnotated = steps.filter((s) => s.action === 'fill' && s.annotation?.type === 'step_number').length;
  const clickAnnotated = steps.filter((s) => s.action === 'click' && s.annotation?.type === 'click_icon').length;
  const errors = steps.filter((s) => s.status === 'error' || s.status === 'timeout').length;
  const endUrl = result?.flow_meta?.end_url ?? '';
  const navigated = typeof endUrl === 'string' && endUrl.length > 0 && endUrl !== startUrl;

  const pass =
    steps.length >= 2
    && screenshots.length >= 2
    && screenshotErrors.length === 0
    && fillAnnotated >= 1
    && clickAnnotated >= 1
    && errors === 0
    && navigated;

  const failedCriteria = [];
  if (steps.length < 2) failedCriteria.push(`steps=${steps.length} (need >=2)`);
  if (screenshots.length < 2) failedCriteria.push(`screenshots=${screenshots.length} (need >=2)`);
  if (screenshotErrors.length > 0) failedCriteria.push(`screenshot_errors=${screenshotErrors.join('|')}`);
  if (fillAnnotated < 1) failedCriteria.push(`fill_annotations=${fillAnnotated} (need >=1)`);
  if (clickAnnotated < 1) failedCriteria.push(`click_annotations=${clickAnnotated} (need >=1)`);
  if (errors > 0) failedCriteria.push(`step_errors=${errors} (need 0)`);
  if (!navigated) failedCriteria.push(`navigation_not_observed (end_url=${endUrl || 'n/a'})`);

  return {
    pass,
    reason: pass
      ? `steps=${steps.length}, screenshots=${screenshots.length}, fill_annotations=${fillAnnotated}, click_annotations=${clickAnnotated}, navigated=ok`
      : `failed: ${failedCriteria.join('; ')}`,
    failed_criteria: failedCriteria,
  };
}
