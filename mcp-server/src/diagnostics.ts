import { chromium } from 'playwright';
import { getCjkFontWarning } from './domain/diagnostics/cjk-font.js';

export type { FontDiagnosis } from './domain/diagnostics/cjk-font.js';

export interface DiagnosticsResult {
  ready: boolean;
  issues: Array<{
    type: string;
    severity: 'error' | 'warning';
    detail: unknown;
  }>;
  capabilities: {
    screenshot: boolean;
    text_annotation: boolean;
    flow_execution: boolean;
  };
}

export interface RunDiagnosticsOptions {
  refresh?: boolean;
  requireCjkText?: boolean;
  locale?: string;
  textSamples?: string[];
}

async function checkPlaywright(): Promise<boolean> {
  try {
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    return true;
  } catch {
    return false;
  }
}

export async function runDiagnostics(options: RunDiagnosticsOptions = {}): Promise<DiagnosticsResult> {
  const issues: DiagnosticsResult['issues'] = [];

  const fontWarning = getCjkFontWarning(
    {
      requireCjkText: options.requireCjkText,
      locale: options.locale,
      textSamples: options.textSamples,
    },
    { refresh: options.refresh },
  );
  if (fontWarning) {
    issues.push({
      type: 'font_missing',
      severity: 'warning',
      detail: {
        status: 'font_missing',
        message: fontWarning.message,
        diagnosis: fontWarning.diagnosis,
        requirement: fontWarning.requirement,
        ...(fontWarning.install_command ? { install_command: fontWarning.install_command } : {}),
      },
    });
  }

  // Playwright check
  const hasPlaywright = await checkPlaywright();
  if (!hasPlaywright) {
    issues.push({
      type: 'playwright_missing',
      severity: 'error',
      detail: {
        status: 'playwright_missing',
        message: 'Chromium not found. Run: npx playwright install chromium',
        fix_command: 'npx playwright install chromium',
      },
    });
  }

  const hasErrors = issues.some((i) => i.severity === 'error');

  return {
    ready: !hasErrors,
    issues,
    capabilities: {
      screenshot: hasPlaywright,
      text_annotation: !fontWarning,
      flow_execution: hasPlaywright,
    },
  };
}
