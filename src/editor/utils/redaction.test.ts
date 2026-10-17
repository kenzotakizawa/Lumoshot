import { describe, expect, it } from 'vitest';
import { pixelate } from './redaction';

// 4x2 image: left half black/white checker, right half solid red
const W = 4, H = 2;
const img = new Uint8ClampedArray([
    0, 0, 0, 255,   255, 255, 255, 255,   255, 0, 0, 255,   255, 0, 0, 255,
    255, 255, 255, 255,   0, 0, 0, 255,   255, 0, 0, 255,   255, 0, 0, 255,
]);
const px = (d: Uint8ClampedArray, x: number, y: number) => Array.from(d.slice((y * W + x) * 4, (y * W + x) * 4 + 4));

describe('pixelate', () => {
    it('replaces every pixel of a block with the block average', () => {
        const out = pixelate(img, W, H, 2);
        // checker block averages to mid gray, everywhere in the block
        for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) expect(px(out, x, y)).toEqual([128, 128, 128, 255]);
        // solid block is unchanged
        for (const [x, y] of [[2, 0], [3, 1]]) expect(px(out, x, y)).toEqual([255, 0, 0, 255]);
    });

    it('handles partial blocks at the right/bottom edges', () => {
        const out = pixelate(img, W, H, 3);
        // first block covers x 0..2, y 0..1: 2 black, 2 white, 2 red pixels
        expect(px(out, 0, 0)).toEqual([170, 85, 85, 255]);
        // the remaining 1px-wide column is its own (red) block
        expect(px(out, 3, 0)).toEqual([255, 0, 0, 255]);
    });

    it('does not modify the input and treats block < 1 as 1 (identity)', () => {
        const copy = img.slice();
        const out = pixelate(img, W, H, 0);
        expect(Array.from(out)).toEqual(Array.from(copy));
        expect(Array.from(img)).toEqual(Array.from(copy));
    });
});
