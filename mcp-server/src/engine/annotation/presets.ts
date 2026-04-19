import type { Preset, PresetColors, Theme } from '../../types.js';
import { PRESETS } from '../../types.js';

export const DEFAULT_BOX_BORDER_COLOR = '#E53E3E';

const COLOR_ROTATION_PRECISE = ['#E53E3E', '#ED8936', '#D69E2E'];
const COLOR_ROTATION_FRIENDLY = ['#3182CE', '#38B2AC', '#38A169', '#9F7AEA'];
const COLOR_ROTATION_NEUTRAL = ['#718096', '#4A5568', '#2D3748'];

const THEME_PRESETS: Record<Theme, PresetColors> = {
  red: {
    primary: '#E53E3E',
    secondary: '#E53E3E',
    badge_bg: '#E53E3E',
    badge_text: '#FFFFFF',
    text_color: '#1A202C',
    border_radius: 4,
    line_width: 2,
  },
  blue: {
    primary: '#3182CE',
    secondary: '#3182CE',
    badge_bg: '#3182CE',
    badge_text: '#FFFFFF',
    text_color: '#1A202C',
    border_radius: 6,
    line_width: 2,
  },
  mono: {
    primary: '#4A5568',
    secondary: '#4A5568',
    badge_bg: '#4A5568',
    badge_text: '#FFFFFF',
    text_color: '#2D3748',
    border_radius: 4,
    line_width: 2,
  },
};

export function resolvePreset(preset: Preset): PresetColors {
  if (preset === 'auto' || !(preset in PRESETS)) return PRESETS.friendly;
  return PRESETS[preset as keyof typeof PRESETS];
}

export function getRotatedColor(preset: PresetColors, index: number): string {
  if (preset.primary === PRESETS.precise.primary) {
    return COLOR_ROTATION_PRECISE[index % COLOR_ROTATION_PRECISE.length];
  }
  if (preset.primary === PRESETS.neutral.primary) {
    return COLOR_ROTATION_NEUTRAL[index % COLOR_ROTATION_NEUTRAL.length];
  }
  return COLOR_ROTATION_FRIENDLY[index % COLOR_ROTATION_FRIENDLY.length];
}

export function resolveTheme(theme?: Theme): PresetColors | null {
  if (!theme) return null;
  return THEME_PRESETS[theme] ?? null;
}
