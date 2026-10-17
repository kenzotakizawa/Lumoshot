import { describe, expect, it } from 'vitest';
import {
    LumoshotFileError,
    assetsForProject,
    buildLumoshotFile,
    importedProjectName,
    isLumoshotFileName,
    parseLumoshotFile,
    safeFileBaseName,
} from './lumoshotFile';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const THUMB = 'data:image/jpeg;base64,/9j/AAAA';

const snapshot = (objects: unknown[]) => JSON.stringify({ formatVersion: 2, canvasData: { version: '7.1.0', objects }, dimensions: { width: 10, height: 10 } });
const fileWith = (state: string, assets: Record<string, string> = { bg1: PNG }, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ app: 'lumoshot', formatVersion: 1, savedAt: 1, projects: [{ name: ' 手順書 ', state, thumbnail: THUMB }], assets, ...extra });
const code = (fn: () => unknown) => {
    try {
        fn();
    } catch (e) {
        return e instanceof LumoshotFileError ? e.code : 'other';
    }
    return 'ok';
};

describe('parseLumoshotFile', () => {
    it('round-trips a file built by buildLumoshotFile', () => {
        const state = snapshot([{ type: 'Image', src: 'asset:bg1' }, { type: 'Rect', fill: '#000' }]);
        const text = buildLumoshotFile([{ name: '手順書', state, thumbnail: THUMB }], { bg1: PNG }, 123);
        const parsed = parseLumoshotFile(text);
        expect(parsed.projects).toEqual([{ name: '手順書', state, thumbnail: THUMB }]);
        expect(parsed.assets).toEqual({ bg1: PNG });
        expect(parsed.savedAt).toBe(123);
    });

    it('trims project names', () => {
        expect(parseLumoshotFile(fileWith(snapshot([{ type: 'Image', src: 'asset:bg1' }]))).projects[0].name).toBe('手順書');
    });

    it('accepts format-1 snapshots with inline images', () => {
        const state = JSON.stringify({ canvasData: { objects: [{ type: 'Image', src: PNG }] }, dimensions: { width: 1, height: 1 } });
        expect(code(() => parseLumoshotFile(fileWith(state, {})))).toBe('ok');
    });

    it('rejects broken or foreign files', () => {
        expect(code(() => parseLumoshotFile('{not json'))).toBe('not-json');
        expect(code(() => parseLumoshotFile(JSON.stringify({ app: 'other', projects: [] })))).toBe('not-lumoshot');
        expect(code(() => parseLumoshotFile(fileWith(snapshot([]), {}, { formatVersion: 2 })))).toBe('newer-version');
        expect(code(() => parseLumoshotFile(fileWith(snapshot([]), {}, { projects: [] })))).toBe('invalid');
        expect(code(() => parseLumoshotFile(fileWith('{"canvasData":{}}')))).toBe('invalid');
    });

    it('rejects images that would be fetched from the network', () => {
        const remote = snapshot([{ type: 'Image', src: 'https://example.com/a.png' }]);
        expect(code(() => parseLumoshotFile(fileWith(remote)))).toBe('invalid');
        const patternFill = snapshot([{ type: 'Rect', fill: { type: 'pattern', source: 'http://example.com/p.png' } }]);
        expect(code(() => parseLumoshotFile(fileWith(patternFill)))).toBe('invalid');
        const nested = snapshot([{ type: 'Group', objects: [{ type: 'Image', src: '//example.com/a.png' }] }]);
        expect(code(() => parseLumoshotFile(fileWith(nested)))).toBe('invalid');
        const bgImage = JSON.stringify({ canvasData: { objects: [], backgroundImage: { type: 'Image', src: 'blob:abc' } } });
        expect(code(() => parseLumoshotFile(fileWith(bgImage)))).toBe('invalid');
    });

    it('rejects SVG and non-image data URLs, in snapshots and in assets', () => {
        const svg = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
        expect(code(() => parseLumoshotFile(fileWith(snapshot([{ type: 'Image', src: svg }]))))).toBe('invalid');
        expect(code(() => parseLumoshotFile(fileWith(snapshot([{ type: 'Image', src: 'asset:bg1' }]), { bg1: svg })))).toBe('invalid');
        expect(code(() => parseLumoshotFile(fileWith(snapshot([{ type: 'Image', src: 'data:text/html;base64,PGgxPg==' }]))))).toBe('invalid');
    });

    it('rejects refs to images missing from assets', () => {
        expect(code(() => parseLumoshotFile(fileWith(snapshot([{ type: 'Image', src: 'asset:nope' }]))))).toBe('invalid');
    });

    it('allows URLs in ordinary text (only image sources are checked)', () => {
        const text = snapshot([{ type: 'Image', src: 'asset:bg1' }, { type: 'IText', text: 'see https://example.com' }]);
        expect(code(() => parseLumoshotFile(fileWith(text)))).toBe('ok');
    });
});

describe('helpers', () => {
    it('recognizes .lumoshot file names', () => {
        expect(isLumoshotFileName('手順書.lumoshot')).toBe(true);
        expect(isLumoshotFileName('A.LUMOSHOT')).toBe(true);
        expect(isLumoshotFileName('a.png')).toBe(false);
    });

    it('makes safe file base names', () => {
        expect(safeFileBaseName('ログイン/手順:1?')).toBe('ログイン_手順_1_');
        expect(safeFileBaseName('   ')).toBe('lumoshot');
    });

    it('names a single imported project after the file, several after their stored names', () => {
        const state = snapshot([{ type: 'Image', src: 'asset:bg1' }]);
        const one = parseLumoshotFile(fileWith(state));
        expect(importedProjectName(one, one.projects[0], 'ログイン手順.lumoshot')).toBe('ログイン手順');
        const two = parseLumoshotFile(JSON.stringify({ app: 'lumoshot', formatVersion: 1, projects: [{ name: 'A', state }, { name: 'B', state }], assets: { bg1: PNG } }));
        expect(two.projects.map((p) => importedProjectName(two, p, 'set.lumoshot'))).toEqual(['A', 'B']);
    });

    it('extracts only the assets a project uses', () => {
        const state = snapshot([{ type: 'Image', src: 'asset:bg1' }]);
        const file = parseLumoshotFile(fileWith(state, { bg1: PNG, unused: PNG }));
        expect(assetsForProject(file, file.projects[0])).toEqual({ bg1: PNG });
    });
});
