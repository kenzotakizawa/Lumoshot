import createStream from 'gifenc/src/stream.js';
import lzwEncode from 'gifenc/src/lzwEncode.js';

// Minimal GIF89a writer: one global palette, frames that cover only part of
// the image (x/y offsets), 1-bit transparency and disposal. gifenc's own
// writer can't place a frame at an offset, which is what keeps screen
// recordings small (usually only a small area changes between frames), so
// only its LZW compressor and byte stream are used here.

export interface GifRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface GifFrameOptions {
    // Display time in ms (stored in 1/100 s).
    delay: number;
    // Palette index treated as "keep what's there" in this frame.
    transparentIndex?: number;
    // 0 = unspecified, 1 = leave in place, 2 = clear to background.
    disposal?: 0 | 1 | 2;
}

const HSIZE = 5003;

// Bits needed to index a palette of `length` colors (at least 1).
export function paletteBits(length: number): number {
    return Math.max(1, Math.ceil(Math.log2(Math.max(2, length))));
}

export class GifWriter {
    private stream = createStream(1 << 16);
    private bits: number;
    private accum = new Uint8Array(256);
    private htab = new Int32Array(HSIZE);
    private codetab = new Int32Array(HSIZE);
    readonly width: number;
    readonly height: number;

    // `palette`: [r, g, b] entries, at most 256. `loop`: repeat forever
    // (otherwise the GIF plays once).
    constructor(width: number, height: number, palette: number[][], loop: boolean) {
        if (palette.length === 0 || palette.length > 256) throw new Error('GIF palette must have 1-256 colors');
        this.width = width;
        this.height = height;
        this.bits = paletteBits(palette.length);

        this.writeString('GIF89a');
        // Logical screen descriptor with a global color table.
        this.writeUint16(width);
        this.writeUint16(height);
        this.stream.writeByte(0x80 | ((this.bits - 1) << 4) | (this.bits - 1));
        this.stream.writeByte(0); // background color index
        this.stream.writeByte(0); // pixel aspect ratio
        const tableSize = 1 << this.bits;
        for (let i = 0; i < tableSize; i++) {
            const c = palette[i] ?? [0, 0, 0];
            this.stream.writeByte(c[0]);
            this.stream.writeByte(c[1]);
            this.stream.writeByte(c[2]);
        }
        if (loop) {
            // NETSCAPE2.0 application extension: loop count 0 = forever.
            this.stream.writeByte(0x21);
            this.stream.writeByte(0xff);
            this.stream.writeByte(11);
            this.writeString('NETSCAPE2.0');
            this.stream.writeByte(3);
            this.stream.writeByte(1);
            this.writeUint16(0);
            this.stream.writeByte(0);
        }
    }

    // `pixels`: palette indices for `rect`, row by row.
    addFrame(pixels: Uint8Array, rect: GifRect, opts: GifFrameOptions): void {
        if (pixels.length !== rect.width * rect.height) throw new Error('GIF frame size mismatch');
        const transparent = opts.transparentIndex !== undefined;
        // Graphic control extension.
        this.stream.writeByte(0x21);
        this.stream.writeByte(0xf9);
        this.stream.writeByte(4);
        this.stream.writeByte(((opts.disposal ?? 0) << 2) | (transparent ? 1 : 0));
        this.writeUint16(Math.max(0, Math.round(opts.delay / 10)));
        this.stream.writeByte(transparent ? opts.transparentIndex! : 0);
        this.stream.writeByte(0);
        // Image descriptor (no local color table).
        this.stream.writeByte(0x2c);
        this.writeUint16(rect.x);
        this.writeUint16(rect.y);
        this.writeUint16(rect.width);
        this.writeUint16(rect.height);
        this.stream.writeByte(0);
        lzwEncode(rect.width, rect.height, pixels, this.bits, this.stream, this.accum, this.htab, this.codetab);
    }

    get byteLength(): number {
        return this.stream.bytesView().length;
    }

    finish(): Uint8Array<ArrayBuffer> {
        this.stream.writeByte(0x3b);
        return this.stream.bytes() as Uint8Array<ArrayBuffer>;
    }

    private writeUint16(n: number) {
        this.stream.writeByte(n & 0xff);
        this.stream.writeByte((n >> 8) & 0xff);
    }

    private writeString(s: string) {
        for (let i = 0; i < s.length; i++) this.stream.writeByte(s.charCodeAt(i));
    }
}
