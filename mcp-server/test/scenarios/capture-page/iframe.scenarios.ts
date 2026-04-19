import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { startServer } from '../../helpers/http-server.js';
import type {
  CapturePageHarness,
  CapturePageTestResult,
} from '../../helpers/capture-page-harness.js';

export function registerCapturePageIframeScenarios(
  getHarness: () => CapturePageHarness,
): void {
  test('capture_page includes same-origin iframe elements', { concurrency: false }, async () => {
    const { capturePage } = getHarness();

    const server = await startServer((req, res) => {
      if (req.url === '/inner') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end('<html><body><button id="inner">Inner</button></body></html>');
        return;
      }

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(
        '<html><body><button id="outer">Outer</button><iframe src="/inner" style="width:320px;height:120px;"></iframe></body></html>',
      );
    });

    try {
      const result = (await capturePage({ url: `${server.origin}/same` })) as CapturePageTestResult;
      const labels = result.elements.map((el) => el.label);

      assert.equal(existsSync(result.screenshot), true);
      assert.ok(labels.includes('Outer'));
      assert.ok(labels.includes('Inner'));
      assert.equal(result.diagnostics.iframe_cross_origin, false);
      assert.equal(result.diagnostics.iframe_frame_stats?.cross_origin_frames, 0);
      assert.ok((result.diagnostics.iframe_frame_stats?.same_origin_frames ?? 0) >= 2);

      const badgeNumbers = result.elements
        .map((el) => el.badge_number)
        .filter((n): n is number => typeof n === 'number');
      const sorted = [...badgeNumbers].sort((a, b) => a - b);
      const expected = Array.from({ length: badgeNumbers.length }, (_, i) => i + 1);
      assert.deepEqual(sorted, expected);
      assert.equal(result.elements.every((el) => Array.isArray(el.badge_position)), true);
      assert.equal(
        result.elements.every((el) => {
          if (!el.badge_position) return false;
          const [bx, by] = el.badge_position;
          const [x, y, w, h] = el.bbox;
          const badgeRight = bx + 32;
          const badgeBottom = by + 32;
          return !(bx < x + w && badgeRight > x && by < y + h && badgeBottom > y);
        }),
        true,
      );
    } finally {
      await server.close();
    }
  });

  test('capture_page flags cross-origin iframes and skips their DOM', { concurrency: false }, async () => {
    const { capturePage } = getHarness();

    const innerServer = await startServer((req, res) => {
      if (req.url === '/inner') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end('<html><body><button id="inner-cross">InnerCross</button></body></html>');
        return;
      }

      res.writeHead(404);
      res.end('not found');
    });

    const outerServer = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(
        `<html><body><button id="outer">Outer</button><iframe src="${innerServer.origin}/inner" style="width:320px;height:120px;"></iframe></body></html>`,
      );
    });

    try {
      const result = (await capturePage({ url: `${outerServer.origin}/cross` })) as CapturePageTestResult;
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
}
