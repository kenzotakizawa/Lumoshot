import { execSync } from 'child_process';
import { platform } from 'os';

export interface FontDiagnosis {
  os: string;
  checked_fonts: string[];
  found: string[];
  install_commands: Record<string, string>;
}

export interface CjkTextRequirementInput {
  requireCjkText?: boolean;
  locale?: string;
  textSamples?: string[];
}

export interface CjkTextRequirement {
  required: boolean;
  reason: 'explicit' | 'locale' | 'text_sample' | 'none';
  locale?: string;
  sample?: string;
}

export interface CjkFontWarning {
  message: string;
  diagnosis: FontDiagnosis;
  requirement: CjkTextRequirement;
  install_command?: string;
}

const CJK_FONTS = ['Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', 'Meiryo', 'NotoSansCJK'];

const INSTALL_COMMANDS: Record<string, string> = {
  darwin: 'brew install --cask font-noto-sans-jp',
  linux: 'sudo apt install fonts-noto-cjk',
  win32: 'winget install Google.NotoSansCJK',
};

const CJK_TEXT_PATTERN = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\p{Script=Hangul}\uFF00-\uFFEF]/u;

let cachedFontDiagnosis: FontDiagnosis | null = null;

function isCjkLocale(locale: string): boolean {
  const tokens = locale
    .split(/[,\s;]+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  for (const token of tokens) {
    const match = token.match(/^([a-z]{2,3})(?:[-_].*)?$/i);
    if (!match) continue;
    const language = match[1].toLowerCase();
    if (language === 'ja' || language === 'zh' || language === 'ko') {
      return true;
    }
  }
  return false;
}

function loadSystemFontList(os: string): string {
  if (os === 'darwin') {
    return execSync(
      'fc-list :lang=ja 2>/dev/null || ls /System/Library/Fonts/ /Library/Fonts/ ~/Library/Fonts/ 2>/dev/null',
      { encoding: 'utf-8' },
    );
  }
  if (os === 'linux') {
    return execSync('fc-list :lang=ja 2>/dev/null', { encoding: 'utf-8' });
  }
  if (os === 'win32') {
    return execSync(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts" 2>nul',
      { encoding: 'utf-8' },
    );
  }
  return '';
}

function resolveInstallCommand(diagnosis: FontDiagnosis): string | undefined {
  return diagnosis.install_commands[diagnosis.os];
}

export function hasCjkCharacters(value: string): boolean {
  return CJK_TEXT_PATTERN.test(value);
}

export function detectCjkTextRequirement(input: CjkTextRequirementInput = {}): CjkTextRequirement {
  if (input.requireCjkText) {
    return { required: true, reason: 'explicit' };
  }

  if (input.locale && isCjkLocale(input.locale)) {
    return { required: true, reason: 'locale', locale: input.locale };
  }

  for (const sample of input.textSamples ?? []) {
    if (hasCjkCharacters(sample)) {
      return { required: true, reason: 'text_sample', sample };
    }
  }

  return { required: false, reason: 'none' };
}

export function checkCjkFonts(options: { refresh?: boolean } = {}): FontDiagnosis {
  if (cachedFontDiagnosis && !options.refresh) {
    return cachedFontDiagnosis;
  }

  const os = platform();
  const found: string[] = [];

  try {
    const fontListRaw = loadSystemFontList(os);
    const fontList = fontListRaw.toLowerCase().replace(/\s+/g, '');
    for (const font of CJK_FONTS) {
      if (fontList.includes(font.toLowerCase().replace(/\s+/g, ''))) {
        found.push(font);
      }
    }
  } catch {
    // Best effort: when detection fails, keep `found` empty and surface as warning only when needed.
  }

  cachedFontDiagnosis = {
    os,
    checked_fonts: CJK_FONTS,
    found,
    install_commands: INSTALL_COMMANDS,
  };
  return cachedFontDiagnosis;
}

export function getCjkFontWarning(
  input: CjkTextRequirementInput = {},
  options: { refresh?: boolean } = {},
): CjkFontWarning | null {
  const requirement = detectCjkTextRequirement(input);
  if (!requirement.required) {
    return null;
  }

  const diagnosis = checkCjkFonts(options);
  if (diagnosis.found.length > 0) {
    return null;
  }

  return {
    message: 'CJK text detected, but Japanese/CJK fonts were not found. Text annotations may render incorrectly.',
    diagnosis,
    requirement,
    install_command: resolveInstallCommand(diagnosis),
  };
}
