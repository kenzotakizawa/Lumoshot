import type { FrameCache } from './frameCache';
import { GifEncoderClient } from './gifEncoderClient';
import type { GifFrameRenderer } from './gifRenderer';
import type { GifSettings } from './gifSettings';
import type { OutputFrame } from './timeline';

// Drives a GIF export: renders each output frame off screen and streams the
// pixels to the encoder worker.

export class ExportCancelled extends Error {
    constructor() {
        super('Export cancelled');
    }
}

const PALETTE_SAMPLE_PIXELS = 1 << 20;
const MAX_PALETTE_SAMPLES = 24;

// Every n-th pixel, so many frames can feed the palette cheaply.
export function subsamplePixels(rgba: Uint8ClampedArray, maxPixels: number): Uint8ClampedArray {
    const pixels = rgba.length / 4;
    const stride = Math.max(1, Math.ceil(pixels / maxPixels));
    if (stride === 1) return rgba.slice();
    const out = new Uint8ClampedArray(Math.ceil(pixels / stride) * 4);
    let n = 0;
    for (let p = 0; p < pixels; p += stride) {
        const i = p * 4;
        out[n++] = rgba[i];
        out[n++] = rgba[i + 1];
        out[n++] = rgba[i + 2];
        out[n++] = 255;
    }
    return out.subarray(0, n);
}

// Output positions whose pictures decide the palette: evenly spread, plus the
// first frame where each annotation appears (its colors must be included).
export function paletteSamplePositions(output: OutputFrame[], annotationStarts: number[], max = MAX_PALETTE_SAMPLES): number[] {
    const n = output.length;
    if (n === 0) return [];
    const picks = new Set<number>([0]);
    for (const start of annotationStarts) {
        const pos = output.findIndex((f) => f.index >= start);
        if (pos >= 0) picks.add(pos);
    }
    const even = Math.max(1, max - picks.size);
    for (let k = 0; k < even; k++) picks.add(Math.min(n - 1, Math.round((k * (n - 1)) / Math.max(1, even - 1))));
    return [...picks].sort((a, b) => a - b).slice(0, max);
}

interface ExportArgs {
    renderer: GifFrameRenderer;
    frames: FrameCache;
    output: OutputFrame[];
    settings: GifSettings;
    annotationStarts: number[];
    onProgress?: (done: number, total: number) => void;
    signal?: AbortSignal;
}

export async function exportGif({ renderer, frames, output, settings, annotationStarts, onProgress, signal }: ExportArgs): Promise<Blob> {
    if (output.length === 0) throw new Error('Nothing to export');
    const client = new GifEncoderClient();
    const check = () => {
        if (signal?.aborted) throw new ExportCancelled();
    };
    const renderAt = async (pos: number) => {
        const f = output[pos];
        const bitmap = await frames.get(f.index);
        return renderer.render(bitmap, f.index, settings.scale);
    };
    try {
        const { width, height } = renderer.outputSize(settings.scale);
        const positions = paletteSamplePositions(output, annotationStarts);
        const perSample = Math.floor(PALETTE_SAMPLE_PIXELS / positions.length);
        const samples: Uint8ClampedArray[] = [];
        for (const pos of positions) {
            check();
            samples.push(subsamplePixels((await renderAt(pos)).data, perSample));
        }
        await client.start(width, height, { colors: settings.colors, dither: settings.dither, loop: settings.loop }, samples);

        // Keep at most two frames in flight: render the next while the worker
        // encodes the previous one.
        const inflight: Promise<unknown>[] = [];
        for (let pos = 0; pos < output.length; pos++) {
            check();
            frames.prefetch(output.slice(pos + 1, pos + 4).map((f) => f.index));
            const image = await renderAt(pos);
            inflight.push(client.addFrame(image.data, output[pos].duration));
            if (inflight.length >= 2) await inflight.shift();
            onProgress?.(pos + 1, output.length);
        }
        await Promise.all(inflight);
        check();
        const bytes = await client.finish();
        return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/gif' });
    } finally {
        client.terminate();
    }
}

// Size estimate from a few rendered frames (see estimateGifSize).
export async function estimateGifBytes({ renderer, frames, output, settings, signal }: Omit<ExportArgs, 'onProgress' | 'annotationStarts'>): Promise<number> {
    if (output.length === 0) return 0;
    const client = new GifEncoderClient();
    const renderAt = async (pos: number) => {
        if (signal?.aborted) throw new ExportCancelled();
        const f = output[pos];
        return renderer.render(await frames.get(f.index), f.index, settings.scale).data;
    };
    try {
        const { width, height } = renderer.outputSize(settings.scale);
        const first = await renderAt(0);
        const pairs: Array<[Uint8ClampedArray, Uint8ClampedArray]> = [];
        const n = output.length;
        const count = Math.min(4, n - 1);
        for (let k = 1; k <= count; k++) {
            const pos = Math.max(1, Math.round((k * (n - 1)) / count));
            pairs.push([await renderAt(pos - 1), await renderAt(pos)]);
        }
        return await client.estimate(width, height, { colors: settings.colors, dither: settings.dither, loop: settings.loop }, first, pairs, n);
    } finally {
        client.terminate();
    }
}

// lumoshot_20261017-104512.gif
export function gifFileName(date: Date = new Date()): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `lumoshot_${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}.gif`;
}
