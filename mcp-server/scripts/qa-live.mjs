import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── Retry configuration ───────────────────────────────────────────────────
const MAX_ATTEMPTS = Number(process.env.LUMOSHOT_LIVE_RETRIES ?? 3);
const BACKOFF_BASE_MS = Number(process.env.LUMOSHOT_LIVE_BACKOFF_MS ?? 2000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt) {
  // Attempt 1 → 0ms (no wait before first try)
  // Attempt 2 → BACKOFF_BASE_MS
  // Attempt 3 → BACKOFF_BASE_MS * 2
  return attempt <= 1 ? 0 : BACKOFF_BASE_MS * (attempt - 1);
}

// ─── Utility helpers ───────────────────────────────────────────────────────
function nowId() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function countByType(elements) {
  const counts = {};
  for (const el of elements) {
    counts[el.type] = (counts[el.type] ?? 0) + 1;
  }
  return counts;
}

function normalizeLabel(text) {
  return (text ?? '').trim().toLowerCase();
}

function hasLabel(labels, keyword) {
  const q = normalizeLabel(keyword);
  return labels.some((label) => normalizeLabel(label).includes(q));
}

function getLabelHits(labels, keywords) {
  return keywords.filter((keyword) => hasLabel(labels, keyword));
}

function checkScreenshotArtifact(path) {
  if (!path || !existsSync(path)) {
    return { ok: false, reason: 'screenshot file was not generated' };
  }

  const size = statSync(path).size;
  if (size < 10_000) {
    return { ok: false, reason: `screenshot file is too small (${size} bytes)` };
  }

  return { ok: true, reason: `screenshot_size=${size}bytes` };
}

