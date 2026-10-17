import type { Canvas } from 'fabric';

// Editor snapshots (undo history, web autosave, .lumoshot files) used to embed
// every image — the background above all — as a data URL in every single
// entry. With a large screenshot that is megabytes per undo step.
//
// Format 2 stores each distinct image once, in an asset map keyed by a content
// hash, and the snapshot JSON only carries `"src": "asset:<hash>"`. Format 1
// snapshots (inline data URLs) still load as-is.

export const SNAPSHOT_FORMAT_VERSION = 2;
export const ASSET_PREFIX = 'asset:';
// Small images (icons, tiny stamps) aren't worth an indirection.
export const MIN_ASSET_LENGTH = 4096;

// hash -> data URL
export type AssetMap = Map<string, string>;

// cyrb53: fast synchronous 53-bit string hash, combined with the length so
// two different images effectively never share a key.
export function hashString(str: string): string {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
    return n.toString(36) + str.length.toString(36);
}

// ─── Live canvas side ────────────────────────────────────────────────

// Hash per image element, so a big image is hashed once, not on every snapshot.
const elementHashes = new WeakMap<object, string>();

type ImageLike = { getSrc: () => string; _originalElement?: object; getElement?: () => object };

const isImage = (o: any): o is ImageLike => typeof o?.getSrc === 'function';

// Pre-order walk over objects and group children (same order as the JSON).
function forEachImage(objects: any[], cb: (img: any) => void) {
    for (const o of objects) {
        if (isImage(o)) cb(o);
        const children = o?._objects;
        if (Array.isArray(children)) forEachImage(children, cb);
    }
}

const keyOf = (img: any): object | null => img._originalElement ?? img.getElement?.() ?? null;

// Runs `fn` (typically canvas.toObject) while big embedded images serialize
// as asset refs; their data is put into `assets`.
export function withAssetRefs<T>(canvas: Canvas, assets: AssetMap, fn: () => T): T {
    const patched: any[] = [];
    forEachImage(canvas.getObjects(), (img) => {
        const key = keyOf(img);
        let hash = key ? elementHashes.get(key) : undefined;
        if (!hash || !assets.has(hash)) {
            const src = img.getSrc();
            if (typeof src !== 'string' || !src.startsWith('data:') || src.length < MIN_ASSET_LENGTH) return;
            hash = hash ?? hashString(src);
            if (key) elementHashes.set(key, hash);
            assets.set(hash, src);
        }
        const ref = ASSET_PREFIX + hash;
        img.getSrc = () => ref; // own property shadows the prototype method
        patched.push(img);
    });
    try {
        return fn();
    } finally {
        for (const img of patched) delete img.getSrc;
    }
}

// After loadFromJSON, tell the cache which hash each restored image came from
// (hashes in the order resolveAssetRefs returned them), so the next snapshot
// doesn't have to hash the image data again.
export function seedImageHashes(canvas: Canvas, hashes: Array<string | null>) {
    let i = 0;
    forEachImage(canvas.getObjects(), (img) => {
        const hash = hashes[i++];
        const key = keyOf(img);
        if (hash && key) elementHashes.set(key, hash);
    });
}

// ─── Snapshot JSON side (pure) ───────────────────────────────────────

function forEachImageNode(node: any, cb: (n: any) => void) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.objects)) {
        for (const child of node.objects) {
            if (child && typeof child.src === 'string') cb(child);
            forEachImageNode(child, cb);
        }
    }
}

// Replaces asset refs in canvas JSON (in place) with data from `lookup`.
// Returns, in traversal order, the hash each image node came from (null for
// inline images) plus any refs that couldn't be resolved.
export function resolveAssetRefs(canvasData: any, lookup: (hash: string) => string | undefined) {
    const hashes: Array<string | null> = [];
    const missing: string[] = [];
    forEachImageNode(canvasData, (n) => {
        if (n.src.startsWith(ASSET_PREFIX)) {
            const hash = n.src.slice(ASSET_PREFIX.length);
            const data = lookup(hash);
            if (data) n.src = data;
            else missing.push(hash);
            hashes.push(hash);
        } else {
            hashes.push(null);
        }
    });
    return { hashes, missing };
}

// Asset hashes referenced by a serialized snapshot (cheap: no full parse).
export function assetRefsInState(state: string): string[] {
    const refs = new Set<string>();
    for (const m of state.matchAll(/"src":"asset:([0-9a-z]+)"/g)) refs.add(m[1]);
    return [...refs];
}
