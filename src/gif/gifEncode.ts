import { quantize } from 'gifenc';
import { GifWriter, type GifRect } from './gifWriter';

// Turns rendered RGBA frames into a GIF. Pure (no DOM), so it runs in a worker
// and in tests.
//
// - One palette for the whole GIF, built from sample frames, so colors don't
//   flicker between frames. One slot is kept for transparency.
// - Every frame after the first only covers the rectangle that changed, and
//   pixels inside it that didn't change are transparent ("keep what's
//   there"). Screen recordings mostly stand still, so this keeps GIFs small.
//   "Changed" means the pixel maps to a different palette color: recorded
//   frames carry invisible compression noise that must not count.
// - A frame identical to the previous one only extends the previous delay.

export interface GifEncodeSettings {
    colors: number;
    dither: boolean;
    loop: boolean;
}

export interface GifPalette {
    // [r, g, b] entries; the last one is the transparent slot.
    colors: number[][];
    transparentIndex: number;
}

export const GIF_COLOR_OPTIONS = [32, 64, 128, 256] as const;

// Palette from a sample of pixels across `samples` (RGBA frames).
export function buildPalette(samples: Uint8ClampedArray[], colors: number, maxPixels = 1 << 20): GifPalette {
    const total = samples.reduce((n, s) => n + s.length / 4, 0);
    const stride = Math.max(1, Math.ceil(total / maxPixels));
    const picked = new Uint8Array(Math.ceil(total / stride) * 4 + 4);
    let n = 0;
    let skip = 0;
    for (const s of samples) {
        for (let i = 0; i < s.length; i += 4) {
            if (skip-- > 0) continue;
            skip = stride - 1;
            picked[n++] = s[i];
            picked[n++] = s[i + 1];
            picked[n++] = s[i + 2];
            picked[n++] = 255;
        }
    }
    const real = n > 0 ? quantize(picked.subarray(0, n), Math.max(2, colors - 1), { format: 'rgb565' }) : [[0, 0, 0]];
    const palette = real.map((c) => [c[0], c[1], c[2]]);
    return { colors: [...palette, [0, 0, 0]], transparentIndex: palette.length };
}

// Nearest palette color with a lookup table over 6-bit-per-channel buckets.
export class PaletteMapper {
    private lut = new Int16Array(1 << 18).fill(-1);
    private colors: number[][];
    private count: number;

    constructor(palette: GifPalette) {
        this.colors = palette.colors;
        this.count = palette.transparentIndex; // the real colors come first
    }

    nearest(r: number, g: number, b: number): number {
        const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
        const cached = this.lut[key];
        if (cached >= 0) return cached;
        // Bucket center, so the answer doesn't depend on which color came first.
        const cr = (r & ~3) | 2, cg = (g & ~3) | 2, cb = (b & ~3) | 2;
        let best = 0;
        let bestD = Infinity;
        for (let i = 0; i < this.count; i++) {
            const c = this.colors[i];
            const dr = cr - c[0], dg = cg - c[1], db = cb - c[2];
            const d = dr * dr * 2 + dg * dg * 4 + db * db * 3; // rough perceptual weights
            if (d < bestD) {
                bestD = d;
                best = i;
            }
        }
        this.lut[key] = best;
        return best;
    }

    color(index: number): number[] {
        return this.colors[index];
    }
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

// Nearest palette color of every pixel (no dithering): what a pixel "is",
// used to tell whether it changed.
export function nearestIndices(cur: Uint32Array, mapper: PaletteMapper): Uint8Array {
    const out = new Uint8Array(cur.length);
    for (let i = 0; i < cur.length; i++) {
        // Uint32 over RGBA bytes (little-endian): 0xAABBGGRR.
        const c = cur[i];
        out[i] = mapper.nearest(c & 0xff, (c >>> 8) & 0xff, (c >>> 16) & 0xff);
    }
    return out;
}

// Palette indices for `rect` of `cur` (`keys` = its nearestIndices). With
// `shown`, pixels whose key equals it become `transparentIndex`.
// Floyd–Steinberg error diffusion (optional) only flows between the pixels
// that are actually drawn.
export function indexRect(
    cur: Uint32Array,
    keys: Uint8Array,
    shown: Uint8Array | null,
    imageWidth: number,
    rect: GifRect,
    mapper: PaletteMapper,
    dither: boolean,
    transparentIndex: number,
): Uint8Array {
    const { x: rx, y: ry, width: w, height: h } = rect;
    const out = new Uint8Array(w * h);
    let errCur = dither ? new Float32Array((w + 2) * 3) : null;
    let errNext = dither ? new Float32Array((w + 2) * 3) : null;
    for (let y = 0; y < h; y++) {
        const row = (ry + y) * imageWidth + rx;
        for (let x = 0; x < w; x++) {
            const i = row + x;
            if (shown && keys[i] === shown[i]) {
                out[y * w + x] = transparentIndex;
                continue;
            }
            if (!errCur || !errNext) {
                out[y * w + x] = keys[i];
                continue;
            }
            const c = cur[i];
            const e = (x + 1) * 3;
            const r = clamp255((c & 0xff) + errCur[e]);
            const g = clamp255(((c >>> 8) & 0xff) + errCur[e + 1]);
            const b = clamp255(((c >>> 16) & 0xff) + errCur[e + 2]);
            const idx = mapper.nearest(r, g, b);
            out[y * w + x] = idx;
            const p = mapper.color(idx);
            const er = r - p[0], eg = g - p[1], eb = b - p[2];
            const right = (x + 2) * 3, below = (x + 1) * 3, belowLeft = x * 3, belowRight = (x + 2) * 3;
            errCur[right] += er * 7 / 16; errCur[right + 1] += eg * 7 / 16; errCur[right + 2] += eb * 7 / 16;
            errNext[belowLeft] += er * 3 / 16; errNext[belowLeft + 1] += eg * 3 / 16; errNext[belowLeft + 2] += eb * 3 / 16;
            errNext[below] += er * 5 / 16; errNext[below + 1] += eg * 5 / 16; errNext[below + 2] += eb * 5 / 16;
            errNext[belowRight] += er / 16; errNext[belowRight + 1] += eg / 16; errNext[belowRight + 2] += eb / 16;
        }
        if (errCur && errNext) {
            const t = errCur;
            errCur = errNext;
            errNext = t;
            errNext.fill(0);
        }
    }
    return out;
}

// Bounding box of the pixels that differ between two frames, or null.
export function changedRect(cur: ArrayLike<number>, prev: ArrayLike<number>, width: number, height: number): GifRect | null {
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
        const row = y * width;
        let x0 = -1;
        for (let x = 0; x < width; x++) {
            if (cur[row + x] !== prev[row + x]) {
                x0 = x;
                break;
            }
        }
        if (x0 < 0) continue;
        let x1 = x0;
        for (let x = width - 1; x > x0; x--) {
            if (cur[row + x] !== prev[row + x]) {
                x1 = x;
                break;
            }
        }
        if (x0 < minX) minX = x0;
        if (x1 > maxX) maxX = x1;
        if (minY === height) minY = y;
        maxY = y;
    }
    return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

const asPixels = (rgba: Uint8ClampedArray) => new Uint32Array(rgba.buffer, rgba.byteOffset, rgba.length >> 2);

interface PendingFrame {
    pixels: Uint8Array;
    rect: GifRect;
    transparent: boolean;
    delay: number;
}

export class GifFrameEncoder {
    readonly writer: GifWriter;
    private width: number;
    private height: number;
    private palette: GifPalette;
    private mapper: PaletteMapper;
    private dither: boolean;
    // What the GIF shows so far, as each pixel's nearest palette color.
    private shown: Uint8Array | null = null;
    private pending: PendingFrame | null = null;

