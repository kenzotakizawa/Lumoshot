import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { startRouteServer } from '../../helpers/http-server.js';
import type {
  CapturePageHarness,
  CapturePageTestResult,
} from '../../helpers/capture-page-harness.js';

export function registerCapturePageRegionScenarios(
  getHarness: () => CapturePageHarness,
): void {
  test('capture_page returns DOM-derived regions for web pages', { concurrency: false }, async () => {
    const { capturePage } = getHarness();

    const html = `<!DOCTYPE html>
      <html><body style="margin:0">
        <header style="height:64px;background:#1f2937;color:#fff;padding:16px">Toolbar</header>
        <aside style="position:absolute;left:0;top:64px;width:220px;height:420px;background:#e5e7eb">Sidebar</aside>
        <main style="margin-left:220px;padding:20px">
          <button>Run</button>
          <a href="#next">Next</a>
        </main>
      </body></html>`;
    const server = await startRouteServer({ '/': { status: 200, html } });

    try {
      const result = (await capturePage({
        url: `${server.origin}/`,
        include_regions: true,
      })) as CapturePageTestResult;

      assert.equal(existsSync(result.screenshot), true);
      assert.ok(result.regions.length > 0, 'regions must be returned');
      assert.ok(result.regions.some((r) => r.kind === 'main'), 'main region should exist');
      assert.equal(result.diagnostics.region_source, 'dom');
      assert.equal(result.diagnostics.region_count, result.regions.length);
    } finally {
      await server.close();
    }
  });

  test('capture_page image_path mode returns image-derived regions', { concurrency: false }, async () => {
    const { capturePage } = getHarness();
    const tempDir = mkdtempSync(join(tmpdir(), 'lumoshot-image-mode-'));
    const imagePath = join(tempDir, 'layout.png');

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="960" height="540">
        <rect x="0" y="0" width="960" height="64" fill="#0f172a"/>
        <rect x="0" y="64" width="180" height="476" fill="#e2e8f0"/>
        <rect x="180" y="64" width="780" height="406" fill="#ffffff"/>
        <rect x="180" y="470" width="780" height="70" fill="#dbeafe"/>
      </svg>
    `;
    await sharp(Buffer.from(svg)).png().toFile(imagePath);

    const result = (await capturePage({
      image_path: imagePath,
      include_regions: true,
    })) as CapturePageTestResult;

    assert.equal(existsSync(result.screenshot), true);
    assert.equal(result.elements.length, 0, 'image mode should not return DOM elements');
    assert.ok(result.regions.length > 0, 'image mode should return detected regions');
    assert.equal(result.diagnostics.capture_mode_used, 'image');
    assert.equal(result.diagnostics.region_source, 'image');
  });
}
