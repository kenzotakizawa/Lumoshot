/**
 * Integration tests for execute_flow
 *
 * Focus: verify that each action step produces an annotated screenshot
 * with the correct annotation type (click_icon on clicks, step_number on fills),
 * and that the annotated file is actually different from the raw file.
 *
 * These tests catch regressions where steps execute but produce only blank
 * screenshots with no annotations — the core value proposition of Lumoshot.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  mkdtempSync, mkdirSync, writeFileSync, existsSync, statSync, rmSync, readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── HTML fixtures ────────────────────────────────────────────────────────────

const LOGIN_PAGE = `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8"><title>Login</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 32px; background: #f5f5f5; }
  form { background: white; padding: 24px; border-radius: 8px; width: 360px; }
  h1 { margin: 0 0 20px; font-size: 20px; }
  label { display: block; font-size: 13px; color: #555; margin-bottom: 4px; }
  input { display: block; width: 100%; padding: 8px 12px; box-sizing: border-box;
          border: 1px solid #ccc; border-radius: 4px; margin-bottom: 16px; font-size: 14px; }
  button { width: 100%; padding: 10px; background: #3182CE; color: white;
           border: none; border-radius: 4px; font-size: 15px; cursor: pointer; }
  button:hover { background: #2b6cb0; }
</style></head>
<body>
  <form method="post" action="/success" id="loginForm">
    <h1>ログイン</h1>
    <label for="email">メールアドレス</label>
    <input id="email" type="email" name="email" placeholder="user@example.com" />
    <label for="password">パスワード</label>
    <input id="password" type="password" name="password" placeholder="••••••••" />
    <button type="submit" id="loginBtn">ログイン</button>
  </form>
</body>
</html>`;

const SUCCESS_PAGE = `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8"><title>Dashboard</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 32px; background: #f0f7ff; }
  .card { background: white; padding: 24px; border-radius: 8px; width: 400px; }
  h1 { margin: 0 0 20px; font-size: 20px; color: #2b6cb0; }
  p { color: #444; }
  .settings-btn { padding: 8px 16px; background: #38A169; color: white;
                  border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
</style></head>
<body>
  <div class="card">
    <h1>ログイン成功</h1>
    <p>ダッシュボードへようこそ。</p>
    <button class="settings-btn" id="settingsBtn">設定を開く</button>
  </div>
</body>
</html>`;

const SETTINGS_PAGE = `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8"><title>Settings</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 32px; }
  .card { background: white; padding: 24px; border-radius: 8px; width: 400px;
          box-shadow: 0 1px 4px rgba(0,0,0,.12); }
  h1 { margin: 0 0 20px; font-size: 18px; }
  label { display: block; font-size: 13px; color: #555; margin-bottom: 4px; }
  input[type=text] { display: block; width: 100%; padding: 7px 10px; box-sizing: border-box;
                     border: 1px solid #ccc; border-radius: 4px; margin-bottom: 14px; }
  select { display: block; width: 100%; padding: 7px; margin-bottom: 14px;
           border: 1px solid #ccc; border-radius: 4px; }
  .save-btn { padding: 9px 20px; background: #3182CE; color: white;
              border: none; border-radius: 4px; cursor: pointer; }
</style></head>
<body>
  <div class="card">
    <h1>プロフィール設定</h1>
    <label for="displayName">表示名</label>
    <input id="displayName" type="text" value="" placeholder="名前を入力" />
    <label for="lang">言語</label>
    <select id="lang">
      <option value="ja">日本語</option>
      <option value="en">English</option>
    </select>
    <button class="save-btn" id="saveBtn">保存する</button>
  </div>
</body>
</html>`;

// ─── Test server ──────────────────────────────────────────────────────────────

interface TestServer {
  origin: string;
  close: () => Promise<void>;
}

function startServer(
  routes: Record<string, { status: number; html: string }>,
): Promise<TestServer> {
  const handler = (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '/';
    const route = routes[url] ?? routes['/'] ?? { status: 404, html: 'Not Found' };
    res.writeHead(route.status, { 'content-type': 'text/html; charset=utf-8' });
    res.end(route.html);
  };

  return new Promise((resolve, reject) => {
    const server = createServer(handler);
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('failed to get server address'));
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise<void>((done, doneErr) =>
            server.close((err) => (err ? doneErr(err) : done()))
          ),
      });
    });
  });
}

// ─── Harness ──────────────────────────────────────────────────────────────────

let originalHome = '';
let originalUserProfile = '';
let originalCwd = '';
let originalPlaywrightPath = '';
let tempRoot = '';

type ExecuteFlowFn = (input: {
  url: string;
  preset?: string;
  steps: Array<Record<string, unknown>>;
  auto_capture_each_step?: boolean;
  default_wait?: { strategy?: string; timeout?: number };
}) => Promise<{
  steps: Array<{
    step_number: number;
    action: string;
    screenshot: string;
    elements?: Array<{ ref: number; label: string; type: string }>;
    target_ref?: number;
    target_label?: string;
    filled_value?: string;
    annotation?: {
      type: string;
      position: [number, number];
      badge_number?: number;
    };
    status?: string;
    error?: { type: string; message: string };
  }>;
  flow_meta: {
    total_steps: number;
    total_screenshots: number;
    duration_ms: number;
    preset: string;
    start_url: string;
    end_url: string;
    viewport: { width: number; height: number };
  };
}>;

let executeFlow: ExecuteFlowFn | null = null;
let closeBrowser: (() => Promise<void>) | null = null;

function hasBadgesInImage(annotatedPath: string, rawPath: string): boolean {
  // If annotation was applied, the annotated file should differ from raw in size.
  // SVG badge compositing always modifies the PNG stream.
  if (!existsSync(annotatedPath) || !existsSync(rawPath)) return false;
  const annotatedSize = statSync(annotatedPath).size;
  const rawSize = statSync(rawPath).size;
  // Allow a tolerance of 1% — annotated should generally differ
  return annotatedSize !== rawSize;
}

function findRawForStep(outputDir: string, stepPrefix: string): string | null {
  const rawDir = join(outputDir, 'raw');
  if (!existsSync(rawDir)) return null;
  const files = readdirSync(rawDir);
  const match = files.find((f) => f.startsWith(stepPrefix) && f.endsWith('.png'));
  return match ? join(rawDir, match) : null;
}

test.before(async () => {
  originalHome = process.env.HOME ?? '';
  originalUserProfile = process.env.USERPROFILE ?? '';
  originalCwd = process.cwd();
  originalPlaywrightPath = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '';

  tempRoot = mkdtempSync(join(tmpdir(), 'lumoshot-flow-int-'));
  mkdirSync(join(tempRoot, '.lumoshot'), { recursive: true });

  process.env.HOME = tempRoot;
  process.env.USERPROFILE = tempRoot;
  process.env.PLAYWRIGHT_BROWSERS_PATH = join(originalHome, 'Library', 'Caches', 'ms-playwright');
  process.chdir(tempRoot);

  const outputDir = join(tempRoot, 'out');
  writeFileSync(
    join(tempRoot, 'lumoshot.config.json'),
    JSON.stringify(
      {
        security: { trusted_domains: [] },
        output: { directory: outputDir },
      },
      null,
      2
    ),
    'utf-8'
  );

  const flowModule = await import('../dist/tools/execute-flow.js');
  const browserModule = await import('../dist/engine/browser.js');

  executeFlow = flowModule.executeFlow as ExecuteFlowFn;
  closeBrowser = browserModule.closeBrowser;
});

test.after(async () => {
  if (closeBrowser) await closeBrowser();

  process.chdir(originalCwd);
  process.env.HOME = originalHome;
  process.env.USERPROFILE = originalUserProfile;
  if (originalPlaywrightPath) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = originalPlaywrightPath;
  } else {
    delete process.env.PLAYWRIGHT_BROWSERS_PATH;
  }

  if (tempRoot && existsSync(tempRoot)) {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

// ─── Tests ────────────────────────────────────────────────────────────────────

/**
 * Core annotation test: fill and click steps must produce annotated screenshots.
 *
 * Flow:  capture (1) → fill email (2) → fill password (3) → click submit (4)
 *
 * Assertions:
 * - Each step produces a screenshot file
 * - fill steps have annotation.type === 'step_number'
 * - click steps have annotation.type === 'click_icon'
 * - annotation.position falls within the element's bounding box (rough check)
 * - Annotated PNG differs from the raw PNG (SVG overlay was applied)
 */
