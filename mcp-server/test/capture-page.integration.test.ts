import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface TestServer {
  origin: string;
  close: () => Promise<void>;
}

interface CapturePageTestResult {
  screenshot: string;
  elements: Array<{
    ref: number;
    label: string;
    type: string;
    value?: string;
    redacted?: boolean;
    badge_number?: number;
    badge_position?: [number, number];
  }>;
  page_meta: {
    page_height: number;
  };
  diagnostics: {
    capture_mode_used: string;
    capture_mode_reason?: string;
    redacted_count: number;
    iframe_cross_origin?: boolean;
    iframe_frame_stats?: {
      total_frames: number;
      same_origin_frames: number;
      cross_origin_frames: number;
    };
  };
}

function startServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void
): Promise<TestServer> {
  return new Promise((resolve, reject) => {
    const server = createServer(handler);
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('failed to resolve server address'));
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise((done, doneErr) => {
            server.close((err) => (err ? doneErr(err) : done()));
          }),
      });
    });
  });
}

let originalHome = '';
let originalUserProfile = '';
let originalCwd = '';
let originalPlaywrightBrowsersPath = '';
let tempRoot = '';

let capturePage: ((input: { url: string }) => Promise<unknown>) | null = null;
let closeBrowser: (() => Promise<void>) | null = null;

async function setupHarness(): Promise<void> {
  originalHome = process.env.HOME ?? '';
  originalUserProfile = process.env.USERPROFILE ?? '';
  originalCwd = process.cwd();
  originalPlaywrightBrowsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '';

  tempRoot = mkdtempSync(join(tmpdir(), 'lumoshot-int-'));
  mkdirSync(join(tempRoot, '.lumoshot'), { recursive: true });

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
          directory: './out',
        },
      },
      null,
      2
    ),
    'utf-8'
  );

  const captureModule = await import('../dist/tools/capture-page.js');
  const browserModule = await import('../dist/engine/browser.js');

  capturePage = captureModule.capturePage;
  closeBrowser = browserModule.closeBrowser;
}

async function teardownHarness(): Promise<void> {
  if (closeBrowser) {
    await closeBrowser();
  }

  process.chdir(originalCwd);
  process.env.HOME = originalHome;
  process.env.USERPROFILE = originalUserProfile;
  if (originalPlaywrightBrowsersPath) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = originalPlaywrightBrowsersPath;
  } else {
    delete process.env.PLAYWRIGHT_BROWSERS_PATH;
  }

  if (tempRoot && existsSync(tempRoot)) {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

test.before(async () => {
  await setupHarness();
});

test.after(async () => {
  await teardownHarness();
});

test('capture_page includes same-origin iframe elements', { concurrency: false }, async () => {
  assert.ok(capturePage);

  const server = await startServer((req, res) => {
    if (req.url === '/inner') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<html><body><button id="inner">Inner</button></body></html>');
      return;
    }

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(
      '<html><body><button id="outer">Outer</button><iframe src="/inner" style="width:320px;height:120px;"></iframe></body></html>'
    );
  });

  try {
    const result = (await capturePage!({ url: `${server.origin}/same` })) as CapturePageTestResult;
    const labels = result.elements.map((el) => el.label);

    assert.equal(existsSync(result.screenshot), true);
    assert.ok(labels.includes('Outer'));
    assert.ok(labels.includes('Inner'));
    assert.equal(result.diagnostics.iframe_cross_origin, false);
    assert.equal(result.diagnostics.iframe_frame_stats?.cross_origin_frames, 0);
    assert.ok((result.diagnostics.iframe_frame_stats?.same_origin_frames ?? 0) >= 2);

    const badgeNumbers = result.elements.map((el) => el.badge_number).filter((n): n is number => typeof n === 'number');
    const sorted = [...badgeNumbers].sort((a, b) => a - b);
    const expected = Array.from({ length: badgeNumbers.length }, (_, i) => i + 1);
    assert.deepEqual(sorted, expected);
    assert.equal(result.elements.every((el) => Array.isArray(el.badge_position)), true);
  } finally {
    await server.close();
  }
});

