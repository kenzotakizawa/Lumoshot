import { describe, expect, it } from 'vitest';
import { buildOutputFrames, defaultEdit, formatTime, frameAt, frameDurations, normalizeEdit, totalDuration } from './timeline';

// Frames start at 0, 100, 300 and 1300 ms; the recording lasts 2000 ms.
const times = [0, 100, 300, 1300];
const TOTAL = 2000;

describe('frameDurations / frameAt', () => {
    it('derives durations from start times', () => {
        expect(frameDurations(times, TOTAL)).toEqual([100, 200, 1000, 700]);
    });

    it('finds the frame showing at a time', () => {
        expect(frameAt(times, 0)).toBe(0);
        expect(frameAt(times, 99)).toBe(0);
        expect(frameAt(times, 100)).toBe(1);
        expect(frameAt(times, 1299)).toBe(2);
        expect(frameAt(times, 5000)).toBe(3);
        expect(frameAt([], 10)).toBe(-1);
    });
});

describe('buildOutputFrames', () => {
    it('keeps the source timing at 10 fps', () => {
        const out = buildOutputFrames(times, TOTAL, defaultEdit(TOTAL), { fps: 10 });
        expect(out).toEqual([
            { index: 0, duration: 100 },
            { index: 1, duration: 200 },
            { index: 2, duration: 1000 },
            { index: 3, duration: 700 },
        ]);
        expect(totalDuration(out)).toBe(TOTAL);
    });

    it('samples at 5 fps (a 100 ms frame can be skipped)', () => {
        const out = buildOutputFrames(times, TOTAL, defaultEdit(TOTAL), { fps: 5 });
        // Slot centers: 100, 300, 500, … → frame 0 (0–100) is never sampled.
        expect(out[0]).toEqual({ index: 1, duration: 200 });
        expect(totalDuration(out)).toBe(TOTAL);
        expect(out.every((f) => f.duration % 200 === 0)).toBe(true);
    });

    it('applies trimming and deleted frames', () => {
        const out = buildOutputFrames(times, TOTAL, { trimStart: 200, trimEnd: 1500, deleted: [2] }, { fps: 10 });
        expect(out).toEqual([
            { index: 1, duration: 100 },
            { index: 3, duration: 200 },
        ]);
    });

    it('shortens long still moments', () => {
        const out = buildOutputFrames(times, TOTAL, defaultEdit(TOTAL), { fps: 10, maxPauseMs: 500 });
        expect(out.map((f) => f.duration)).toEqual([100, 200, 500, 500]);
    });

    it('returns nothing when everything is cut', () => {
        expect(buildOutputFrames(times, TOTAL, { trimStart: 500, trimEnd: 500, deleted: [] }, { fps: 10 })).toEqual([]);
    });
});

describe('normalizeEdit', () => {
    it('clamps stored edits to the recording', () => {
        expect(normalizeEdit({ trimStart: -5, trimEnd: 99999, deleted: [3, 1, 3, -1] }, TOTAL)).toEqual({ trimStart: 0, trimEnd: TOTAL, deleted: [1, 3] });
        expect(normalizeEdit(null, TOTAL)).toEqual(defaultEdit(TOTAL));
        expect(normalizeEdit({ trimStart: 1500, trimEnd: 1000 }, TOTAL)).toEqual({ trimStart: 1500, trimEnd: 1500, deleted: [] });
    });
});

describe('formatTime', () => {
    it('formats minutes, seconds and tenths', () => {
        expect(formatTime(0)).toBe('0:00.0');
        expect(formatTime(83456)).toBe('1:23.4');
        expect(formatTime(300000, false)).toBe('5:00');
    });
});