// ─── Per-target checkers ───────────────────────────────────────────────────
function checkW3Forms(result) {
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

function checkEcommerceDemo(result) {
  const typeCounts = countByType(result.elements);
  const labels = result.elements.map((el) => el.label).filter(Boolean);
  const keyHits = getLabelHits(labels, ['product store', 'phones', 'laptops', 'monitors']);
  const categoryHits = getLabelHits(labels, ['phones', 'laptops', 'monitors']).length;
  const productLinkCount = labels.filter((label) =>
    ['samsung', 'nokia', 'nexus', 'iphone', 'sony', 'macbook'].some((k) =>
      normalizeLabel(label).includes(k)
    )
  ).length;
  const links = typeCounts.link ?? 0;
  const screenshotCheck = checkScreenshotArtifact(result.screenshot);
  const pass = links >= 6 && keyHits.length >= 3 && categoryHits >= 2 && productLinkCount >= 1 && screenshotCheck.ok;

  const failedCriteria = [];
  if (links < 6) failedCriteria.push(`links=${links} (need >=6)`);
  if (keyHits.length < 3) failedCriteria.push(`key_hits=${keyHits.join('|') || 'none'} (need >=3)`);
  if (categoryHits < 2) failedCriteria.push(`category_hits=${categoryHits} (need >=2)`);
  if (productLinkCount < 1) failedCriteria.push(`product_links=${productLinkCount} (need >=1)`);
  if (!screenshotCheck.ok) failedCriteria.push(screenshotCheck.reason);

  return {
    pass,
    reason: pass
      ? `links=${links}, key_hits=${keyHits.join('|')}, product_links=${productLinkCount}, ${screenshotCheck.reason}`
      : `failed: ${failedCriteria.join('; ')}`,
    failed_criteria: failedCriteria,
  };
}

function checkAmazonLike(result) {
  const typeCounts = countByType(result.elements);
  const labels = result.elements.map((el) => el.label).filter(Boolean);
  const inputs = typeCounts.input ?? 0;
  const links = typeCounts.link ?? 0;
  const hasSearch = hasLabel(labels, 'search');
  const hasAccount = hasLabel(labels, 'account') || hasLabel(labels, 'sign in');
  const hasCart = hasLabel(labels, 'cart');
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
      ? `inputs=${inputs}, links=${links}, search/account/cart=ok, ${screenshotCheck.reason}`
      : `failed: ${failedCriteria.join('; ')}`,
    failed_criteria: failedCriteria,
  };
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const strict = process.env.LUMOSHOT_LIVE_STRICT === '1';
  const includeAmazon = process.env.LUMOSHOT_INCLUDE_AMAZON === '1';

  const originalHome = process.env.HOME ?? '';
  const originalUserProfile = process.env.USERPROFILE ?? '';
  const originalPlaywrightPath = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '';
  const originalCwd = process.cwd();

  const runId = nowId();
  const outputRoot = process.env.LUMOSHOT_LIVE_OUTPUT_DIR ?? join(originalCwd, 'lumoshot-live-output', runId);

  const tempRoot = mkdtempSync(join(tmpdir(), 'lumoshot-live-'));
  let hasRequiredFailure = false;
  let hasAnyFailure = false;

  const targets = [
    {
      id: 'w3schools_forms',
      required: true,
      url: 'https://www.w3schools.com/html/html_forms.asp',
      wait: {
        strategy: 'selector',
        selector: 'h1',
        timeout: 15000,
      },
      checker: checkW3Forms,
    },
    {
      id: 'ecommerce_demo',
      required: true,
      url: 'https://www.demoblaze.com/',
      wait: {
        strategy: 'selector',
        selector: '#tbodyid',
        timeout: 15000,
      },
      checker: checkEcommerceDemo,
    },
  ];

  if (includeAmazon) {
    targets.push({
      id: 'amazon_home',
      required: false,
      url: 'https://www.amazon.com/',
      wait: {
        strategy: 'selector',
        selector: '#twotabsearchtextbox',
        timeout: 18000,
      },
      checker: checkAmazonLike,
    });
  }

  const summary = {
    run_id: runId,
    generated_at: new Date().toISOString(),
    output_root: outputRoot,
    strict,
    include_amazon: includeAmazon,
    max_attempts: MAX_ATTEMPTS,
    backoff_base_ms: BACKOFF_BASE_MS,
    results: [],
  };

  try {
    mkdirSync(join(tempRoot, '.lumoshot'), { recursive: true });
    mkdirSync(outputRoot, { recursive: true });

    process.env.HOME = tempRoot;
    process.env.USERPROFILE = tempRoot;
    process.env.PLAYWRIGHT_BROWSERS_PATH = join(originalHome, 'Library', 'Caches', 'ms-playwright');
    process.chdir(tempRoot);

    writeFileSync(
      join(tempRoot, 'lumoshot.config.json'),
      JSON.stringify(
        {
          security: {
            trusted_domains: [],
          },
          output: {
            directory: outputRoot,
          },
          capture: {
            default_wait_timeout: 12000,
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    const { capturePage } = await import('../dist/tools/capture-page.js');
    const { closeBrowser } = await import('../dist/engine/browser.js');

    for (const target of targets) {
      const totalStarted = Date.now();
      const attemptRecords = [];
      let finalRecord = null;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const wait = backoffMs(attempt);
        if (wait > 0) {
          process.stdout.write(
            `[RETRY] ${target.id} (attempt ${attempt}/${MAX_ATTEMPTS}) after ${wait}ms backoff\n`
          );
          await sleep(wait);
        }

        const attemptStarted = Date.now();
        let attemptRecord;

        try {
          const result = await capturePage({
            url: target.url,
            wait: target.wait ?? { strategy: 'auto', timeout: 15000 },
            capture_mode: 'auto',
          });

          const check = target.checker(result);
          attemptRecord = {
            attempt,
            status: check.pass ? 'pass' : 'fail',
            reason: check.reason,
            failed_criteria: check.failed_criteria ?? [],
            duration_ms: Date.now() - attemptStarted,
            url: target.url,
            screenshot: result.screenshot,
            element_count: result.elements.length,
            element_types: countByType(result.elements),
            labels_sample: result.elements
              .map((el) => el.label)
              .filter(Boolean)
              .slice(0, 20),
            redacted_count: result.diagnostics.redacted_count,
            capture_mode_used: result.diagnostics.capture_mode_used,
            iframe_cross_origin: result.diagnostics.iframe_cross_origin ?? false,
            iframe_frame_stats: result.diagnostics.iframe_frame_stats ?? null,
          };

          attemptRecords.push(attemptRecord);

          if (check.pass) {
            // Success — no more retries needed
            finalRecord = {
              id: target.id,
              required: target.required,
              status: 'pass',
              reason: check.reason,
              total_duration_ms: Date.now() - totalStarted,
              attempts_used: attempt,
              attempts: attemptRecords,
              screenshot: result.screenshot,
              element_count: result.elements.length,
              element_types: countByType(result.elements),
              labels_sample: attemptRecord.labels_sample,
              redacted_count: result.diagnostics.redacted_count,
              capture_mode_used: result.diagnostics.capture_mode_used,
              iframe_cross_origin: result.diagnostics.iframe_cross_origin ?? false,
              iframe_frame_stats: result.diagnostics.iframe_frame_stats ?? null,
            };
            process.stdout.write(
              `[PASS] ${target.id}${attempt > 1 ? ` (passed on attempt ${attempt}/${MAX_ATTEMPTS})` : ''} - ${check.reason}\n`
            );
            break;
          } else if (attempt < MAX_ATTEMPTS) {
            process.stdout.write(
              `[WARN] ${target.id} attempt ${attempt}/${MAX_ATTEMPTS} failed: ${check.reason}\n`
            );
          }
        } catch (err) {
          const reason = String(err);
          attemptRecord = {
            attempt,
            status: 'error',
            reason,
            failed_criteria: [],
            duration_ms: Date.now() - attemptStarted,
            url: target.url,
          };
          attemptRecords.push(attemptRecord);

          if (attempt < MAX_ATTEMPTS) {
            process.stdout.write(
              `[WARN] ${target.id} attempt ${attempt}/${MAX_ATTEMPTS} error: ${reason}\n`
            );
          }
        }

        // All attempts exhausted
        if (attempt === MAX_ATTEMPTS && !finalRecord) {
          const last = attemptRecords[attemptRecords.length - 1];
          finalRecord = {
            id: target.id,
            required: target.required,
            status: last.status === 'error' ? 'error' : 'fail',
            reason: last.reason,
            failed_criteria: last.failed_criteria ?? [],
            total_duration_ms: Date.now() - totalStarted,
            attempts_used: attempt,
            attempts: attemptRecords,
            screenshot: last.screenshot ?? null,
            element_count: last.element_count ?? 0,
            element_types: last.element_types ?? {},
            labels_sample: last.labels_sample ?? [],
            redacted_count: last.redacted_count ?? 0,
            capture_mode_used: last.capture_mode_used ?? null,
            iframe_cross_origin: last.iframe_cross_origin ?? false,
            iframe_frame_stats: last.iframe_frame_stats ?? null,
          };
        }
      }

      summary.results.push(finalRecord);

      if (finalRecord.status !== 'pass') {
        process.stdout.write(
          `[FAIL] ${target.id} (all ${MAX_ATTEMPTS} attempts exhausted) - ${finalRecord.reason}\n`
        );
        hasAnyFailure = true;
        if (target.required) {
          hasRequiredFailure = true;
        }
      }
    }

    writeFileSync(join(outputRoot, 'live-summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
    await closeBrowser();
  } finally {
    process.chdir(originalCwd);
    process.env.HOME = originalHome;
    process.env.USERPROFILE = originalUserProfile;
    if (originalPlaywrightPath) {
      process.env.PLAYWRIGHT_BROWSERS_PATH = originalPlaywrightPath;
    } else {
      delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    }

    if (existsSync(tempRoot)) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }

  process.stdout.write(`Live QA artifacts: ${outputRoot}\n`);

  if (strict && hasAnyFailure) {
    process.exit(1);
  }

  if (!strict && hasRequiredFailure) {
    process.exit(1);
  }

  process.stdout.write('Live QA checks completed successfully.\n');
}

main().catch((err) => {
  process.stderr.write(`${String(err)}\n`);
  process.exit(1);
});