test('capture_page flags cross-origin iframes and skips their DOM', { concurrency: false }, async () => {
  assert.ok(capturePage);

  const innerServer = await startServer((req, res) => {
    if (req.url === '/inner') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<html><body><button id="inner-cross">InnerCross</button></body></html>');
      return;
    }

    res.writeHead(404);
    res.end('not found');
  });

  const outerServer = await startServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(
      `<html><body><button id="outer">Outer</button><iframe src="${innerServer.origin}/inner" style="width:320px;height:120px;"></iframe></body></html>`
    );
  });

  try {
    const result = (await capturePage!({ url: `${outerServer.origin}/cross` })) as CapturePageTestResult;
    const labels = result.elements.map((el) => el.label);
    assert.equal(existsSync(result.screenshot), true);
    assert.ok(labels.includes('Outer'));
    assert.equal(labels.includes('InnerCross'), false);
    assert.equal(result.diagnostics.iframe_cross_origin, true);
    assert.ok((result.diagnostics.iframe_frame_stats?.cross_origin_frames ?? 0) >= 1);
    assert.equal((result.diagnostics.iframe_frame_stats?.same_origin_frames ?? 0) >= 1, true);
  } finally {
    await outerServer.close();
    await innerServer.close();
  }
});

test('capture_page applies redaction when input values are requested', { concurrency: false }, async () => {
  assert.ok(capturePage);

  const server = await startServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`
      <html>
        <body>
          <input type="text" aria-label="API Key" value="sk_live_1234567890ABCDEFGH123456" />
          <input type="password" aria-label="Password" value="super-secret-password" />
          <input type="text" aria-label="SensitiveLabel" data-sensitive value="hello-sensitive" />
        </body>
      </html>
    `);
  });

  try {
    const result = (await capturePage!({
      url: `${server.origin}/redact`,
      security: {
        send_input_values: true,
        redact_secrets: true,
        redact_pii: true,
      },
    })) as CapturePageTestResult;

    const apiKeyInput = result.elements.find((el) => el.label === 'API Key');
    const passwordInput = result.elements.find((el) => el.label === 'Password');
    const sensitiveInput = result.elements.find((el) => el.label === '[REDACTED]');

    assert.ok(apiKeyInput);
    assert.ok(passwordInput);
    assert.ok(sensitiveInput);
    assert.equal(apiKeyInput?.value, '[REDACTED]');
    assert.equal(passwordInput?.value, '[REDACTED]');
    assert.equal(sensitiveInput?.value, '[REDACTED]');
    assert.equal(apiKeyInput?.redacted, true);
    assert.equal(passwordInput?.redacted, true);
    assert.equal(sensitiveInput?.redacted, true);
    assert.equal(result.diagnostics.redacted_count >= 3, true);
    assert.equal(existsSync(result.screenshot), true);
  } finally {
    await server.close();
  }
});

test('capture_page extracts realistic form controls and excludes aria-hidden controls', { concurrency: false }, async () => {
  assert.ok(capturePage);

  const server = await startServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`
      <html>
        <body>
          <main style="padding: 24px;">
            <h1>Checkout Form</h1>
            <form>
              <label for="firstName">First name</label>
              <input id="firstName" type="text" value="Taro" />

              <label for="email">Email</label>
              <input id="email" type="email" value="test@example.com" />

              <label for="plan">Plan</label>
              <select id="plan">
                <option value="free">Free</option>
                <option value="pro">Pro</option>
              </select>

              <label>
                <input type="checkbox" checked />
                Accept terms
              </label>

              <label>
                <input type="radio" name="billing" checked />
                Monthly
              </label>

              <button type="submit">Submit Order</button>
            </form>

            <!-- cursor:pointer alone → should NOT be captured after noise reduction -->
            <div id="cursor-only" style="cursor: pointer;">CursorOnly</div>
            <!-- cursor:pointer + tabindex → should be captured -->
            <div id="cursor-tab" style="cursor: pointer;" tabindex="0">CursorAndTab</div>
            <!-- onclick without cursor:pointer → should be captured -->
            <div id="onclick-div" onclick="void(0)">OnclickDiv</div>
            <!-- cursor:pointer + data-action → should be captured -->
            <div id="data-action" style="cursor: pointer;" data-action="open">DataActionDiv</div>
            <button aria-hidden="true">Hidden Action</button>
          </main>
        </body>
      </html>
    `);
  });

  try {
    const result = (await capturePage!({
      url: `${server.origin}/realistic-form`,
      security: {
        send_input_values: true,
        redact_secrets: true,
        redact_pii: true,
      },
    })) as CapturePageTestResult;

    const labels = result.elements.map((el) => el.label);
    const types = new Set(result.elements.map((el) => el.type));

    assert.equal(existsSync(result.screenshot), true);
    assert.ok(labels.includes('First name'));
    assert.ok(labels.includes('Submit Order'));
    assert.equal(labels.includes('Hidden Action'), false, 'aria-hidden elements must be excluded');

    // Noise-reduction: cursor:pointer alone must NOT be captured
    assert.equal(labels.includes('CursorOnly'), false, 'cursor:pointer alone should not be clickable');

    // True clickable signals must still be captured
    assert.ok(labels.includes('CursorAndTab'), 'cursor:pointer + tabindex=0 must be clickable');
    assert.ok(labels.includes('OnclickDiv'), 'onclick handler must be clickable');
    assert.ok(labels.includes('DataActionDiv'), 'cursor:pointer + data-action must be clickable');

    assert.equal(types.has('input'), true);
    assert.equal(types.has('select'), true);
    assert.equal(types.has('checkbox'), true);
    assert.equal(types.has('radio'), true);
    assert.equal(types.has('button'), true);
    assert.equal(types.has('clickable'), true, 'clickable type must still exist for genuine signals');

    const emailInput = result.elements.find((el) => el.label === 'Email');
    assert.equal(emailInput?.value, '[REDACTED]');
    assert.equal(emailInput?.redacted, true);
    assert.equal(result.diagnostics.redacted_count >= 1, true);
  } finally {
    await server.close();
  }
});

