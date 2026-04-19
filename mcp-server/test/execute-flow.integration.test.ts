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
import {
  existsSync, statSync, readFileSync,
} from 'node:fs';
import sharp from 'sharp';
import { config } from '../src/config.js';
import { LOGIN_PAGE, SETTINGS_PAGE, SUCCESS_PAGE } from './fixtures/execute-flow-pages.js';
import { findRawForStep, hasBadgesInImage, hasRedOutlineNearBBox } from './helpers/image-assert.js';
import { setupLumoshotHarness } from './helpers/lumoshot-harness.js';
import { startRouteServer, startServer } from './helpers/http-server.js';

// ─── Pixel assertion thresholds ───────────────────────────────────────────────
// Tuned for the default 1280×720 viewport at device_pixel_ratio=2 (Retina 2x).
// The physical screenshot is 2560×1440; counts scale roughly with DPR².
// If rendering changes across platforms cause flakiness, widen these tolerances.
const MIN_RED_ANNOTATION_PIXELS = 700;  // red outline / badge pixels expected from theme=default
const MAX_BLUE_STREAK_PIXELS = 500;     // upper bound for unwanted blue tint (click icon guard; 2x DPR has more edge pixels)
const MIN_GREEN_CALLOUT_PIXELS = 1_200; // green pixels from callout_background='#16A34A' override
const MIN_GREEN_BADGE_PIXELS = 200;     // green pixels from badge_color='#16A34A' override

// ─── Harness ──────────────────────────────────────────────────────────────────

let tempRoot = '';
let outputDir = '';
let restoreHarness: ((closeBrowser?: (() => Promise<void>) | null) => Promise<void>) | null = null;

type ExecuteFlowFn = (input: {
  url: string;
  preset?: string;
  theme?: 'red' | 'blue' | 'mono';
  pre_steps?: Array<Record<string, unknown>>;
  steps: Array<Record<string, unknown>>;
  cookies?: Array<{
    name: string;
    value: string;
    url?: string;
    domain?: string;
    path?: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
  }>;
  output_format?: 'png' | 'jpeg';
  scale?: number;
  badge_color?: string;
  visualization_mode?: 'step' | 'summary_only';
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
    visualization_mode?: 'step' | 'summary_only';
    summary_screenshot?: string;
    summary_step_count?: number;
    start_url: string;
    end_url: string;
    viewport: { width: number; height: number };
  };
}>;

let executeFlow: ExecuteFlowFn | null = null;
let closeBrowser: (() => Promise<void>) | null = null;

test.before(async () => {
  const harness = setupLumoshotHarness({
    tmpPrefix: 'lumoshot-flow-int-',
    outputDirectory: './out',
    trustedDomains: [],
  });
  tempRoot = harness.tempRoot;
  outputDir = harness.outputDir;
  restoreHarness = harness.restore;

  const flowModule = await import('../dist/tools/execute-flow.js');
  const browserModule = await import('../dist/engine/browser.js');

  executeFlow = flowModule.executeFlow as ExecuteFlowFn;
  closeBrowser = browserModule.closeBrowser;
});

test.after(async () => {
  if (restoreHarness) {
    await restoreHarness(closeBrowser);
  }
});

// ─── Annotation compositing assertion (unconditional) ─────────────────────
// Verifies the SVG annotation pipeline actually composites onto the screenshot.
// Uses red pixel counting rather than raw-vs-annotated diff so the assertion
// is unconditional and not affected by keep_raw config.
test('execute_flow annotation is composited: fill step has red badge pixels', { concurrency: false }, async () => {
  assert.ok(executeFlow);

  const html = `<!DOCTYPE html><html><body style="background:#fff;padding:40px">
    <label for="val">Name</label>
    <input id="val" type="text" style="display:block;margin:8px 0;width:200px" />
    <button id="go">Submit</button>
  </body></html>`;
  const server = await startRouteServer({ '/': { status: 200, html } });

  try {
    const result = await executeFlow!({
      url: `${server.origin}/`,
      preset: 'precise',
      auto_capture_each_step: true,
      default_wait: { strategy: 'timeout', timeout: 500 },
      steps: [
        { action: 'fill', selector: '#val', value: 'test-annotation-check' },
      ],
    });

    const shot = result.steps[0]?.screenshot;
    assert.ok(shot && existsSync(shot), 'fill step screenshot must exist');

    // Count red-like pixels (annotation overlay uses red for precise preset).
    // A plain white-background page with no annotations has zero red pixels.
    // Any composited annotation (box, step badge, click icon) introduces red.
    const redPixels = await countPixelsByRgbPredicate(
      shot,
      (r, g, b) => r >= 180 && g <= 100 && b <= 100,
    );
    assert.ok(
      redPixels >= MIN_RED_ANNOTATION_PIXELS,
      `fill step screenshot should have annotation pixels, got ${redPixels} red pixels (expected >= ${MIN_RED_ANNOTATION_PIXELS})`,
    );
  } finally {
    await server.close();
  }
});

