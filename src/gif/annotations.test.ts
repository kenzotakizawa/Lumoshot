import { describe, expect, it } from 'vitest';
import { FRAME_PLACEHOLDER, isVisibleAt, restoreFrameInState, stripFrameFromState } from './annotations';

describe('frame ranges', () => {
    it('limits annotations to their frames', () => {
        expect(isVisibleAt({}, 5)).toBe(true);
        expect(isVisibleAt({ from: 3 }, 2)).toBe(false);
        expect(isVisibleAt({ from: 3, to: 6 }, 6)).toBe(true);
        expect(isVisibleAt({ to: 6 }, 7)).toBe(false);
    });
});

describe('stored annotations', () => {
    const state = JSON.stringify({
        formatVersion: 2,
        dimensions: { width: 10, height: 10 },
        canvasData: {
            objects: [
                { type: 'Image', isBackground: true, src: 'asset:frame1' },
                { type: 'Image', isBackground: true, src: 'asset:frame1' },
                { type: 'Rect', gifFrom: 2 },
                { type: 'Image', src: 'asset:stamp' },
            ],
        },
    });

    it('drops the frame image (and stray copies) but keeps other images', () => {
        const out = stripFrameFromState(state, { frame1: 'data:frame', stamp: 'data:stamp' });
        const objects = JSON.parse(out.state).canvasData.objects;
        expect(objects).toHaveLength(3);
        expect(objects[0].src).toBe(FRAME_PLACEHOLDER);
        expect(objects[1].gifFrom).toBe(2);
        expect(out.assets).toEqual({ stamp: 'data:stamp' });
    });

    it('puts the first frame back when reopening', () => {
        const stored = stripFrameFromState(state, {}).state;
        const objects = JSON.parse(restoreFrameInState(stored, 'data:image/webp;base64,AAAA')).canvasData.objects;
        expect(objects[0].src).toBe('data:image/webp;base64,AAAA');
    });
});
