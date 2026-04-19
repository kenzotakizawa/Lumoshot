import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { startServer } from '../../helpers/http-server.js';
import type {
  CapturePageHarness,
  CapturePageTestResult,
} from '../../helpers/capture-page-harness.js';

export function registerCapturePageModeScenarios(
  getHarness: () => CapturePageHarness,
): void {
  test('capture_page auto mode falls back to viewport for tall pages', { concurrency: false }, async () => {
    const { capturePage } = getHarness();

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
      const result = (await capturePage({
        url: `${server.origin}/tall`,
        capture_mode: 'auto',
      })) as CapturePageTestResult;

      assert.equal(result.diagnostics.capture_mode_used, 'viewport');
      assert.ok((result.diagnostics.capture_mode_reason ?? '').includes('exceeds auto threshold'));
      assert.equal(result.page_meta.page_height > 1400, true);
      assert.equal(existsSync(result.screenshot), true);
    } finally {
      await server.close();
    }
  });
}