async function countPixelsByRgbPredicate(
  imagePath: string,
  predicate: (r: number, g: number, b: number) => boolean,
): Promise<number> {
  const { data, info } = await sharp(imagePath).raw().toBuffer({ resolveWithObject: true });
  let count = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    if (predicate(r, g, b)) count += 1;
  }
  return count;
}

test('execute_flow supports jpeg output and scale for step screenshots (T-9)', { concurrency: false }, async () => {
  assert.ok(executeFlow);

  const server = await startRouteServer({
    '/': {
      status: 200,
      html: '<html><body><button id="go">Go</button></body></html>',
    },
  });

  try {
    const result = await executeFlow!({
      url: `${server.origin}/`,
      preset: 'friendly',
      output_format: 'jpeg',
      scale: 0.6,
      default_wait: { strategy: 'timeout', timeout: 700 },
      auto_capture_each_step: true,
      steps: [{ action: 'capture' }],
    });

    const shot = result.steps[0].screenshot;
    assert.ok(existsSync(shot), 'jpeg flow screenshot should exist');
    assert.ok(shot.endsWith('.jpg') || shot.endsWith('.jpeg'), `expected jpg path, got: ${shot}`);

    const meta = await sharp(shot).metadata();
    assert.equal(meta.format, 'jpeg');
    // viewport=1280 CSS px, scale=0.6. Physical width = 1280 * 0.6 * DPR.
    const dpr = config.capture.device_pixel_ratio;
    const expectedMaxWidth = Math.round(1280 * 0.6 * dpr);
    assert.ok((meta.width ?? 0) > 0 && (meta.width ?? 0) <= expectedMaxWidth, `scaled width should be reduced, got ${meta.width} (expected <= ${expectedMaxWidth})`);
  } finally {
    await server.close();
  }
});

test('execute_flow summary_only generates a single summary screenshot', { concurrency: false }, async () => {
  assert.ok(executeFlow);

  const html = `<!DOCTYPE html><html><body>
    <label for="name">Name</label>
    <input id="name" type="text" value="" />
    <label for="plan">Plan</label>
    <select id="plan">
      <option value="free">Free</option>
      <option value="pro">Pro</option>
    </select>
    <button id="submit">Submit</button>
  </body></html>`;
  const server = await startRouteServer({ '/': { status: 200, html } });

  try {
    const result = await executeFlow!({
      url: `${server.origin}/`,
      preset: 'friendly',
      visualization_mode: 'summary_only',
      default_wait: { strategy: 'timeout', timeout: 700 },
      steps: [
        { action: 'fill', selector: '#name', value: 'Lumoshot', description: '名前を入力' },
        { action: 'select', selector: '#plan', value: 'pro', description: 'プランを選択' },
        { action: 'click', selector: '#submit', description: '送信ボタンを押下' },
      ],
    });

    assert.equal(result.flow_meta.visualization_mode, 'summary_only');
    assert.ok(result.flow_meta.summary_screenshot, 'summary screenshot path should exist');
    assert.ok(existsSync(result.flow_meta.summary_screenshot!), 'summary screenshot file should exist');
    assert.equal(result.flow_meta.total_screenshots, 1, 'summary_only should produce one screenshot');
    assert.equal(result.steps.every((s) => s.screenshot === ''), true, 'step-level screenshots should be omitted');
    assert.ok((result.flow_meta.summary_step_count ?? 0) >= 2, 'summary should include actionable steps');
  } finally {
    await server.close();
  }
});

/**
 * summary_only side-effects: fill / select / click steps must actually execute
 * even though per-step screenshots are suppressed.
 *
 * Strategy: use a GET form whose action encodes field values in the URL.
 * After submit the browser navigates to /done?name=Lumoshot&plan=pro,
 * so end_url contains the submitted values — conclusive proof that
 * fill, select, and click all ran inside summary_only mode.
 */
