import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { SecurityConfig, Preset } from './types.js';

export interface LumoshotConfig {
  security: SecurityConfig;
  capture: {
    default_viewport: { width: number; height: number };
    default_preset: Preset;
    default_wait_timeout: number;
    default_capture_mode: string;
  };
  annotation: {
    spotlight_shape: 'auto' | 'rect' | 'ellipse';
    os_frame_style: 'auto' | 'macos' | 'windows' | 'linux';
    dark_mode: 'auto' | 'light' | 'dark';
  };
  output: {
    directory: string;
    filename_template: string;
    metadata_format: 'json' | 'yaml';
  };
}

const DEFAULT_CONFIG: LumoshotConfig = {
  security: {
    redact_secrets: true,
    redact_pii: false,
    send_input_values: false,
    custom_redact_patterns: [],
    trusted_domains: ['localhost', '127.0.0.1'],
  },
  capture: {
    default_viewport: { width: 1280, height: 720 },
    default_preset: 'auto',
    default_wait_timeout: 5000,
    default_capture_mode: 'auto',
  },
  annotation: {
    spotlight_shape: 'auto',
    os_frame_style: 'auto',
    dark_mode: 'auto',
  },
  output: {
    directory: './lumoshot-output',
    filename_template: '{name}_{viewport}_{timestamp}',
    metadata_format: 'json',
  },
};

function deepMerge<T>(base: T, override: Partial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(override) as (keyof T)[]) {
    const v = override[key];
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      result[key] = deepMerge(base[key] as object, v as object) as T[keyof T];
    } else if (v !== undefined) {
      result[key] = v as T[keyof T];
    }
  }
  return result;
}

function loadConfigFile(path: string): Partial<LumoshotConfig> {
  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as Partial<LumoshotConfig>;
  } catch {
    return {};
  }
}

export function loadConfig(): LumoshotConfig {
  const homeConfig = join(homedir(), '.lumoshot', 'lumoshot.config.json');
  const legacyHomeConfig = join(homedir(), '.lumoshot', 'config.json');
  const cwdConfig = join(process.cwd(), 'lumoshot.config.json');

  let config = DEFAULT_CONFIG;

  // Backward compatibility for old config filename
  if (existsSync(legacyHomeConfig)) {
    config = deepMerge(config, loadConfigFile(legacyHomeConfig));
  }
  if (existsSync(homeConfig)) {
    config = deepMerge(config, loadConfigFile(homeConfig));
  }
  // Project-level config takes priority
  if (existsSync(cwdConfig)) {
    config = deepMerge(config, loadConfigFile(cwdConfig));
  }

  return config;
}

export const config = loadConfig();