test('capture_page clickable noise reduction: cursor:pointer alone is not captured', { concurrency: false }, async () => {
  assert.ok(capturePage);

  const server = await startServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`
      <html>
        <head>
          <style>
            .styled-pointer { cursor: pointer; display: inline-block; padding: 4px; }
            .styled-pointer-child { color: red; }
          </style>
        </head>
        <body style="padding: 16px;">
          <!-- These should NOT appear: cursor:pointer only (own style, inherited, or via class) -->
          <div style="cursor:pointer">InlinePointer</div>
          <div class="styled-pointer">ClassPointer</div>
          <div class="styled-pointer"><span class="styled-pointer-child">InheritedPointer</span></div>

          <!-- These SHOULD appear: additional signals present -->
          <div style="cursor:pointer" tabindex="0">TabPointer</div>
          <div style="cursor:pointer" data-action="go">DataActionPointer</div>
          <div style="cursor:pointer" data-toggle="modal">DataTogglePointer</div>
          <div onclick="void(0)">OnclickNoPointer</div>
          <div style="cursor:pointer" onclick="void(0)">OnclickWithPointer</div>

          <!-- Semantic elements must always be captured regardless -->
          <button>SemanticButton</button>
          <a href="/page">SemanticLink</a>
          <input type="text" aria-label="SemanticInput" />
        </body>
      </html>
    `);
  });

  try {
    const result = (await capturePage!({ url: `${server.origin}/clickable-noise` })) as CapturePageTestResult;
    const labels = result.elements.map((el) => el.label);
    const types = result.elements.map((el) => el.type);

    // ── Should NOT be captured (cursor:pointer only) ─────────────────────
    assert.equal(labels.includes('InlinePointer'), false,
      'div with only inline cursor:pointer should not be clickable');
    assert.equal(labels.includes('ClassPointer'), false,
      'div with only class-based cursor:pointer should not be clickable');

    // ── Should be captured (additional signal present) ────────────────────
    assert.ok(labels.includes('TabPointer'),
      'cursor:pointer + tabindex=0 must be captured');
    assert.ok(labels.includes('DataActionPointer'),
      'cursor:pointer + data-action must be captured');
    assert.ok(labels.includes('DataTogglePointer'),
      'cursor:pointer + data-toggle must be captured');
    assert.ok(labels.includes('OnclickNoPointer'),
      'onclick handler (without cursor:pointer) must be captured');
    assert.ok(labels.includes('OnclickWithPointer'),
      'onclick + cursor:pointer must be captured');

    const clickables = types.filter((t) => t === 'clickable');
    // Should have exactly the 5 genuine clickable elements
    assert.ok(clickables.length >= 5,
      `expected >= 5 clickable elements, got ${clickables.length}`);

    // ── Semantic elements still captured ─────────────────────────────────
    assert.ok(labels.includes('SemanticButton'), 'button must be captured');
    assert.ok(labels.includes('SemanticLink'), 'link must be captured');
    assert.ok(labels.includes('SemanticInput'), 'input must be captured');
  } finally {
    await server.close();
  }
});

test('capture_page auto mode falls back to viewport for tall pages', { concurrency: false }, async () => {
  assert.ok(capturePage);

  const server = await startServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`
      <html>
        <body>
          <div style="height: 2800px; background: linear-gradient(#fff, #eee);"></div>
          <button id="after-spacer">AfterSpacer</button>
        </body>
      </html>
    `);
  });

  try {
    const result = (await capturePage!({
      url: `${server.origin}/tall`,
      capture_mode: 'auto',
    })) as CapturePageTestResult;

    assert.equal(result.diagnostics.capture_mode_used, 'viewport');
    assert.ok((result.diagnostics.capture_mode_reason ?? '').includes('exceeds 2x viewport'));
    assert.equal(result.page_meta.page_height > 1400, true);
    assert.equal(existsSync(result.screenshot), true);
  } finally {
    await server.close();
  }
});