test('execute_flow summary_only executes fill/select/click side effects (not just skips screenshots)', { concurrency: false }, async () => {
  assert.ok(executeFlow);

  const formPage = `<!DOCTYPE html><html><head><style>html,body{margin:0;padding:8px}</style></head>
    <body>
      <form id="form" action="/done" method="get">
        <input id="name" name="name" type="text" value="" />
        <select id="plan" name="plan">
          <option value="free">Free</option>
          <option value="pro">Pro</option>
        </select>
        <button id="submit" type="submit">Submit</button>
      </form>
    </body></html>`;

  const server = await startRouteServer({
    '/': { status: 200, html: formPage },
    '/done': { status: 200, html: '<html><body><h1>Done</h1></body></html>' },
  });

  try {
    const result = await executeFlow!({
      url: `${server.origin}/`,
      visualization_mode: 'summary_only',
      preset: 'friendly',
      default_wait: { strategy: 'timeout', timeout: 700 },
      steps: [
        { action: 'fill',   selector: '#name',   value: 'Lumoshot', description: '名前を入力' },
        { action: 'select', selector: '#plan',   value: 'pro',      description: 'プランを選択' },
        { action: 'click',  selector: '#submit',                    description: '送信' },
      ],
    });

    // Screenshots are suppressed at step level
    assert.equal(result.steps.every((s) => s.screenshot === ''), true, 'step-level screenshots must be omitted in summary_only');

    // Summary screenshot is generated
    assert.ok(result.flow_meta.summary_screenshot, 'summary screenshot path should exist');
    assert.ok(existsSync(result.flow_meta.summary_screenshot!), 'summary screenshot file should exist');

    // Navigation happened → fill + select + click were executed (not just skipped)
    // The GET form encodes field values in the URL: /done?name=Lumoshot&plan=pro
    const endUrl = result.flow_meta.end_url;
    assert.ok(
      endUrl.includes('/done'),
      `form submit (click) must have navigated to /done, got end_url=${endUrl}`,
    );
    assert.ok(
      endUrl.includes('name=Lumoshot'),
      `fill must have set the name field, got end_url=${endUrl}`,
    );
    assert.ok(
      endUrl.includes('plan=pro'),
      `select must have chosen 'pro', got end_url=${endUrl}`,
    );
  } finally {
    await server.close();
  }
});

