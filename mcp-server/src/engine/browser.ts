import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { stringify as yamlStringify } from 'yaml';
import { config } from '../config.js';

let browserInstance: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({ headless: true });
  }
  return browserInstance;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance?.isConnected()) {
    await browserInstance.close();
    browserInstance = null;
  }
}

export interface PageSession {
  context: BrowserContext;
  page: Page;
  dispose: () => Promise<void>;
}

export async function createPageSession(
  viewport = config.capture.default_viewport
): Promise<PageSession> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
  });
  const page = await context.newPage();

  return {
    context,
    page,
    dispose: async () => {
      await context.close();
    },
  };
}

export interface WaitOptions {
  strategy?: 'auto' | 'selector' | 'timeout';
  selector?: string;
  timeout?: number;
}

export async function waitForPage(page: Page, opts: WaitOptions = {}): Promise<void> {
  const { strategy = 'auto', selector, timeout = config.capture.default_wait_timeout } = opts;

  if (strategy === 'selector' && selector) {
    await page.waitForSelector(selector, { timeout });
    return;
  }

  if (strategy === 'timeout') {
    await page.waitForTimeout(timeout);
    return;
  }

  // strategy === 'auto': networkidle + 500ms DOM stability
  try {
    await page.waitForLoadState('networkidle', { timeout });
  } catch {
    // Fallback: domcontentloaded
    await page.waitForLoadState('domcontentloaded', { timeout: Math.floor(timeout / 2) });
  }

  // MutationObserver: wait 500ms of DOM stability.
  // Wrapped in try-catch because page.evaluate() may throw if a click-initiated
  // navigation occurs mid-evaluation (the execution context is destroyed).
  try {
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        // document.body may be null during early navigation — resolve immediately in that case.
        if (!document.body) { resolve(); return; }
        let timer: ReturnType<typeof setTimeout> | null = null;
        const observer = new MutationObserver(() => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => { observer.disconnect(); resolve(); }, 500);
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true });
        timer = setTimeout(() => { observer.disconnect(); resolve(); }, 500);
      });
    });
  } catch {
    // Execution context destroyed due to navigation — that's fine, page is ready.
  }
}

/**
 * Serialize metadata to JSON or YAML.
 *
 * Returns the serialized string and the file extension to use.
 * The `format` parameter defaults to `config.output.metadata_format`.
 */
export function serializeMetadata(
  data: unknown,
  format: 'json' | 'yaml' = config.output.metadata_format,
): { content: string; ext: 'json' | 'yaml' } {
  if (format === 'yaml') {
    return { content: yamlStringify(data), ext: 'yaml' };
  }
  return { content: JSON.stringify(data, null, 2), ext: 'json' };
}

/**
 * Build a PNG filename from the configured filename_template.
 *
 * Supported template variables:
 *   {name}      — the logical name passed by the caller (e.g. "capture", "step_01")
 *   {viewport}  — viewport dimensions as "WxH" (e.g. "1280x720")
 *   {timestamp} — compact ISO timestamp "YYYYMMDDTHHmmss"
 *
 * The `template` parameter defaults to `config.output.filename_template` and can
 * be overridden in tests without touching the module-level singleton.
 */
export function buildFilename(
  name: string,
  viewport: { width: number; height: number },
  template = config.output.filename_template,
): string {
  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .slice(0, 15);
  const base = template
    .replace(/\{name\}/g, name)
    .replace(/\{viewport\}/g, `${viewport.width}x${viewport.height}`)
    .replace(/\{timestamp\}/g, ts);
  return `${base}.png`;
}
