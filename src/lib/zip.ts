// Minimal ZIP writer ("stored", i.e. no compression). Images (PNG/JPEG/WebP)
// are already compressed, so deflating them again would gain almost nothing;
// this keeps the bundle free of a compression library.

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

export function crc32(data: Uint8Array): number {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
    name: string;
    data: Uint8Array;
    date?: Date;
}

// DOS date/time fields used by the ZIP format.
function dosDateTime(d: Date): { time: number; date: number } {
    const year = Math.max(1980, d.getFullYear());
    return {
        time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
        date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    };
}

export function buildZip(entries: ZipEntry[]): Uint8Array<ArrayBuffer> {
    const encoder = new TextEncoder();
    const locals: Uint8Array[] = [];
    const centrals: Uint8Array[] = [];
    let offset = 0;

    for (const entry of entries) {
        const name = encoder.encode(entry.name);
        const crc = crc32(entry.data);
        const size = entry.data.length;
        const { time, date } = dosDateTime(entry.date ?? new Date());
        const FLAG_UTF8 = 0x0800; // file names are UTF-8 (Japanese names)

        const local = new Uint8Array(30 + name.length);
        const lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint16(4, 20, true); // version needed
        lv.setUint16(6, FLAG_UTF8, true);
        lv.setUint16(8, 0, true); // stored
        lv.setUint16(10, time, true);
        lv.setUint16(12, date, true);
        lv.setUint32(14, crc, true);
        lv.setUint32(18, size, true);
        lv.setUint32(22, size, true);
        lv.setUint16(26, name.length, true);
        lv.setUint16(28, 0, true);
        local.set(name, 30);

        const central = new Uint8Array(46 + name.length);
        const cv = new DataView(central.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(4, 20, true); // version made by
        cv.setUint16(6, 20, true); // version needed
        cv.setUint16(8, FLAG_UTF8, true);
        cv.setUint16(10, 0, true);
        cv.setUint16(12, time, true);
        cv.setUint16(14, date, true);
        cv.setUint32(16, crc, true);
        cv.setUint32(20, size, true);
        cv.setUint32(24, size, true);
        cv.setUint16(28, name.length, true);
        cv.setUint32(42, offset, true); // local header offset
        central.set(name, 46);

        locals.push(local, entry.data);
        centrals.push(central);
        offset += local.length + size;
    }

    const centralSize = centrals.reduce((n, c) => n + c.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);

    const out = new Uint8Array(offset + centralSize + end.length);
    let pos = 0;
    for (const part of [...locals, ...centrals, end]) {
        out.set(part, pos);
        pos += part.length;
    }
    return out;
}

// "name.png", "name (2).png", … for duplicate names within one archive.
export function uniqueNames(names: string[]): string[] {
    const seen = new Map<string, number>();
    return names.map((name) => {
        const key = name.toLowerCase();
        const n = (seen.get(key) ?? 0) + 1;
        seen.set(key, n);
        if (n === 1) return name;
        const dot = name.lastIndexOf('.');
        return dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
    });
}