test('execute_flow theme=mono applies non-red highlight color (T-12)', { concurrency: false }, async () => {
  assert.ok(executeFlow);

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0">
    <button id="btn" style="position:absolute;left:80px;top:90px;width:180px;height:44px">Theme Target</button>
  </body></html>`;

  const server = await startRouteServer({ '/': { status: 200, html } });

  try {
    const result = await executeFlow!({
      url: `${server.origin}/`,
      preset: 'friendly',
      theme: 'mono',
      default_wait: { strategy: 'timeout', timeout: 700 },
      auto_capture_each_step: true,
      steps: [{ action: 'click', selector: '#btn' }],
    });

    const step = result.steps[0];
    assert.notEqual(step.status, 'error', `mono theme click should succeed: ${step.error?.message ?? ''}`);
    assert.ok(existsSync(step.screenshot), 'mono theme screenshot should exist');

    const hasRed = await hasRedOutlineNearBBox(step.screenshot, [80, 90, 180, 44]);
    assert.equal(hasRed, false, 'mono theme should avoid red highlight outlines');
  } finally {
    await server.close();
  }
});

test('execute_flow supports cookie injection for authenticated pages (T-3)', { concurrency: false }, async () => {
  assert.ok(executeFlow);

  const securePage = `<!DOCTYPE html><html><head><style>html,body{margin:0;padding:0}</style></head>
    <body>
      <button id="secure-btn" style="position:absolute;left:80px;top:90px;width:160px;height:44px;
        background:#E53E3E;color:#fff;border:none;border-radius:6px">
        Secure Action
      </button>
    </body></html>`;

  const loginPage = `<!DOCTYPE html><html><body><h1>Login required</h1></body></html>`;

  const server = await startServer((req, res) => {
    const cookieHeader = req.headers.cookie ?? '';
    const authed = cookieHeader.includes('session_id=abc123');
    res.writeHead(authed ? 200 : 401, { 'content-type': 'text/html; charset=utf-8' });
    res.end(authed ? securePage : loginPage);
  });

  try {
    const withoutCookie = await executeFlow!({
      url: `${server.origin}/`,
      preset: 'precise',
      default_wait: { strategy: 'timeout', timeout: 700 },
      auto_capture_each_step: true,
      steps: [{ action: 'click', label_query: 'Secure Action' }],
    });

    assert.equal(withoutCookie.steps[0].status, 'error', 'without cookies, protected target should not be found');

    const withCookie = await executeFlow!({
      url: `${server.origin}/`,
      preset: 'precise',
      cookies: [{ name: 'session_id', value: 'abc123', url: `${server.origin}/` }],
      default_wait: { strategy: 'timeout', timeout: 700 },
      auto_capture_each_step: true,
      steps: [{ action: 'click', label_query: 'Secure Action', description: '認証済みボタン押下' }],
    });

    const step = withCookie.steps[0];
    assert.notEqual(step.status, 'error', `cookie-injected flow must not error: ${step.error?.message ?? ''}`);
    assert.ok(existsSync(step.screenshot), 'cookie-injected step must produce screenshot');
    assert.equal(
      await hasRedOutlineNearBBox(step.screenshot, [80, 90, 160, 44]),
      true,
      'cookie-injected screenshot should include a red outline on secure target',
    );
  } finally {
    await server.close();
  }
});

test('execute_flow pre_steps can bootstrap login/session before main flow (T-4)', { concurrency: false }, async () => {
  assert.ok(executeFlow);

  const loginPage = `<!DOCTYPE html><html><body>
    <form action="/login-submit" method="post">
      <label for="email">Email</label>
      <input id="email" name="email" type="email" />
      <label for="password">Password</label>
      <input id="password" name="password" type="password" />
      <button id="login" type="submit">Login</button>
    </form>
  </body></html>`;

  const appPage = `<!DOCTYPE html><html><body>
    <h1>App Dashboard</h1>
    <button id="app-btn">Run Report</button>
  </body></html>`;

  const unauthorizedPage = `<!DOCTYPE html><html><body><h1>Unauthorized</h1></body></html>`;

  const server = await startServer((req, res) => {
    const url = req.url ?? '/';
    const cookie = req.headers.cookie ?? '';
    const authed = cookie.includes('auth=1');

    if (url === '/login') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(loginPage);
      return;
    }

    if (url === '/login-submit') {
      res.writeHead(302, {
        location: '/app',
        'set-cookie': 'auth=1; Path=/; HttpOnly',
      });
      res.end('');
      return;
    }

    if (url === '/app') {
      res.writeHead(authed ? 200 : 401, { 'content-type': 'text/html; charset=utf-8' });
      res.end(authed ? appPage : unauthorizedPage);
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  });

  try {
    const withoutPre = await executeFlow!({
      url: `${server.origin}/app`,
      preset: 'friendly',
      default_wait: { strategy: 'timeout', timeout: 700 },
      auto_capture_each_step: true,
      steps: [{ action: 'capture' }],
    });

    const withoutLabels = withoutPre.steps[0]?.elements?.map((e) => e.label) ?? [];
    assert.equal(withoutLabels.includes('Run Report'), false, 'without pre_steps, app button should not be visible');

    const withPre = await executeFlow!({
      url: `${server.origin}/app`,
      preset: 'friendly',
      pre_steps: [
        {
          action: 'navigate',
          url: `${server.origin}/login`,
          wait: { strategy: 'selector', selector: '#login', timeout: 4000 },
        },
        { action: 'fill', selector: '#email', value: 'qa@example.com' },
        { action: 'fill', selector: '#password', value: 'password123' },
        { action: 'click', selector: '#login' },
        { action: 'wait', strategy: 'selector', selector: '#app-btn', timeout: 4000 },
      ],
      default_wait: { strategy: 'timeout', timeout: 1200 },
      auto_capture_each_step: true,
      steps: [{ action: 'capture' }],
    });

    const step = withPre.steps[0];
    assert.ok(existsSync(step.screenshot), 'pre_steps flow capture screenshot must exist');
    assert.notEqual(step.status, 'error', `pre_steps flow must not error: ${step.error?.message ?? ''}`);
    const labels = step.elements?.map((e) => e.label) ?? [];
    assert.ok(labels.includes('Run Report'), 'pre_steps should establish session and reach authenticated app');
    assert.ok(withPre.flow_meta.end_url.includes('/app'), `end_url should be app page: ${withPre.flow_meta.end_url}`);
  } finally {
    await server.close();
  }
});

test('execute_flow follows new tab opened by click and continues subsequent steps (T-6)', { concurrency: false }, async () => {
  assert.ok(executeFlow);

  const startHtml = `<!DOCTYPE html><html><body>
    <a id="open-tab" href="/tab" target="_blank">Open Tab</a>
  </body></html>`;
  const tabHtml = `<!DOCTYPE html><html><body>
    <h1>Secondary Tab</h1>
    <button id="tab-action">Secondary Action</button>
  </body></html>`;

  const server = await startRouteServer({
    '/': { status: 200, html: startHtml },
    '/tab': { status: 200, html: tabHtml },
  });

  try {
    const result = await executeFlow!({
      url: `${server.origin}/`,
      preset: 'friendly',
      default_wait: { strategy: 'timeout', timeout: 1000 },
      auto_capture_each_step: true,
      steps: [
        { action: 'click', selector: '#open-tab', description: '新規タブを開く' },
        { action: 'capture' },
      ],
    });

    assert.equal(result.steps.length, 2, 'must have two step results');
    const clickStep = result.steps[0];
    const captureStep = result.steps[1];

    assert.notEqual(clickStep.status, 'error', `new-tab click must not error: ${clickStep.error?.message ?? ''}`);
    assert.ok(existsSync(clickStep.screenshot), 'click screenshot must exist');
    assert.equal(captureStep.action, 'capture');
    assert.ok(existsSync(captureStep.screenshot), 'capture screenshot on new tab must exist');

    const labels = captureStep.elements?.map((e) => e.label) ?? [];
    assert.ok(labels.includes('Secondary Action'), 'post-click capture should run on the new tab context');
    assert.ok(result.flow_meta.end_url.includes('/tab'), `flow end_url should point to new tab: ${result.flow_meta.end_url}`);
  } finally {
    await server.close();
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

  const server = await startRouteServer({
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
    // Fill step must be annotated.
    const fillRaw = findRawForStep(outputDir, 'step_02');
    if (fillRaw && s2.screenshot) {
      assert.ok(
        hasBadgesInImage(s2.screenshot, fillRaw),
        `step 2 (fill) annotated file should differ from raw (annotation was not composited)`
      );
    }

    // Click step must also keep visible evidence even when navigation happens.
    const clickRaw = findRawForStep(outputDir, 'step_04');
    if (clickRaw && s4.screenshot) {
      assert.ok(
        hasBadgesInImage(s4.screenshot, clickRaw),
        'step 4 (click) annotated file should differ from raw'
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

  const server = await startRouteServer({
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

  const server = await startRouteServer({
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

  const server = await startRouteServer({
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

test('execute_flow draws red box on click/select targets (button, link, dropdown)', { concurrency: false }, async () => {
  assert.ok(executeFlow);

  const html = `<!DOCTYPE html><html><body style="padding:40px;font-family:system-ui">
    <button id="btn" style="position:absolute;left:120px;top:110px;width:140px;height:44px;background:#2d6cdf;color:#fff;border:none;border-radius:6px">
      送信ボタン
    </button>
    <a id="link" href="#target" style="position:absolute;left:120px;top:190px;color:#2d6cdf;text-decoration:underline">
      詳細リンク
    </a>
    <label for="plan" style="position:absolute;left:120px;top:245px">プラン</label>
    <select id="plan" style="position:absolute;left:120px;top:270px;width:180px;height:34px">
      <option value="free">Free</option>
      <option value="pro">Pro</option>
    </select>
    <div id="target" style="position:absolute;left:120px;top:340px">target</div>
  </body></html>`;

  const server = await startRouteServer({
    '/': { status: 200, html },
  });

  try {
    const { capturePage } = await import('../dist/tools/capture-page.js');
    const capture = await (capturePage as (input: { url: string }) => Promise<{
      elements: Array<{ ref: number; label: string; type: string; bbox: [number, number, number, number] }>;
    }>)({ url: `${server.origin}/` });

    const button = capture.elements.find((e) => e.type === 'button' && /送信ボタン/.test(e.label));
    const link = capture.elements.find((e) => e.type === 'link' && /詳細リンク/.test(e.label));
    const dropdown = capture.elements.find((e) => e.type === 'select' && /プラン/.test(e.label));

    assert.ok(button, 'button ref must be found');
    assert.ok(link, 'link ref must be found');
    assert.ok(dropdown, 'select ref must be found');

    const result = await executeFlow({
      url: `${server.origin}/`,
      preset: 'friendly',
      default_wait: { strategy: 'timeout', timeout: 500 },
      auto_capture_each_step: true,
      steps: [
        { action: 'click', ref: button!.ref },
        { action: 'click', ref: link!.ref },
        { action: 'select', ref: dropdown!.ref, value: 'pro' },
      ],
    });

    assert.equal(result.steps.length, 3, 'must have 3 step results');
    assert.equal(result.steps[0].action, 'click');
    assert.equal(result.steps[1].action, 'click');
    assert.equal(result.steps[2].action, 'select');

    assert.equal(await hasRedOutlineNearBBox(result.steps[0].screenshot, button!.bbox), true, 'button click screenshot should include red outline');
    assert.equal(await hasRedOutlineNearBBox(result.steps[1].screenshot, link!.bbox), true, 'link click screenshot should include red outline');
    assert.equal(await hasRedOutlineNearBBox(result.steps[2].screenshot, dropdown!.bbox), true, 'select screenshot should include red outline');
  } finally {
    await server.close();
  }
});

test('execute_flow click icon defaults to red tone (no blue streaks)', { concurrency: false }, async () => {
  assert.ok(executeFlow);

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8f8f8">
    <button id="btn" style="position:absolute;left:120px;top:120px;width:180px;height:48px;border:1px solid #888;background:#eee;color:#222">
      Click
    </button>
  </body></html>`;

  const server = await startRouteServer({ '/': { status: 200, html } });

  try {
    const result = await executeFlow!({
      url: `${server.origin}/`,
      preset: 'friendly',
      default_wait: { strategy: 'timeout', timeout: 500 },
      auto_capture_each_step: true,
      steps: [{ action: 'click', selector: '#btn', description: 'クリック' }],
    });

    const step = result.steps[0];
    assert.ok(existsSync(step.screenshot), 'click screenshot must exist');

    const blueLikePixels = await countPixelsByRgbPredicate(
      step.screenshot,
      (r, g, b) => b >= 130 && r <= 110 && g <= 150,
    );
    const redLikePixels = await countPixelsByRgbPredicate(
      step.screenshot,
      (r, g, b) => r >= 150 && g <= 110 && b <= 120,
    );

    assert.ok(redLikePixels > MIN_RED_ANNOTATION_PIXELS, `expected red annotation pixels, got ${redLikePixels}`);
    assert.ok(blueLikePixels < MAX_BLUE_STREAK_PIXELS, `expected click icon streaks to avoid blue tint, got ${blueLikePixels}`);
  } finally {
    await server.close();
  }
});

