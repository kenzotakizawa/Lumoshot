import { describe, expect, it } from 'vitest';
import { assetRefsInState, hashString, resolveAssetRefs } from './snapshotAssets';

describe('hashString', () => {
    it('is deterministic and sensitive to content and length', () => {
        const a = 'data:image/png;base64,' + 'A'.repeat(5000);
        expect(hashString(a)).toBe(hashString(a.slice()));
        expect(hashString(a)).not.toBe(hashString(a + 'A'));
        expect(hashString(a)).not.toBe(hashString(a.replace(/A$/, 'B')));
        expect(hashString(a)).toMatch(/^[0-9a-z]+$/);
    });
});

describe('resolveAssetRefs', () => {
    const make = () => ({
        objects: [
            { type: 'Image', src: 'asset:bg1' },
            { type: 'Rect' },
            { type: 'Group', objects: [{ type: 'Image', src: 'data:image/png;base64,small' }, { type: 'Image', src: 'asset:stamp' }] },
        ],
    });

    it('inlines known assets and reports per-image hashes in traversal order', () => {
        const data = make();
        const store: Record<string, string> = { bg1: 'data:BG', stamp: 'data:STAMP' };
        const { hashes, missing } = resolveAssetRefs(data, (h) => store[h]);
        expect(data.objects[0].src).toBe('data:BG');
        expect((data.objects[2] as any).objects[1].src).toBe('data:STAMP');
        expect((data.objects[2] as any).objects[0].src).toBe('data:image/png;base64,small');
        expect(hashes).toEqual(['bg1', null, 'stamp']);
        expect(missing).toEqual([]);
    });

    it('leaves unknown refs in place and reports them as missing', () => {
        const data = make();
        const { missing } = resolveAssetRefs(data, (h) => (h === 'bg1' ? 'data:BG' : undefined));
        expect(missing).toEqual(['stamp']);
        expect((data.objects[2] as any).objects[1].src).toBe('asset:stamp');
    });

    it('passes format-1 snapshots (inline data URLs) through untouched', () => {
        const data = { objects: [{ type: 'Image', src: 'data:image/png;base64,AAAA' }] };
        const { hashes, missing } = resolveAssetRefs(data, () => undefined);
        expect(data.objects[0].src).toBe('data:image/png;base64,AAAA');
        expect(hashes).toEqual([null]);
        expect(missing).toEqual([]);
    });
});

describe('assetRefsInState', () => {
    it('lists distinct refs from a serialized snapshot', () => {
        const state = JSON.stringify({ canvasData: { objects: [{ src: 'asset:aa1' }, { src: 'asset:bb2' }, { src: 'asset:aa1' }, { src: 'data:x' }] } });
        expect(assetRefsInState(state).sort()).toEqual(['aa1', 'bb2']);
    });
});
