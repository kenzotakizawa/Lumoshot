import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { startServer } from '../../helpers/http-server.js';
import type {
  CapturePageHarness,
  CapturePageTestResult,
} from '../../helpers/capture-page-harness.js';

export function registerCapturePageSecurityScenarios(
  getHarness: () => CapturePageHarness,
): void {
  test('capture_page applies redaction when input values are requested', { concurrency: false }, async () => {
    const { capturePage } = getHarness();

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
      const result = (await capturePage({
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
    const { capturePage } = getHarness();

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

              <div id="cursor-only" style="cursor: pointer;">CursorOnly</div>
              <div id="cursor-tab" style="cursor: pointer;" tabindex="0">CursorAndTab</div>
              <div id="onclick-div" onclick="void(0)">OnclickDiv</div>
              <div id="data-action" style="cursor: pointer;" data-action="open">DataActionDiv</div>
              <button aria-hidden="true">Hidden Action</button>
            </main>
          </body>
        </html>
      `);
    });

    try {
      const result = (await capturePage({
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

      assert.equal(labels.includes('CursorOnly'), false, 'cursor:pointer alone should not be clickable');

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
    const { capturePage } = getHarness();

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
            <div style="cursor:pointer">InlinePointer</div>
            <div class="styled-pointer">ClassPointer</div>
            <div class="styled-pointer"><span class="styled-pointer-child">InheritedPointer</span></div>

            <div style="cursor:pointer" tabindex="0">TabPointer</div>
            <div style="cursor:pointer" data-action="go">DataActionPointer</div>
            <div style="cursor:pointer" data-toggle="modal">DataTogglePointer</div>
            <div onclick="void(0)">OnclickNoPointer</div>
            <div style="cursor:pointer" onclick="void(0)">OnclickWithPointer</div>

            <button>SemanticButton</button>
            <a href="/page">SemanticLink</a>
            <input type="text" aria-label="SemanticInput" />
          </body>
        </html>
      `);
    });

    try {
      const result = (await capturePage({ url: `${server.origin}/clickable-noise` })) as CapturePageTestResult;
      const labels = result.elements.map((el) => el.label);
      const types = result.elements.map((el) => el.type);

      assert.equal(labels.includes('InlinePointer'), false,
        'div with only inline cursor:pointer should not be clickable');
      assert.equal(labels.includes('ClassPointer'), false,
        'div with only class-based cursor:pointer should not be clickable');

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
      assert.ok(clickables.length >= 5,
        `expected >= 5 clickable elements, got ${clickables.length}`);

      assert.ok(labels.includes('SemanticButton'), 'button must be captured');
      assert.ok(labels.includes('SemanticLink'), 'link must be captured');
      assert.ok(labels.includes('SemanticInput'), 'input must be captured');
    } finally {
      await server.close();
    }
  });
}
