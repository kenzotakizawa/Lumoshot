import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { config } from '../../../src/config.js';
import { startRouteServer } from '../../helpers/http-server.js';
import type {
  CapturePageHarness,
  CapturePageTestResult,
} from '../../helpers/capture-page-harness.js';

export function registerCapturePageOutputAndScrollScenarios(
  getHarness: () => CapturePageHarness,
): void {
  test('capture_page supports jpeg output and scale resize', { concurrency: false }, async () => {
    const { capturePage } = getHarness();

    const html = `<!DOCTYPE html><html><head><style>
      html,body{margin:0;padding:0}
      .hero{height:640px;background:linear-gradient(160deg,#2b6cb0,#2c5282)}
      .cta{margin:24px 32px;padding:12px 20px;background:#fff;border:none;border-radius:8px}
    </style></head><body>
      <div class="hero"><button class="cta">Download Report</button></div>
      <div style="height:1200px"></div>
    </body></html>`;

    const server = await startRouteServer({ '/': { status: 200, html } });

    try {
      const result = (await capturePage({
        url: `${server.origin}/`,
        output_format: 'jpeg',
        scale: 0.5,
      })) as CapturePageTestResult;

      assert.equal(existsSync(result.screenshot), true);
      assert.ok(
        result.screenshot.endsWith('.jpg') || result.screenshot.endsWith('.jpeg'),
        `expected jpeg extension, got: ${result.screenshot}`,
      );

      const meta = await sharp(result.screenshot).metadata();
      // viewport=1280 CSS px, scale=0.5. Physical width = 1280 * 0.5 * DPR.
      const dpr = config.capture.device_pixel_ratio;
      const expectedMaxWidth = Math.round(1280 * 0.5 * dpr);
      assert.ok((meta.width ?? 0) > 0 && (meta.width ?? 0) <= expectedMaxWidth, `scaled jpeg width unexpected: ${meta.width} (expected <= ${expectedMaxWidth})`);
      assert.equal(meta.format, 'jpeg');
    } finally {
      await server.close();
    }
  });

  test('capture_page scroll_to_ref scrolls target near viewport center before capture', { concurrency: false }, async () => {
    const { capturePage } = getHarness();

    const html = `<!DOCTYPE html><html><head><style>
      html,body{margin:0;padding:0}
      #above{position:absolute;left:40px;top:40px;width:180px;height:42px}
      #target{position:absolute;left:40px;top:680px;width:220px;height:42px}
      .spacer{height:2200px}
    </style></head><body>
      <button id="above">Top Action</button>
      <button id="target">Scroll Target</button>
      <div class="spacer"></div>
    </body></html>`;

    const server = await startRouteServer({ '/': { status: 200, html } });

    try {
      const baseline = (await capturePage({ url: `${server.origin}/` })) as CapturePageTestResult;
      const targetRef = baseline.elements.find((e) => e.label.includes('Scroll Target'))?.ref;
      assert.ok(targetRef != null, 'target ref should be discovered in baseline capture');

      const scrolled = (await capturePage({
        url: `${server.origin}/`,
        scroll_to_ref: targetRef,
      })) as CapturePageTestResult;

      assert.equal(existsSync(scrolled.screenshot), true);
      assert.ok(
        (scrolled.page_meta as { scroll_position?: { y?: number } }).scroll_position?.y != null
          && ((scrolled.page_meta as { scroll_position?: { y?: number } }).scroll_position?.y ?? 0) > 120,
        `scroll_to_ref should adjust scroll position, got: ${JSON.stringify(scrolled.page_meta)}`,
      );
      assert.equal(
        scrolled.diagnostics.scroll_to_ref_result,
        'applied',
        'successful scroll_to_ref should report applied in diagnostics',
      );
    } finally {
      await server.close();
    }
  });

  test('capture_page auto-compacts badge overlays on dense pages', { concurrency: false }, async () => {
    const { capturePage } = getHarness();

    const linkItems = Array.from({ length: 80 }, (_, i) =>
      `<a href="#l${i}" style="display:inline-block;margin:4px;padding:4px 8px;border:1px solid #ddd">Link ${i + 1}</a>`,
    ).join('');
    const html = `<!DOCTYPE html><html><head><style>html,body{margin:0;padding:12px;font-family:sans-serif}</style></head>
      <body>
        <button id="primary">Primary Action</button>
        <input id="query" placeholder="Search" />
        <div style="margin-top:12px">${linkItems}</div>
      </body></html>`;

    const server = await startRouteServer({ '/': { status: 200, html } });

    try {
      const result = (await capturePage({ url: `${server.origin}/` })) as CapturePageTestResult;
      const diagnostics = result.diagnostics as {
        badge_density_mode?: string;
        badge_numbering_mode?: string;
        badge_limit_used?: number;
        badge_rendered_count?: number;
        badge_suppressed_count?: number;
        badge_low_priority_selected_count?: number;
        badge_low_priority_suppressed_count?: number;
      };

      assert.equal(existsSync(result.screenshot), true);
      assert.equal(diagnostics.badge_density_mode, 'compact');
      assert.equal(diagnostics.badge_numbering_mode, 'reindexed');
      assert.ok((diagnostics.badge_limit_used ?? 0) > 0, 'badge_limit_used should be reported');
      assert.ok((diagnostics.badge_rendered_count ?? 0) > 0, 'badge_rendered_count should be > 0');
      assert.ok((diagnostics.badge_rendered_count ?? 0) <= 24, 'badge_rendered_count should be capped');
      assert.ok(
        (diagnostics.badge_low_priority_selected_count ?? 0) <= 8,
        'compact mode should cap low-priority badge count',
      );
      assert.ok((diagnostics.badge_suppressed_count ?? 0) > 0, 'badge_suppressed_count should be > 0');
      assert.ok(
        (diagnostics.badge_low_priority_suppressed_count ?? 0) > 0,
        'low-priority badges should be suppressed on dense pages',
      );
    } finally {
      await server.close();
    }
  });

  test('capture_page scroll_to_ref returns ref_not_found when ref is missing', { concurrency: false }, async () => {
    const { capturePage } = getHarness();
    const html = `<!DOCTYPE html><html><body><button>Only Button</button></body></html>`;
    const server = await startRouteServer({ '/': { status: 200, html } });
    try {
      const result = (await capturePage({
        url: `${server.origin}/`,
        scroll_to_ref: 9999,
      })) as CapturePageTestResult;
      assert.equal(
        result.diagnostics.scroll_to_ref_result,
        'ref_not_found',
        'unknown scroll_to_ref should report ref_not_found in diagnostics',
      );
    } finally {
      await server.close();
    }
  });

  test('capture_mode=element without element_ref is rejected by schema', { concurrency: false }, async () => {
    const { capturePage } = getHarness();
    const html = `<!DOCTYPE html><html><body><button>Test</button></body></html>`;
    const server = await startRouteServer({ '/': { status: 200, html } });
    try {
      await assert.rejects(
        () => capturePage({ url: `${server.origin}/`, capture_mode: 'element' }),
        (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          return msg.includes('element_ref') || msg.includes('element');
        },
        'capture_mode=element without element_ref should throw a validation error',
      );
    } finally {
      await server.close();
    }
  });

  test('capture_page full mode uses stricter badge cap for readability', { concurrency: false }, async () => {
    const { capturePage } = getHarness();

    const linkItems = Array.from({ length: 120 }, (_, i) =>
      `<a href="#l${i}" style="display:inline-block;margin:4px;padding:4px 8px;border:1px solid #ddd">Link ${i + 1}</a>`,
    ).join('');
    const html = `<!DOCTYPE html><html><head><style>html,body{margin:0;padding:12px;font-family:sans-serif}</style></head>
      <body>
        <button id="primary">Primary Action</button>
        <input id="query" placeholder="Search" />
        <div style="margin-top:12px">${linkItems}</div>
      </body></html>`;

    const server = await startRouteServer({ '/': { status: 200, html } });

    try {
      const result = (await capturePage({
        url: `${server.origin}/`,
        capture_mode: 'full',
      })) as CapturePageTestResult;
      const diagnostics = result.diagnostics as {
        capture_mode_used?: string;
        badge_density_mode?: string;
        badge_limit_used?: number;
        badge_rendered_count?: number;
        badge_low_priority_selected_count?: number;
        badge_low_priority_suppressed_count?: number;
      };

      assert.equal(result.diagnostics.capture_mode_used, 'full');
      assert.equal(existsSync(result.screenshot), true);
      assert.equal(diagnostics.badge_density_mode, 'compact');
      assert.equal(diagnostics.badge_limit_used, 14);
      assert.ok((diagnostics.badge_rendered_count ?? 0) <= 14, 'full mode should use a tighter badge cap');
      assert.ok(
        (diagnostics.badge_low_priority_selected_count ?? 0) <= 8,
        'full mode compact should cap low-priority badge count',
      );
      assert.ok(
        (diagnostics.badge_low_priority_suppressed_count ?? 0) > 0,
        'full mode compact should suppress low-priority badges',
      );
    } finally {
      await server.close();
    }
  });
}
