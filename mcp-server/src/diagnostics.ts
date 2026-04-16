import { execSync } from 'child_process';
import { platform } from 'os';
import { chromium } from 'playwright';

export interface FontDiagnosis {
  os: string;
  checked_fonts: string[];
  found: string[];
  install_commands: Record<string, string>;
}

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

const JP_FONTS = ['Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', 'Meiryo', 'NotoSansCJK'];

const INSTALL_COMMANDS: Record<string, string> = {
  darwin: 'brew install --cask font-noto-sans-jp',
  linux: 'sudo apt install fonts-noto-cjk',
  win32: 'winget install Google.NotoSansCJK',
};

function checkFonts(): FontDiagnosis {
  const os = platform();
  const found: string[] = [];

  try {
    let fontList = '';
    if (os === 'darwin') {
      fontList = execSync('fc-list :lang=ja 2>/dev/null || ls /System/Library/Fonts/ /Library/Fonts/ ~/Library/Fonts/ 2>/dev/null', { encoding: 'utf-8' });
    } else if (os === 'linux') {
      fontList = execSync('fc-list :lang=ja 2>/dev/null', { encoding: 'utf-8' });
    } else if (os === 'win32') {
      fontList = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts" 2>nul', { encoding: 'utf-8' });
    }

    for (const font of JP_FONTS) {
      if (fontList.toLowerCase().includes(font.toLowerCase().replace(' ', ''))) {
        found.push(font);
      }
    }
  } catch {
    // Font check failed, assume no fonts
  }

  return {
    os,
    checked_fonts: JP_FONTS,
    found,
    install_commands: INSTALL_COMMANDS,
  };
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

export async function runDiagnostics(): Promise<DiagnosticsResult> {
  const issues: DiagnosticsResult['issues'] = [];

  // Font check
  const fontDiag = checkFonts();
  const hasFonts = fontDiag.found.length > 0;
  if (!hasFonts) {
    issues.push({
      type: 'font_missing',
      severity: 'warning',
      detail: {
        status: 'font_missing',
        message: 'Japanese font not found. Text annotations may render incorrectly.',
        diagnosis: fontDiag,
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
      text_annotation: hasFonts,
      flow_execution: hasPlaywright,
    },
  };
}