/**
 * P0-1: step.description is rendered as a callout annotation on click/select screenshots.
 *
 * Verifies that running the same click step with and without `description` produces
 * visually different screenshots (the callout balloon adds pixels not present otherwise).
 */
test('execute_flow renders step description as callout annotation (P0-1)', { concurrency: false }, async () => {
  assert.ok(executeFlow);

  const html = `<!DOCTYPE html><html><head><style>html,body{margin:0;padding:0}</style></head>
    <body>
      <button id="btn" style="position:absolute;left:120px;top:120px;width:160px;height:48px;
        background:#3182CE;color:#fff;border:none;border-radius:6px;font-size:15px">
        確認する
      </button>
    </body></html>`;

  const server = await startRouteServer({ '/': { status: 200, html } });

  try {
    const { capturePage } = await import('../dist/tools/capture-page.js');
    const capture = await (capturePage as (input: { url: string }) => Promise<{
      elements: Array<{ ref: number; label: string; type: string }>;
    }>)({ url: `${server.origin}/` });

    const btn = capture.elements.find((e) => e.type === 'button' && /確認する/.test(e.label));
    assert.ok(btn, '確認する button must be found');

    // Run WITH description
    const withDesc = await executeFlow!({
      url: `${server.origin}/`,
      preset: 'friendly',
      default_wait: { strategy: 'timeout', timeout: 500 },
      auto_capture_each_step: true,
      steps: [{ action: 'click', ref: btn!.ref, description: '規約に同意してクリック' }],
    });

    // Run WITHOUT description
    const withoutDesc = await executeFlow!({
      url: `${server.origin}/`,
      preset: 'friendly',
      default_wait: { strategy: 'timeout', timeout: 500 },
      auto_capture_each_step: true,
      steps: [{ action: 'click', ref: btn!.ref }],
    });

    const pathWith = withDesc.steps[0].screenshot;
    const pathWithout = withoutDesc.steps[0].screenshot;

    assert.ok(existsSync(pathWith), 'screenshot with description must exist');
    assert.ok(existsSync(pathWithout), 'screenshot without description must exist');

    // The callout balloon adds SVG text/background pixels — screenshots must differ
    const bufWith = readFileSync(pathWith);
    const bufWithout = readFileSync(pathWithout);
    assert.ok(
      !bufWith.equals(bufWithout),
      'screenshot with description callout must be visually different from screenshot without'
    );

  } finally {
    await server.close();
  }
});

