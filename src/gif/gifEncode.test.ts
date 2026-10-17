import { describe, expect, it } from 'vitest';
import { buildPalette, changedRect, estimateGifSize, GifFrameEncoder } from './gifEncode';
import { GifWriter } from './gifWriter';

// ─── A small GIF decoder, enough to check what the encoder wrote ───

interface DecodedFrame {
    x: number;
    y: number;
    width: number;
    height: number;
    delay: number;
    disposal: number;
    transparentIndex: number | null;
    pixels: Uint8Array;
}

function lzwDecode(minCodeSize: number, data: Uint8Array, pixelCount: number): Uint8Array {
    const clear = 1 << minCodeSize;
    const eoi = clear + 1;
    let codeSize = minCodeSize + 1;
    let dict: number[][] = [];
    let next = eoi + 1;
    const reset = () => {
        dict = [];
        for (let i = 0; i < clear; i++) dict[i] = [i];
        next = eoi + 1;
        codeSize = minCodeSize + 1;
    };
    reset();
    const out: number[] = [];
    let bitPos = 0;
    let prev: number[] | null = null;
    while (bitPos + codeSize <= data.length * 8) {
        let code = 0;
        for (let i = 0; i < codeSize; i++, bitPos++) code |= ((data[bitPos >> 3] >> (bitPos & 7)) & 1) << i;
        if (code === clear) {
            reset();
            prev = null;
            continue;
        }
        if (code === eoi) break;
        let entry: number[];
        if (dict[code]) entry = dict[code];
        else if (code === next && prev) entry = [...prev, prev[0]];
        else throw new Error(`bad LZW code ${code}`);
        out.push(...entry);
        if (prev && next < 4096) {
            dict[next++] = [...prev, entry[0]];
            if (next === 1 << codeSize && codeSize < 12) codeSize++;
        }
        prev = entry;
    }
    expect(out.length).toBe(pixelCount);
    return Uint8Array.from(out);
}

function decodeGif(bytes: Uint8Array) {
    let p = 0;
    const u8 = () => bytes[p++];
    const u16 = () => bytes[p++] | (bytes[p++] << 8);
    const header = String.fromCharCode(...bytes.subarray(0, 6));
    p = 6;
    const width = u16();
    const height = u16();
    const packed = u8();
    p += 2;
    const palette: number[][] = [];
    if (packed & 0x80) {
        const size = 1 << ((packed & 7) + 1);
        for (let i = 0; i < size; i++) palette.push([u8(), u8(), u8()]);
    }
    const frames: DecodedFrame[] = [];
    let loop: number | null = null;
    let gce = { delay: 0, disposal: 0, transparentIndex: null as number | null };
    const readSubBlocks = () => {
        const chunks: number[] = [];
        for (let len = u8(); len > 0; len = u8()) {
            for (let i = 0; i < len; i++) chunks.push(u8());
        }
        return Uint8Array.from(chunks);
    };
    for (;;) {
        const block = u8();
        if (block === 0x3b) break;
        if (block === 0x21) {
            const label = u8();
            if (label === 0xf9) {
                u8();
                const f = u8();
                const delay = u16() * 10;
                const ti = u8();
                u8();
                gce = { delay, disposal: (f >> 2) & 7, transparentIndex: f & 1 ? ti : null };
            } else if (label === 0xff) {
                const data = readSubBlocks();
                const id = String.fromCharCode(...data.subarray(0, 11));
                // Sub-blocks joined: "NETSCAPE2.0", then [1, count lo, count hi].
                if (id === 'NETSCAPE2.0') loop = data[12] | (data[13] << 8);
            } else {
                readSubBlocks();
            }
        } else if (block === 0x2c) {
            const x = u16(), y = u16(), w = u16(), h = u16();
            const fp = u8();
            expect(fp & 0x80).toBe(0); // no local color table
            const minCode = u8();
            const data = readSubBlocks();
            frames.push({ x, y, width: w, height: h, ...gce, pixels: lzwDecode(minCode, data, w * h) });
            gce = { delay: 0, disposal: 0, transparentIndex: null };
        } else {
            throw new Error(`unexpected block 0x${block.toString(16)} at ${p - 1}`);
        }
    }
    return { header, width, height, palette, frames, loop };
}

// Composite every frame (disposal 1 = leave in place) and return RGB per pixel.
function composite(gif: ReturnType<typeof decodeGif>) {
    const screen = new Array<number[]>(gif.width * gif.height).fill([0, 0, 0]);
    const states: number[][][] = [];
    for (const f of gif.frames) {
        for (let y = 0; y < f.height; y++) {
            for (let x = 0; x < f.width; x++) {
                const idx = f.pixels[y * f.width + x];
                if (idx === f.transparentIndex) continue;
                screen[(f.y + y) * gif.width + f.x + x] = gif.palette[idx];
            }
        }
        states.push(screen.slice());
    }
    return states;
}

// ─── Helpers to make frames ───

const RED = [220, 30, 30], BLUE = [30, 60, 220], WHITE = [255, 255, 255], BLACK = [10, 10, 10];

function frame(width: number, height: number, paint: (x: number, y: number) => number[]) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const [r, g, b] = paint(x, y);
            const i = (y * width + x) * 4;
            data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
        }
    }
    return data;
}

const pixelsOf = (data: Uint8ClampedArray) => {
    const out: number[][] = [];
    for (let i = 0; i < data.length; i += 4) out.push([data[i], data[i + 1], data[i + 2]]);
    return out;
};