    constructor(width: number, height: number, palette: GifPalette, settings: GifEncodeSettings) {
        this.width = width;
        this.height = height;
        this.palette = palette;
        this.mapper = new PaletteMapper(palette);
        this.dither = settings.dither;
        this.writer = new GifWriter(width, height, palette.colors, settings.loop);
    }

    // Start from `rgba` as if it had already been shown (used to measure a
    // single frame's cost when estimating the size).
    prime(rgba: Uint8ClampedArray): void {
        this.shown = nearestIndices(asPixels(rgba), this.mapper);
    }

    addFrame(rgba: Uint8ClampedArray, delay: number): void {
        if (rgba.length !== this.width * this.height * 4) throw new Error('Frame size mismatch');
        const cur = asPixels(rgba);
        const keys = nearestIndices(cur, this.mapper);
        if (!this.shown) {
            const rect = { x: 0, y: 0, width: this.width, height: this.height };
            const pixels = indexRect(cur, keys, null, this.width, rect, this.mapper, this.dither, this.palette.transparentIndex);
            this.pending = { pixels, rect, transparent: false, delay };
            this.shown = keys;
            return;
        }
        const rect = changedRect(keys, this.shown, this.width, this.height);
        if (!rect) {
            if (this.pending) this.pending.delay += delay;
            return;
        }
        this.flush();
        const pixels = indexRect(cur, keys, this.shown, this.width, rect, this.mapper, this.dither, this.palette.transparentIndex);
        this.pending = { pixels, rect, transparent: true, delay };
        for (let y = rect.y; y < rect.y + rect.height; y++) {
            const start = y * this.width + rect.x;
            this.shown.set(keys.subarray(start, start + rect.width), start);
        }
    }

    // Writes the frame waiting for its final delay.
    flush(): void {
        const p = this.pending;
        if (!p) return;
        this.writer.addFrame(p.pixels, p.rect, {
            delay: p.delay,
            transparentIndex: p.transparent ? this.palette.transparentIndex : undefined,
            disposal: 1,
        });
        this.pending = null;
    }

    finish(): Uint8Array<ArrayBuffer> {
        this.flush();
        return this.writer.finish();
    }
}

// Rough final size: the first frame in full, plus the average cost of a
// changed frame (measured on `pairs` of consecutive frames) for the rest.
export function estimateGifSize(
    width: number,
    height: number,
    palette: GifPalette,
    settings: GifEncodeSettings,
    first: Uint8ClampedArray,
    pairs: Array<[Uint8ClampedArray, Uint8ClampedArray]>,
    frameCount: number,
): number {
    const base = new GifFrameEncoder(width, height, palette, settings);
    const header = base.writer.byteLength;
    base.addFrame(first, 100);
    base.flush();
    const firstBytes = base.writer.byteLength - header;
    if (frameCount <= 1 || pairs.length === 0) return header + firstBytes + 1;
    let diffBytes = 0;
    for (const [prev, cur] of pairs) {
        const enc = new GifFrameEncoder(width, height, palette, settings);
        const start = enc.writer.byteLength;
        enc.prime(prev);
        enc.addFrame(cur, 100);
        enc.flush();
        diffBytes += enc.writer.byteLength - start;
    }
    return Math.round(header + firstBytes + (diffBytes / pairs.length) * (frameCount - 1) + 1);
}
