import { describe, expect, it } from 'vitest';
import { MAX_DEVICE_HEIGHT, planCapture, planStitch, stripPhase } from './fullPagePlan';

describe('planCapture', () => {
    it('visits one position per viewport, aligning the last strip to the bottom', () => {
        const p = planCapture(2500, 800, 2, 2880);
        expect(p.captureHeight).toBe(2500);
        expect(p.truncated).toBe(false);
        expect(p.scrollPositions).toEqual([0, 800, 1600, 1700]);
    });

    it('handles exact multiples without a duplicate last strip', () => {
        expect(planCapture(2400, 800, 1, 1440).scrollPositions).toEqual([0, 800, 1600]);
    });

    it('takes a single strip when the page fits the viewport', () => {
        const p = planCapture(600, 800, 2, 2880);
        expect(p.scrollPositions).toEqual([0]);
        expect(p.captureHeight).toBe(800);
    });

    it('truncates very long pages to the device-height limit', () => {
        const p = planCapture(100000, 800, 2, 1000);
        expect(p.truncated).toBe(true);
        expect(p.captureHeight * 2).toBeLessThanOrEqual(MAX_DEVICE_HEIGHT);
        expect(p.scrollPositions.at(-1)! + 800).toBe(p.captureHeight);
    });

    it('also truncates wide captures by total pixel count', () => {
        const p = planCapture(30000, 900, 2, 5120);
        expect(p.truncated).toBe(true);
        expect(p.captureHeight * 2 * 5120).toBeLessThanOrEqual(64 * 1024 * 1024);
    });
});

describe('planStitch', () => {
    it('draws every row exactly once, trimming the last strip overlap', () => {
        const ops = planStitch([0, 800, 1600, 1700], 800, 2500);
        expect(ops).toEqual([
            { strip: 0, srcY: 0, dstY: 0, height: 800 },
            { strip: 1, srcY: 0, dstY: 800, height: 800 },
            { strip: 2, srcY: 0, dstY: 1600, height: 800 },
            { strip: 3, srcY: 700, dstY: 2400, height: 100 },
        ]);
        expect(ops.reduce((n, op) => n + op.height, 0)).toBe(2500);
    });

    it('copes with pages that clamp or round the scroll position', () => {
        // asked for 800 / 1600 but the page stopped at 790 / 1580
        const ops = planStitch([0, 790, 1580], 800, 2380);
        expect(ops).toEqual([
            { strip: 0, srcY: 0, dstY: 0, height: 800 },
            { strip: 1, srcY: 10, dstY: 800, height: 790 },
            { strip: 2, srcY: 10, dstY: 1590, height: 790 },
        ]);
        expect(ops.reduce((n, op) => n + op.height, 0)).toBe(2380);
    });

    it('skips strips that add nothing new', () => {
        expect(planStitch([0, 0], 800, 800)).toEqual([{ strip: 0, srcY: 0, dstY: 0, height: 800 }]);
    });
});

describe('stripPhase', () => {
    it('labels strips so fixed headers/footers appear once', () => {
        expect([0].map((i) => stripPhase(i, 1))).toEqual(['only']);
        expect([0, 1, 2, 3].map((i) => stripPhase(i, 4))).toEqual(['first', 'middle', 'middle', 'last']);
        expect([0, 1].map((i) => stripPhase(i, 2))).toEqual(['first', 'last']);
    });
});
