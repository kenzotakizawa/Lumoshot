// gifenc ships no type definitions; only the parts Lumoshot uses are declared.

declare module 'gifenc' {
    export function quantize(
        rgba: Uint8Array | Uint8ClampedArray,
        maxColors: number,
        options?: { format?: 'rgb565' | 'rgb444' | 'rgba4444' },
    ): number[][];
}

declare module 'gifenc/src/stream.js' {
    export interface GifencStream {
        readonly buffer: ArrayBuffer;
        reset(): void;
        bytesView(): Uint8Array;
        bytes(): Uint8Array;
        writeByte(byte: number): void;
        writeBytes(data: ArrayLike<number>, offset?: number, byteLength?: number): void;
        writeBytesView(data: Uint8Array, offset?: number, byteLength?: number): void;
    }
    export default function createStream(initialCapacity?: number): GifencStream;
}

declare module 'gifenc/src/lzwEncode.js' {
    import type { GifencStream } from 'gifenc/src/stream.js';
    export default function lzwEncode(
        width: number,
        height: number,
        pixels: Uint8Array,
        colorDepth: number,
        outStream?: GifencStream,
        accum?: Uint8Array,
        htab?: Int32Array,
        codetab?: Int32Array,
    ): Uint8Array;
}