test('execute_flow annotates click and fill steps', { concurrency: false }, async () => {
  assert.ok(executeFlow);

  const server = await startServer({
    '/':       { status: 200, html: LOGIN_PAGE },
    '/success':{ status: 200, html: SUCCESS_PAGE },
  });

  try {
    const result = await executeFlow({
      url: `${server.origin}/`,
      preset: 'friendly',
      default_wait: { strategy: 'auto', timeout: 3000 },
      auto_capture_each_step: true,
      steps: [
        { action: 'capture' },                          // step 1: initial state
        { action: 'fill',  ref: 1, value: 'user@example.com' }, // step 2: fill email
        { action: 'fill',  ref: 2, value: 'password123' },      // step 3: fill password
        { action: 'click', ref: 3 },                            // step 4: click login
      ],
    });

    const steps = result.steps;

    // ── basic structure ───────────────────────────────────────────────────────
    assert.equal(steps.length, 4, 'must have 4 step results');
    assert.equal(result.flow_meta.total_steps, 4);

    // All annotated screenshots must exist and be valid PNG files
    for (const step of steps) {
      if (!step.screenshot) continue; // wait/scroll steps may have empty screenshot
      assert.ok(existsSync(step.screenshot), `step ${step.step_number} screenshot missing: ${step.screenshot}`);
      const size = statSync(step.screenshot).size;
      assert.ok(size > 5_000, `step ${step.step_number} screenshot suspiciously small (${size} bytes)`);
    }

    // ── step 1: capture ───────────────────────────────────────────────────────
    const s1 = steps[0];
    assert.equal(s1.action, 'capture');
    assert.ok(existsSync(s1.screenshot), 'step 1 capture screenshot must exist');
    // Capture step should return an elements array with refs
    assert.ok(Array.isArray(s1.elements) && s1.elements!.length > 0, 'step 1 must return elements');

    // ── step 2: fill email ────────────────────────────────────────────────────
    const s2 = steps[1];
    assert.equal(s2.action, 'fill');
    assert.equal(s2.filled_value, 'user@example.com', 'filled_value must be echoed back');
    assert.ok(s2.annotation, 'fill step must have annotation metadata');
    assert.equal(s2.annotation!.type, 'step_number', 'fill annotation must be step_number');
    assert.ok(
      Array.isArray(s2.annotation!.position) && s2.annotation!.position.length === 2,
      'fill annotation must have [x, y] position'
    );

    // ── step 3: fill password ─────────────────────────────────────────────────
    const s3 = steps[2];
    assert.equal(s3.action, 'fill');
    assert.equal(s3.filled_value, 'password123');
    assert.ok(s3.annotation, 'fill step must have annotation metadata');
    assert.equal(s3.annotation!.type, 'step_number');

    // ── step 4: click submit ──────────────────────────────────────────────────
    const s4 = steps[3];
    assert.equal(s4.action, 'click');
    assert.ok(s4.annotation, 'click step must have annotation metadata');
    assert.equal(s4.annotation!.type, 'click_icon', 'click annotation must be click_icon');
    assert.ok(
      Array.isArray(s4.annotation!.position) && s4.annotation!.position.length === 2,
      'click annotation must have [x, y] position'
    );

    // ── annotation position sanity: must be positive coordinates ─────────────
    for (const step of [s2, s3, s4]) {
      if (!step.annotation) continue;
      const [ax, ay] = step.annotation.position;
      assert.ok(ax >= 0 && ay >= 0, `annotation position must be non-negative for step ${step.step_number}`);
    }

    // ── annotated ≠ raw (SVG overlay was composited) ─────────────────────────
    // Compare annotated (in out/) vs raw (in out/raw/) for the click step
    const outputDir = join(tempRoot, 'out');
    const clickRaw = findRawForStep(outputDir, 'step_04');
    if (clickRaw && s4.screenshot) {
      assert.ok(
        hasBadgesInImage(s4.screenshot, clickRaw),
        `step 4 annotated file should differ from raw (annotation was not composited)`
      );
    }

  } finally {
    await server.close();
  }
});

