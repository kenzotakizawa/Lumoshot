import { describe, expect, it } from 'vitest';
import { buildZip, crc32, uniqueNames } from './zip';

const bytes = (s: string) => new TextEncoder().encode(s);

// Read back a stored ZIP using its central directory.
function readZip(zip: Uint8Array) {
    const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    const endPos = zip.length - 22;
    expect(v.getUint32(endPos, true)).toBe(0x06054b50);
    const count = v.getUint16(endPos + 10, true);
    let pos = v.getUint32(endPos + 16, true);
    const files: Array<{ name: string; data: string; crcOk: boolean }> = [];
    for (let i = 0; i < count; i++) {
        expect(v.getUint32(pos, true)).toBe(0x02014b50);
        const crc = v.getUint32(pos + 16, true);
        const size = v.getUint32(pos + 24, true);
        const nameLen = v.getUint16(pos + 28, true);
        const localOffset = v.getUint32(pos + 42, true);
        const name = new TextDecoder().decode(zip.subarray(pos + 46, pos + 46 + nameLen));
        expect(v.getUint32(localOffset, true)).toBe(0x04034b50);
        const localNameLen = v.getUint16(localOffset + 26, true);
        const dataStart = localOffset + 30 + localNameLen;
        const data = zip.subarray(dataStart, dataStart + size);
        files.push({ name, data: new TextDecoder().decode(data), crcOk: crc32(data) === crc });
        pos += 46 + nameLen;
    }
    return files;
}

describe('crc32', () => {
    it('matches the standard check value', () => {
        expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
        expect(crc32(new Uint8Array())).toBe(0);
    });
});

describe('buildZip', () => {
    it('stores files (including UTF-8 names) that can be read back', () => {
        const zip = buildZip([
            { name: '01_ログイン.png', data: bytes('first file') },
            { name: '02_settings.png', data: bytes('second') },
        ]);
        expect(readZip(zip)).toEqual([
            { name: '01_ログイン.png', data: 'first file', crcOk: true },
            { name: '02_settings.png', data: 'second', crcOk: true },
        ]);
    });

    it('produces a valid empty archive', () => {
        expect(readZip(buildZip([]))).toEqual([]);
    });
});

describe('uniqueNames', () => {
    it('suffixes duplicates, keeping the extension', () => {
        expect(uniqueNames(['a.png', 'b.png', 'A.png', 'a.png', 'noext', 'noext'])).toEqual(['a.png', 'b.png', 'A (2).png', 'a (3).png', 'noext', 'noext (2)']);
    });
});