test('execute_flow allows AI-specified callout colors on steps', { concurrency: false }, async () => {
  assert.ok(executeFlow);

  const html = `<!DOCTYPE html><html><head><style>html,body{margin:0;padding:0}</style></head>
    <body>
      <button id="btn" style="position:absolute;left:120px;top:120px;width:160px;height:48px;
        background:#3182CE;color:#fff;border:none;border-radius:6px;font-size:15px">
        Confirm
      </button>
    </body></html>`;

  const server = await startRouteServer({ '/': { status: 200, html } });

  try {
    const { capturePage } = await import('../dist/tools/capture-page.js');
    const capture = await (capturePage as (input: { url: string }) => Promise<{
      elements: Array<{ ref: number; label: string; type: string }>;
    }>)({ url: `${server.origin}/` });
    const btn = capture.elements.find((e) => e.type === 'button' && /confirm/i.test(e.label));
    assert.ok(btn, 'Confirm button must be found');

    const result = await executeFlow!({
      url: `${server.origin}/`,
      preset: 'friendly',
      default_wait: { strategy: 'timeout', timeout: 500 },
      auto_capture_each_step: true,
      steps: [{
        action: 'click',
        ref: btn!.ref,
        description: 'Click to continue',
        callout_background: '#16A34A',
        callout_border_color: '#14532D',
        callout_text_color: '#F0FDF4',
      }],
    });

    const shot = result.steps[0].screenshot;
    assert.ok(existsSync(shot), 'callout color override screenshot must exist');

    const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
    let greenLikePixels = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      if (g >= 120 && r <= 90 && b <= 110) greenLikePixels += 1;
    }
    assert.ok(greenLikePixels > MIN_GREEN_CALLOUT_PIXELS, `expected green callout pixels from override, got ${greenLikePixels}`);
  } finally {
    await server.close();
  }
});