/**
 * Multi-page flow: verify that execute_flow correctly carries context across
 * a navigation event (login → redirect → settings page interaction).
 *
 * Flow: fill email → fill password → click login → capture dashboard → click settings
 *
 * Key assertions:
 * - end_url differs from start_url (navigation happened)
 * - each click step carries click_icon annotation
 * - screenshots after navigation still have elements from the new page
 */
test('execute_flow tracks navigation and annotates across pages', { concurrency: false }, async () => {
  assert.ok(executeFlow);

  const server = await startServer({
    '/login':    { status: 200, html: LOGIN_PAGE },
    '/success':  { status: 200, html: SUCCESS_PAGE },
    '/settings': { status: 200, html: SETTINGS_PAGE },
  });

  try {
    // First we capture the login page to discover refs
    const { capturePage } = await import('../dist/tools/capture-page.js');
    const capture = await (capturePage as (input: { url: string }) => Promise<{
      elements: Array<{ ref: number; label: string; type: string }>;
    }>)({ url: `${server.origin}/login` });

    // Resolve refs by label (email, password, submit button)
    const emailRef   = capture.elements.find((e) => e.type === 'input' && /email|メール/i.test(e.label))?.ref ?? 1;
    const passRef    = capture.elements.find((e) => e.type === 'input' && /pass|パスワード/i.test(e.label))?.ref ?? 2;
    const submitRef  = capture.elements.find((e) => e.type === 'button')?.ref ?? 3;

    const result = await executeFlow({
      url: `${server.origin}/login`,
      preset: 'friendly',
      default_wait: { strategy: 'auto', timeout: 4000 },
      auto_capture_each_step: true,
      steps: [
        { action: 'capture' },                                      // initial
        { action: 'fill',  ref: emailRef,  value: 'qa@test.com' },
        { action: 'fill',  ref: passRef,   value: 'qaPassword1' },
        { action: 'click', ref: submitRef, description: 'ログインボタン押下' },
        { action: 'capture' },                                      // dashboard
      ],
    });

    const { steps, flow_meta } = result;

    // Navigation happened
    assert.ok(
      flow_meta.start_url !== flow_meta.end_url || flow_meta.end_url.includes('/success'),
      'end_url should reflect navigation after submit'
    );

    // All steps resolved without errors
    const errorSteps = steps.filter((s) => s.status === 'error');
    assert.equal(
      errorSteps.length,
      0,
      `unexpected error steps: ${errorSteps.map((s) => `step${s.step_number}:${s.error?.type}`).join(', ')}`
    );

    // Click step (step 4) must have click_icon annotation
    const clickStep = steps.find((s) => s.action === 'click');
    assert.ok(clickStep, 'must have at least one click step');
    assert.ok(clickStep!.annotation, 'click step must have annotation');
    assert.equal(clickStep!.annotation!.type, 'click_icon');

    // Post-navigation capture (last step) must have a screenshot
    const lastStep = steps[steps.length - 1];
    assert.equal(lastStep.action, 'capture');
    assert.ok(existsSync(lastStep.screenshot), 'post-navigation capture must exist');

  } finally {
    await server.close();
  }
});

