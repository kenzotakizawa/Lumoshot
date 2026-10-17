import { GIF_COLOR_OPTIONS } from './gifEncode';
import { GIF_FPS_OPTIONS } from './timeline';

// GIF export settings, remembered between sessions.
export interface GifSettings {
    fps: number;
    // Output size relative to the recording (0.25–1).
    scale: number;
    colors: number;
    dither: boolean;
    loop: boolean;
    // Shorten still moments to at most PAUSE_LIMIT_MS.
    shortenPauses: boolean;
}

export const PAUSE_LIMIT_MS = 1000;
export const GIF_SCALE_RANGE = { min: 0.25, max: 1, step: 0.05 } as const;

export const DEFAULT_GIF_SETTINGS: GifSettings = {
    fps: 10,
    scale: 1,
    colors: 128,
    dither: false,
    loop: true,
    shortenPauses: false,
};

const STORAGE_KEY = 'lumoshot.gifSettings';

export function normalizeGifSettings(raw: unknown): GifSettings {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const d = DEFAULT_GIF_SETTINGS;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const fps = num(r.fps);
    const colors = num(r.colors);
    const scale = num(r.scale);
    return {
        fps: fps !== null && (GIF_FPS_OPTIONS as readonly number[]).includes(fps) ? fps : d.fps,
        colors: colors !== null && (GIF_COLOR_OPTIONS as readonly number[]).includes(colors) ? colors : d.colors,
        scale: scale !== null ? Math.min(GIF_SCALE_RANGE.max, Math.max(GIF_SCALE_RANGE.min, scale)) : d.scale,
        dither: typeof r.dither === 'boolean' ? r.dither : d.dither,
        loop: typeof r.loop === 'boolean' ? r.loop : d.loop,
        shortenPauses: typeof r.shortenPauses === 'boolean' ? r.shortenPauses : d.shortenPauses,
    };
}

export function loadGifSettings(): GifSettings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return normalizeGifSettings(raw ? JSON.parse(raw) : null);
    } catch {
        return { ...DEFAULT_GIF_SETTINGS };
    }
}

export function saveGifSettings(settings: GifSettings): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
        // Not remembered (private mode / blocked storage).
    }
}

// 2_400_000 → "2.4 MB"
export function formatBytes(bytes: number): string {
    if (bytes < 1000 * 1000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
    return `${(bytes / (1000 * 1000)).toFixed(bytes < 10 * 1000 * 1000 ? 1 : 0)} MB`;
}

// Common upload limits (GitHub, Qiita, …) sit around 10 MB.
export const LARGE_GIF_BYTES = 10 * 1000 * 1000;
