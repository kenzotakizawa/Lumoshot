import { describe, expect, it } from 'vitest';
import {
    DEFAULT_EXPORT_OPTIONS,
    buildExportFileName,
    exportPixelSize,
    normalizeExportOptions,
} from './exportImage';

describe('normalizeExportOptions', () => {
    it('returns defaults for missing or malformed input', () => {
        expect(normalizeExportOptions(null)).toEqual(DEFAULT_EXPORT_OPTIONS);
        expect(normalizeExportOptions('png')).toEqual(DEFAULT_EXPORT_OPTIONS);
        expect(normalizeExportOptions({ format: 'gif', quality: 'high', scale: 3 })).toEqual(DEFAULT_EXPORT_OPTIONS);
    });

    it('keeps valid fields and fixes invalid ones independently', () => {
        expect(normalizeExportOptions({ format: 'webp', quality: 0.7, scale: 0.5 })).toEqual({ format: 'webp', quality: 0.7, scale: 0.5 });
        expect(normalizeExportOptions({ format: 'jpeg', scale: 4 })).toEqual({ format: 'jpeg', quality: 0.9, scale: 1 });
    });

    it('clamps quality into 0.5..1', () => {
        expect(normalizeExportOptions({ quality: 0.1 }).quality).toBe(0.5);
        expect(normalizeExportOptions({ quality: 5 }).quality).toBe(1);
        expect(normalizeExportOptions({ quality: Number.NaN }).quality).toBe(0.9);
    });
});

describe('buildExportFileName', () => {
    const date = new Date(2026, 9, 7, 9, 5, 3); // 2026-10-07 09:05:03 local

    it('uses a zero-padded timestamp and the format extension', () => {
        expect(buildExportFileName('png', date)).toBe('lumoshot_20261007-090503.png');
        expect(buildExportFileName('jpeg', date)).toBe('lumoshot_20261007-090503.jpg');
        expect(buildExportFileName('webp', date)).toBe('lumoshot_20261007-090503.webp');
    });
});

describe('exportPixelSize', () => {
    it('scales and rounds the original size', () => {
        expect(exportPixelSize({ width: 1280, height: 760 }, 1)).toEqual({ width: 1280, height: 760 });
        expect(exportPixelSize({ width: 1281, height: 761 }, 0.5)).toEqual({ width: 641, height: 381 });
        expect(exportPixelSize({ width: 1280, height: 760 }, 2)).toEqual({ width: 2560, height: 1520 });
    });
});
