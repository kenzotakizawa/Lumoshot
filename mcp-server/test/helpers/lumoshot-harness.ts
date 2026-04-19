import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { resetConfigForTest } from '../../src/config.js';

export interface LumoshotHarness {
  tempRoot: string;
  outputDir: string;
  restore: (closeBrowser?: (() => Promise<void>) | null) => Promise<void>;
}

export interface SetupLumoshotHarnessOptions {
  tmpPrefix: string;
  outputDirectory: string;
  trustedDomains?: string[];
  /** When true, writes output.keep_raw=true so raw files survive for diff assertions. */
  keepRaw?: boolean;
}

export function setupLumoshotHarness(options: SetupLumoshotHarnessOptions): LumoshotHarness {
  const originalHome = process.env.HOME ?? '';
  const originalUserProfile = process.env.USERPROFILE ?? '';
  const originalCwd = process.cwd();
  const originalPlaywrightBrowsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '';

  const tempRoot = mkdtempSync(join(tmpdir(), options.tmpPrefix));
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
          trusted_domains: options.trustedDomains ?? [],
        },
        output: {
          directory: options.outputDirectory,
          ...(options.keepRaw ? { keep_raw: true } : {}),
        },
      },
      null,
      2
    ),
    'utf-8'
  );

  // Prevent integration tests from failing due to the free-tier 30 capture limit.
  // The harness isolates HOME already; we seed a generous per-month budget here.
  writeFileSync(
    join(tempRoot, '.lumoshot', 'usage.json'),
    JSON.stringify(
      {
        month: new Date().toISOString().slice(0, 7),
        capture_count: 0,
        limit: 10000,
      },
      null,
      2,
    ),
    'utf-8',
  );

  // Reload the config singleton so modules that imported `config` see the new
  // temporary HOME/cwd values written above.
  resetConfigForTest();

  const outputDir = resolve(options.outputDirectory);

  return {
    tempRoot,
    outputDir,
    async restore(closeBrowser?: (() => Promise<void>) | null): Promise<void> {
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

      // Restore config to reflect the original cwd/HOME.
      resetConfigForTest();
    },
  };
}
