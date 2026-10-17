// Timing of a recording and of the GIF made from it.
//
// A recording stores only the frames where the screen changed, each with its
// start time (ms from the start). A frame lasts until the next one starts;
// the last one until the end of the recording. Edits never touch the frames:
// trimming and deleting are applied when the GIF (or the preview) is built.

export interface GifEdit {
    // Kept part of the recording, in source time (ms).
    trimStart: number;
    trimEnd: number;
    // Source frame indices left out of the GIF.
    deleted: number[];
}

export interface OutputFrame {
    // Source frame shown.
    index: number;
    // How long it is shown (ms).
    duration: number;
}

export interface OutputOptions {
    fps: number;
    // Shorten any still moment to at most this long (ms). null = keep as is.
    maxPauseMs?: number | null;
}

export const GIF_FPS_OPTIONS = [5, 10] as const;

export function defaultEdit(totalMs: number): GifEdit {
    return { trimStart: 0, trimEnd: totalMs, deleted: [] };
}

// Keeps a stored (or hand-made) edit within the recording.
export function normalizeEdit(raw: Partial<GifEdit> | null | undefined, totalMs: number): GifEdit {
    const start = clamp(Number(raw?.trimStart) || 0, 0, totalMs);
    const endRaw = raw?.trimEnd === undefined ? totalMs : Number(raw.trimEnd);
    const end = clamp(Number.isFinite(endRaw) ? endRaw : totalMs, start, totalMs);
    const deleted = Array.isArray(raw?.deleted) ? raw.deleted.filter((n) => Number.isInteger(n) && n >= 0) : [];
    return { trimStart: start, trimEnd: end, deleted: [...new Set(deleted)].sort((a, b) => a - b) };
}

export function frameDurations(times: number[], totalMs: number): number[] {
    return times.map((t, i) => Math.max(0, (i + 1 < times.length ? times[i + 1] : totalMs) - t));
}

// Index of the frame showing at time t (the last one starting at or before t).
export function frameAt(times: number[], t: number): number {
    let lo = 0;
    let hi = times.length - 1;
    if (hi < 0) return -1;
    if (t < times[0]) return 0;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (times[mid] <= t) lo = mid;
        else hi = mid - 1;
    }
    return lo;
}

// The frames of the GIF: trimmed, without deleted frames, pauses shortened,
// then sampled at `fps` (each output slot shows the frame visible at the
// slot's middle). Consecutive slots showing the same frame are merged into
// one longer frame, which GIF supports natively.
export function buildOutputFrames(times: number[], totalMs: number, edit: GifEdit, opts: OutputOptions): OutputFrame[] {
    const deleted = new Set(edit.deleted);
    const segments: OutputFrame[] = [];
    for (let i = 0; i < times.length; i++) {
        if (deleted.has(i)) continue;
        const next = i + 1 < times.length ? times[i + 1] : totalMs;
        const start = Math.max(times[i], edit.trimStart);
        const end = Math.min(next, edit.trimEnd);
        let duration = end - start;
        if (duration <= 0) continue;
        if (opts.maxPauseMs) duration = Math.min(duration, opts.maxPauseMs);
        segments.push({ index: i, duration });
    }
    if (segments.length === 0) return [];

    const total = segments.reduce((sum, s) => sum + s.duration, 0);
    const step = 1000 / opts.fps;
    const slots = Math.max(1, Math.round(total / step));
    const out: OutputFrame[] = [];
    let seg = 0;
    let segEnd = segments[0].duration;
    for (let k = 0; k < slots; k++) {
        const center = Math.min((k + 0.5) * step, total - 1e-6);
        while (center >= segEnd && seg < segments.length - 1) {
            seg++;
            segEnd += segments[seg].duration;
        }
        const index = segments[seg].index;
        const last = out[out.length - 1];
        if (last && last.index === index) last.duration += step;
        else out.push({ index, duration: step });
    }
    return out;
}

export function totalDuration(frames: OutputFrame[]): number {
    return frames.reduce((sum, f) => sum + f.duration, 0);
}

// 83400 → "1:23.4"
export function formatTime(ms: number, withTenths = true): string {
    const tenths = Math.max(0, Math.floor(ms / 100));
    const s = Math.floor(tenths / 10);
    const base = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    return withTenths ? `${base}.${tenths % 10}` : base;
}

function clamp(n: number, min: number, max: number) {
    return Math.min(max, Math.max(min, n));
}
