import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkAmazonLike, checkWikipediaCapture, checkWikipediaFlow } from './qa-live/lib/checkers.mjs';
import { countByType, nowId } from './qa-live/lib/utils.mjs';

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

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const strict = process.env.LUMOSHOT_LIVE_STRICT === '1';
  const includeAmazon = process.env.LUMOSHOT_INCLUDE_AMAZON !== '0';
  const includeFlow = process.env.LUMOSHOT_INCLUDE_FLOW !== '0';
  const flowRequired = process.env.LUMOSHOT_FLOW_REQUIRED === '1';

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
      id: 'wikipedia_main',
      required: true,
      url: 'https://ja.wikipedia.org/wiki/メインページ',
      wait: {
        strategy: 'selector',
        selector: '#searchInput',
        timeout: 15000,
      },
      checker: checkWikipediaCapture,
    },
  ];

  if (includeAmazon) {
    targets.push({
      id: 'amazon_home',
      required: true,
      url: 'https://www.amazon.co.jp/',
      wait: {
        strategy: 'selector',
        selector: '#twotabsearchtextbox',
        timeout: 20000,
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
    include_flow: includeFlow,
    flow_required: flowRequired,
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
    const { executeFlow } = await import('../dist/tools/execute-flow.js');
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

    const flowTargets = includeFlow
      ? [
          {
            id: 'wikipedia_search_flow',
            required: flowRequired,
            url: 'https://ja.wikipedia.org/wiki/メインページ',
            input: {
              url: 'https://ja.wikipedia.org/wiki/メインページ',
              default_wait: { strategy: 'selector', selector: '#searchInput', timeout: 15000 },
              auto_capture_each_step: true,
              steps: [
                { action: 'fill', selector: '#searchInput', value: 'Playwright', description: '検索語を入力' },
                { action: 'click', selector: 'button.cdx-search-input__end-button', description: '検索ボタンを押す' },
              ],
            },
            checker: (result) => checkWikipediaFlow(result, 'https://ja.wikipedia.org/wiki/メインページ'),
          },
        ]
      : [];

    for (const target of flowTargets) {
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
          const result = await executeFlow(target.input);
          const check = target.checker(result);

          attemptRecord = {
            attempt,
            status: check.pass ? 'pass' : 'fail',
            reason: check.reason,
            failed_criteria: check.failed_criteria ?? [],
            duration_ms: Date.now() - attemptStarted,
            url: target.url,
            flow_step_count: result.steps.length,
            pre_step_count: target.input.pre_steps?.length ?? 0,
            flow_screenshot_count: result.flow_meta?.total_screenshots ?? 0,
            end_url: result.flow_meta?.end_url ?? '',
            steps_sample: result.steps.slice(0, 5).map((s) => ({
              step_number: s.step_number,
              action: s.action,
              status: s.status ?? 'ok',
              screenshot: s.screenshot ? true : false,
              annotation: s.annotation?.type ?? null,
            })),
          };

          attemptRecords.push(attemptRecord);

          if (check.pass) {
            finalRecord = {
              id: target.id,
              kind: 'execute_flow',
              required: target.required,
              status: 'pass',
              reason: check.reason,
              total_duration_ms: Date.now() - totalStarted,
              attempts_used: attempt,
              attempts: attemptRecords,
              flow_step_count: result.steps.length,
              pre_step_count: target.input.pre_steps?.length ?? 0,
              flow_screenshot_count: result.flow_meta?.total_screenshots ?? 0,
              end_url: result.flow_meta?.end_url ?? '',
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

        if (attempt === MAX_ATTEMPTS && !finalRecord) {
          const last = attemptRecords[attemptRecords.length - 1];
          finalRecord = {
            id: target.id,
            kind: 'execute_flow',
            required: target.required,
            status: last.status === 'error' ? 'error' : 'fail',
            reason: last.reason,
            failed_criteria: last.failed_criteria ?? [],
            total_duration_ms: Date.now() - totalStarted,
            attempts_used: attempt,
            attempts: attemptRecords,
            flow_step_count: last.flow_step_count ?? 0,
            pre_step_count: last.pre_step_count ?? 0,
            flow_screenshot_count: last.flow_screenshot_count ?? 0,
            end_url: last.end_url ?? '',
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
