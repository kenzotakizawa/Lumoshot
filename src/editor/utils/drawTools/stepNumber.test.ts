import { describe, expect, it } from 'vitest';
import { lastStepInState } from './stepNumber';

describe('lastStepInState', () => {
    it('finds the highest step number in a snapshot', () => {
        const state = JSON.stringify({ canvasData: { objects: [{ isStepNumber: true, stepValue: 3 }, { type: 'Rect' }, { isStepNumber: true, stepValue: 12 }, { isStepNumber: true, stepValue: 4 }] } });
        expect(lastStepInState(state)).toBe(12);
    });

    it('returns 0 when there are no step numbers', () => {
        expect(lastStepInState(JSON.stringify({ canvasData: { objects: [{ type: 'Rect' }] } }))).toBe(0);
    });
});