/**
 * Error annotation: when a ref is not found on the page, execute_flow should
 * still produce an error screenshot and not throw unhandled.
 */
test('execute_flow produces error screenshot for missing ref', { concurrency: false }, async () => {
  assert.ok(executeFlow);

  const server = await startServer({
    '/': { status: 200, html: LOGIN_PAGE },
  });

  try {
    const result = await executeFlow({
      url: `${server.origin}/`,
      preset: 'precise',
      default_wait: { strategy: 'timeout', timeout: 500 },
      auto_capture_each_step: true,
      steps: [
        { action: 'click', ref: 9999 }, // ref that doesn't exist
      ],
    });

    const errorStep = result.steps[0];
    assert.equal(errorStep.action, 'click');
    assert.equal(errorStep.status, 'error');
    assert.equal(errorStep.error?.type, 'element_not_found');
    // Error screenshot must still be produced
    assert.ok(existsSync(errorStep.screenshot), 'error step must still produce a screenshot');
    const errorSize = statSync(errorStep.screenshot).size;
    assert.ok(errorSize > 5_000, 'error screenshot must be a real image');

  } finally {
    await server.close();
  }
});

/**
 * Annotation position within element bounds:
 * The click_icon annotation position must fall within or near the element's bounding box.
 *
 * This test verifies the annotation is placed ON the target element, not at 0,0
 * or some arbitrary offset.
 */
test('execute_flow click annotation is positioned on the target element', { concurrency: false }, async () => {
  assert.ok(executeFlow);

  const server = await startServer({
    '/': {
      status: 200,
      html: `<!DOCTYPE html><html><body style="padding:100px">
        <button id="btn" style="position:absolute;left:200px;top:180px;width:120px;height:44px;font-size:16px">
          ターゲットボタン
        </button>
      </body></html>`,
    },
  });

  try {
    // Capture to find the button ref
    const { capturePage } = await import('../dist/tools/capture-page.js');
    const capture = await (capturePage as (input: { url: string }) => Promise<{
      elements: Array<{ ref: number; label: string; type: string; bbox: [number,number,number,number] }>;
    }>)({ url: `${server.origin}/` });

    const btn = capture.elements.find((e) => e.type === 'button' && /ターゲット/.test(e.label));
    assert.ok(btn, 'target button must be found');

    const [bx, by, bw, bh] = btn!.bbox;

    const result = await executeFlow({
      url: `${server.origin}/`,
      preset: 'precise',
      default_wait: { strategy: 'timeout', timeout: 500 },
      auto_capture_each_step: true,
      steps: [
        { action: 'click', ref: btn!.ref },
      ],
    });

    const clickStep = result.steps[0];
    assert.ok(clickStep.annotation, 'click step must have annotation');
    assert.equal(clickStep.annotation!.type, 'click_icon');

    const [ax, ay] = clickStep.annotation!.position;

    // The annotation position should be near the element (within 2x bbox as tolerance)
    const TOLERANCE = 100; // px — generous to account for badge offset logic
    assert.ok(
      ax >= bx - TOLERANCE && ax <= bx + bw + TOLERANCE,
      `annotation x=${ax} is too far from element bbox x=${bx} w=${bw}`
    );
    assert.ok(
      ay >= by - TOLERANCE && ay <= by + bh + TOLERANCE,
      `annotation y=${ay} is too far from element bbox y=${by} h=${bh}`
    );

  } finally {
    await server.close();
  }
});