describe('GifWriter', () => {
    it('writes a valid single-frame GIF with an optional loop', () => {
        const w = new GifWriter(2, 2, [[0, 0, 0], [255, 255, 255]], true);
        w.addFrame(Uint8Array.from([0, 1, 1, 0]), { x: 0, y: 0, width: 2, height: 2 }, { delay: 150 });
        const gif = decodeGif(w.finish());
        expect(gif.header).toBe('GIF89a');
        expect(gif.loop).toBe(0);
        expect(gif.frames).toHaveLength(1);
        expect(gif.frames[0].delay).toBe(150);
        expect([...gif.frames[0].pixels]).toEqual([0, 1, 1, 0]);

        const once = new GifWriter(1, 1, [[0, 0, 0]], false);
        once.addFrame(Uint8Array.from([0]), { x: 0, y: 0, width: 1, height: 1 }, { delay: 100 });
        expect(decodeGif(once.finish()).loop).toBeNull();
    });

    it('round-trips a large frame through LZW (code table resets)', () => {
        const width = 300, height = 200;
        const palette = Array.from({ length: 256 }, (_, i) => [i, i, i]);
        const pixels = new Uint8Array(width * height);
        let seed = 7;
        for (let i = 0; i < pixels.length; i++) {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            pixels[i] = seed % 256;
        }
        const w = new GifWriter(width, height, palette, true);
        w.addFrame(pixels, { x: 0, y: 0, width, height }, { delay: 100 });
        expect(decodeGif(w.finish()).frames[0].pixels).toEqual(pixels);
    });
});

describe('changedRect', () => {
    it('finds the bounding box of changed pixels', () => {
        const a = new Uint32Array(6 * 4);
        const b = a.slice();
        expect(changedRect(b, a, 6, 4)).toBeNull();
        b[1 * 6 + 2] = 5;
        b[2 * 6 + 4] = 9;
        expect(changedRect(b, a, 6, 4)).toEqual({ x: 2, y: 1, width: 3, height: 2 });
    });
});

describe('GifFrameEncoder', () => {
    const W = 8, H = 6;
    const f1 = frame(W, H, (x) => (x < 4 ? RED : WHITE));
    const f2 = frame(W, H, (x, y) => (x === 6 && y === 2 ? BLUE : x < 4 ? RED : WHITE));
    const f3 = frame(W, H, (x, y) => (y === 5 ? BLACK : x === 6 && y === 2 ? BLUE : x < 4 ? RED : WHITE));

    it('reproduces every frame exactly, writing only what changed', () => {
        const palette = buildPalette([f1, f2, f3], 32);
        const enc = new GifFrameEncoder(W, H, palette, { colors: 32, dither: false, loop: true });
        enc.addFrame(f1, 100);
        enc.addFrame(f2, 100);
        enc.addFrame(f3, 200);
        const gif = decodeGif(enc.finish());
        expect(gif.width).toBe(W);
        expect(gif.frames.map((f) => [f.x, f.y, f.width, f.height])).toEqual([[0, 0, W, H], [6, 2, 1, 1], [0, 5, W, 1]]);
        expect(gif.frames.map((f) => f.delay)).toEqual([100, 100, 200]);
        expect(gif.frames[1].transparentIndex).toBe(palette.transparentIndex);
        const states = composite(gif);
        expect(states[0]).toEqual(pixelsOf(f1));
        expect(states[1]).toEqual(pixelsOf(f2));
        expect(states[2]).toEqual(pixelsOf(f3));
    });

    it('merges an unchanged frame into the previous delay', () => {
        const palette = buildPalette([f1, f2], 32);
        const enc = new GifFrameEncoder(W, H, palette, { colors: 32, dither: true, loop: false });
        enc.addFrame(f1, 100);
        enc.addFrame(f1.slice(), 300);
        enc.addFrame(f2, 100);
        const gif = decodeGif(enc.finish());
        expect(gif.frames.map((f) => f.delay)).toEqual([400, 100]);
        // Few colors: dithering has nothing to diffuse, colors stay exact.
        expect(composite(gif)[1]).toEqual(pixelsOf(f2));
    });

    it('ignores invisible noise (same palette color) when finding changes', () => {
        const palette = buildPalette([f1, f2], 32);
        const enc = new GifFrameEncoder(W, H, palette, { colors: 32, dither: false, loop: true });
        enc.addFrame(f1, 100);
        // f2 plus ±1 noise on every pixel, like a recompressed recording frame.
        const noisy = f2.slice();
        for (let i = 0; i < noisy.length; i += 4) noisy[i] = Math.max(0, Math.min(255, noisy[i] + ((i / 4) % 2 ? 1 : -1)));
        enc.addFrame(noisy, 100);
        const gif = decodeGif(enc.finish());
        expect(gif.frames.map((f) => [f.x, f.y, f.width, f.height])).toEqual([[0, 0, W, H], [6, 2, 1, 1]]);
    });

    it('keeps the transparent slot out of the real colors', () => {
        const palette = buildPalette([f3], 32);
        expect(palette.transparentIndex).toBe(palette.colors.length - 1);
        expect(palette.colors.length).toBeLessThanOrEqual(32);
    });

    it('estimates the size from sample frames', () => {
        const palette = buildPalette([f1, f2], 32);
        const settings = { colors: 32, dither: false, loop: true };
        const est = estimateGifSize(W, H, palette, settings, f1, [[f1, f2]], 10);
        const enc = new GifFrameEncoder(W, H, palette, settings);
        enc.addFrame(f1, 100);
        const one = enc.finish().length;
        expect(est).toBeGreaterThan(one);
        expect(est).toBeLessThan(one * 10);
    });
});