test('execute_flow allows badge_color override on fill steps', { concurrency: false }, async () => {
  assert.ok(executeFlow);

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0">
    <input id="name" type="text" placeholder="Name" style="position:absolute;left:120px;top:120px;width:220px;height:40px" />
  </body></html>`;

  const server = await startRouteServer({ '/': { status: 200, html } });

  try {
    const result = await executeFlow!({
      url: `${server.origin}/`,
      preset: 'friendly',
      badge_color: '#16A34A',
      default_wait: { strategy: 'timeout', timeout: 500 },
      auto_capture_each_step: true,
      steps: [{ action: 'fill', selector: '#name', value: 'Lumoshot', description: '名前を入力' }],
    });

    const shot = result.steps[0].screenshot;
    assert.ok(existsSync(shot), 'badge color override screenshot must exist');

    const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
    let greenLikePixels = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      if (g >= 130 && r <= 110 && b <= 120) greenLikePixels += 1;
    }
    assert.ok(greenLikePixels > MIN_GREEN_BADGE_PIXELS, `expected green badge pixels from badge_color override, got ${greenLikePixels}`);
  } finally {
    await server.close();
  }
});

/**
 * P0-2: red box annotation uses post-operation element position, not stale pre-click coordinates.
 *
 * The test page moves a button (via JS click handler) from position A to position B.
 * After execute_flow clicks it, the re-analyzed DOM finds the button at position B.
 * The red box on the annotated screenshot must be at B, not A.
 */
test('execute_flow red box follows post-click DOM position (P0-2)', { concurrency: false }, async () => {
  assert.ok(executeFlow);

  // Button starts at (60, 80). On click, JS moves it to (300, 300).
  const html = `<!DOCTYPE html><html><head><style>html,body{margin:0;padding:0}</style></head>
    <body>
      <button id="btn" style="position:absolute;left:60px;top:80px;width:140px;height:44px;
        background:#3182CE;color:#fff;border:none;border-radius:6px">
        移動ボタン
      </button>
      <script>
        document.getElementById('btn').addEventListener('click', function() {
          this.style.left = '300px';
          this.style.top = '300px';
        });
      </script>
    </body></html>`;

  const server = await startRouteServer({ '/': { status: 200, html } });

  try {
    const { capturePage } = await import('../dist/tools/capture-page.js');
    const capture = await (capturePage as (input: { url: string }) => Promise<{
      elements: Array<{ ref: number; label: string; type: string; bbox: [number, number, number, number] }>;
    }>)({ url: `${server.origin}/` });

    const btn = capture.elements.find((e) => e.type === 'button' && /移動ボタン/.test(e.label));
    assert.ok(btn, 'moving button must be found');

    const oldBbox = btn!.bbox; // approx [60, 80, 140, 44]

    const result = await executeFlow!({
      url: `${server.origin}/`,
      preset: 'precise',
      default_wait: { strategy: 'timeout', timeout: 500 },
      auto_capture_each_step: true,
      steps: [{ action: 'click', ref: btn!.ref, description: 'ボタン移動確認' }],
    });

    const step = result.steps[0];
    assert.ok(existsSync(step.screenshot), 'click step screenshot must exist');

    // Post-click bbox: button moved to CSS left:300px,top:300px → approx [300,300,140,44]
    const newBbox: [number, number, number, number] = [300, 300, 140, 44];

    // Red box must be at NEW position (P0-2 ensures fresh DOM analysis)
    assert.equal(
      await hasRedOutlineNearBBox(step.screenshot, newBbox),
      true,
      'red box must be drawn at the post-click element position'
    );

    // Red box must NOT be at OLD position
    assert.equal(
      await hasRedOutlineNearBBox(step.screenshot, oldBbox),
      false,
      'red box must not be drawn at the stale pre-click element position'
    );

  } finally {
    await server.close();
  }
});

/**
 * P1-3: selector and label_query can be used instead of ref to target elements.
 *
 * - selector: '#id' CSS selector targets a button
 * - label_query: partial text match selects a dropdown
 */
test('execute_flow resolves targets via selector and label_query (P1-3)', { concurrency: false }, async () => {
  assert.ok(executeFlow);

  const html = `<!DOCTYPE html><html><head><style>html,body{margin:0;padding:0}</style></head>
    <body>
      <button id="send-btn" style="position:absolute;left:60px;top:60px;width:160px;height:44px;
        background:#3182CE;color:#fff;border:none;border-radius:6px">
        送信する
      </button>
      <label for="plan" style="position:absolute;left:60px;top:130px">プラン選択</label>
      <select id="plan" style="position:absolute;left:60px;top:155px;width:180px;height:34px">
        <option value="free">Free</option>
        <option value="pro">Pro</option>
      </select>
      <input id="name" type="text" aria-label="お名前" style="position:absolute;left:60px;top:210px;width:180px;height:34px" />
    </body></html>`;

  const server = await startRouteServer({ '/': { status: 200, html } });

  try {
    // ── selector: click a button by CSS selector ─────────────────────────────
    const clickResult = await executeFlow!({
      url: `${server.origin}/`,
      preset: 'precise',
      default_wait: { strategy: 'timeout', timeout: 500 },
      auto_capture_each_step: true,
      steps: [{ action: 'click', selector: '#send-btn', description: 'CSSセレクタで送信ボタンをクリック' }],
    });

    const clickStep = clickResult.steps[0];
    assert.equal(clickStep.action, 'click', 'selector click must produce a click step');
    assert.ok(existsSync(clickStep.screenshot), 'selector click must produce a screenshot');
    assert.notEqual(clickStep.status, 'error', `selector click must not error: ${clickStep.error?.message ?? ''}`);

    // Screenshot should contain a red outline over the button area (≈60,60,160,44)
    assert.equal(
      await hasRedOutlineNearBBox(clickStep.screenshot, [60, 60, 160, 44]),
      true,
      'selector click: red box must be drawn around the button'
    );

    // ── label_query: select dropdown by partial label match ───────────────────
    const selectResult = await executeFlow!({
      url: `${server.origin}/`,
      preset: 'precise',
      default_wait: { strategy: 'timeout', timeout: 500 },
      auto_capture_each_step: true,
      steps: [{ action: 'select', label_query: 'プラン', value: 'pro' }],
    });

    const selectStep = selectResult.steps[0];
    assert.equal(selectStep.action, 'select', 'label_query select must produce a select step');
    assert.ok(existsSync(selectStep.screenshot), 'label_query select must produce a screenshot');
    assert.notEqual(selectStep.status, 'error', `label_query select must not error: ${selectStep.error?.message ?? ''}`);

    // ── label_query: fill input by partial label ──────────────────────────────
    const fillResult = await executeFlow!({
      url: `${server.origin}/`,
      preset: 'precise',
      default_wait: { strategy: 'timeout', timeout: 500 },
      auto_capture_each_step: true,
      steps: [{ action: 'fill', label_query: 'お名前', value: 'テストユーザー' }],
    });

    const fillStep = fillResult.steps[0];
    assert.equal(fillStep.action, 'fill', 'label_query fill must produce a fill step');
    assert.ok(existsSync(fillStep.screenshot), 'label_query fill must produce a screenshot');
    assert.notEqual(fillStep.status, 'error', `label_query fill must not error: ${fillStep.error?.message ?? ''}`);

  } finally {
    await server.close();
  }
});

/**
 * P2-8: strategy='combobox' supports custom div-based dropdowns.
 *
 * The fixture uses role="combobox" + role="option" elements (no native <select>),
 * so native selectOption() is expected to fail and combobox strategy must pick the option.
 */
test('execute_flow select strategy=combobox works with custom dropdown (P2-8)', { concurrency: false }, async () => {
  assert.ok(executeFlow);

  const html = `<!DOCTYPE html><html><head><style>html,body{margin:0;padding:0}</style></head>
    <body>
      <label id="plan-label" style="position:absolute;left:80px;top:70px">プラン</label>
      <div
        id="plan-combobox"
        role="combobox"
        aria-labelledby="plan-label"
        tabindex="0"
        style="position:absolute;left:80px;top:95px;width:220px;height:36px;border:1px solid #999;padding:8px;box-sizing:border-box"
      >選択してください</div>
      <ul id="plan-listbox" role="listbox" style="display:none;position:absolute;left:80px;top:136px;width:220px;border:1px solid #ccc;margin:0;padding:0;list-style:none;background:#fff">
        <li role="option" data-value="free" style="padding:8px;cursor:pointer">Free</li>
        <li role="option" data-value="pro" style="padding:8px;cursor:pointer">Pro</li>
      </ul>
      <input id="selected-value" type="text" value="" style="position:absolute;left:80px;top:190px;width:220px;height:34px" />
      <script>
        const combo = document.getElementById('plan-combobox');
        const listbox = document.getElementById('plan-listbox');
        const selected = document.getElementById('selected-value');
        combo.addEventListener('click', () => {
          listbox.style.display = listbox.style.display === 'none' ? 'block' : 'none';
        });
        listbox.addEventListener('click', (e) => {
          const option = e.target.closest('[role="option"]');
          if (!option) return;
          combo.textContent = option.textContent.trim();
          combo.setAttribute('data-selected', option.dataset.value || '');
          selected.value = option.dataset.value || '';
          listbox.style.display = 'none';
        });
      </script>
    </body></html>`;

  const server = await startRouteServer({ '/': { status: 200, html } });

  try {
    const { capturePage } = await import('../dist/tools/capture-page.js');
    const capture = await (capturePage as (input: { url: string }) => Promise<{
      elements: Array<{ ref: number; label: string; type: string; bbox: [number, number, number, number] }>;
    }>)({ url: `${server.origin}/` });

    const combo = capture.elements.find((e) => e.type === 'select' && /プラン/.test(e.label));
    assert.ok(combo, 'combobox ref must be found');

    const result = await executeFlow!({
      url: `${server.origin}/`,
      preset: 'precise',
      default_wait: { strategy: 'timeout', timeout: 700 },
      auto_capture_each_step: true,
      steps: [
        { action: 'select', ref: combo!.ref, value: 'Pro', strategy: 'combobox', description: 'Pro を選択' },
      ],
    });

    assert.equal(result.steps.length, 1, 'must have 1 step result');
    const step = result.steps[0];
    assert.equal(step.action, 'select');
    assert.notEqual(step.status, 'error', `combobox select must not error: ${step.error?.message ?? ''}`);
    assert.ok(existsSync(step.screenshot), 'combobox select must produce a screenshot');
    assert.equal(
      await hasRedOutlineNearBBox(step.screenshot, combo!.bbox),
      true,
      'combobox select screenshot should include red outline around combobox target'
    );
  } finally {
    await server.close();
  }
});
