import Dexie, { type Table } from 'dexie';
import { assetRefsInState } from '../editor/utils/snapshotAssets';

// One saved edit. `state` is the editor snapshot JSON (canvasData + dimensions),
// `thumbnail` is a small JPEG dataURL for the gallery.
// Since snapshot format 2, big images in `state` are "asset:<hash>" refs whose
// data lives once in the `assets` table; `assets` here maps each referenced
// hash to its byte size (for the storage limit). Format-1 projects (images
// inline in `state`) have no `assets` and still load as-is.
export interface Project {
    id?: number;
    createdAt: number;
    updatedAt: number;
    name: string;
    thumbnail: string;
    state: string;
    assets?: Record<string, number>;
}

export interface StoredAsset {
    hash: string;
    data: string;
}

class LumoshotDB extends Dexie {
    projects!: Table<Project, number>;
    assets!: Table<StoredAsset, string>;
    constructor() {
        super('lumoshot');
        this.version(1).stores({ projects: '++id, updatedAt' });
        this.version(2).stores({ projects: '++id, updatedAt', assets: 'hash' });
    }
}

export const db = new LumoshotDB();

export const MAX_ITEMS = 15;
const MAX_BYTES = 200 * 1024 * 1024; // safety net (~200MB)

function defaultName(ts: number): string {
    const d = new Date(ts);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export async function listProjects(): Promise<Project[]> {
    return db.projects.orderBy('updatedAt').reverse().toArray();
}

export async function getProject(id: number): Promise<Project | undefined> {
    return db.projects.get(id);
}

// Stores the image data `state` references (only hashes not stored yet; a big
// background is written once, not on every autosave) and returns the
// hash → size map to keep on the project.
async function storeAssets(state: string, assets: Record<string, string>): Promise<Record<string, number>> {
    const refs = assetRefsInState(state);
    const sizes: Record<string, number> = {};
    for (const hash of refs) sizes[hash] = assets[hash]?.length ?? 0;
    if (refs.length === 0) return sizes;
    const existing = new Set(await db.assets.where(':id').anyOf(refs).primaryKeys());
    const toAdd = refs.filter((h) => !existing.has(h) && assets[h]).map((h) => ({ hash: h, data: assets[h] }));
    if (toAdd.length) await db.assets.bulkPut(toAdd);
    return sizes;
}

// Create (id == null) or update an existing project; returns its id.
export async function upsertProject(
    id: number | null,
    state: string,
    thumbnail: string,
    assets: Record<string, string> = {},
): Promise<number> {
    // One read-write transaction, so overlapping autosaves can't interleave
    // (one save's garbage collection deleting an image another save has just
    // stored but not yet linked to its project).
    return db.transaction('rw', db.projects, db.assets, async () => {
        const now = Date.now();
        const sizes = await storeAssets(state, assets);
        if (id != null) {
            await db.projects.update(id, { state, thumbnail, assets: sizes, updatedAt: now });
            await collectGarbage();
            return id;
        }
        const newId = (await db.projects.add({
            createdAt: now,
            updatedAt: now,
            name: defaultName(now),
            thumbnail,
            state,
            assets: sizes,
        })) as number;
        await enforceLimits();
        return newId;
    });
}

export async function createProjectFromFile(
    name: string,
    state: string,
    thumbnail: string,
    assets: Record<string, string> = {},
): Promise<number> {
    return db.transaction('rw', db.projects, db.assets, async () => {
        const now = Date.now();
        const sizes = await storeAssets(state, assets);
        const newId = (await db.projects.add({
            createdAt: now,
            updatedAt: now,
            name: name.trim() || defaultName(now),
            thumbnail,
            state,
            assets: sizes,
        })) as number;
        await enforceLimits();
        return newId;
    });
}

// Image data for every asset a project references (for reopening it).
export async function getProjectAssets(project: Project): Promise<Record<string, string>> {
    const refs = assetRefsInState(project.state);
    if (refs.length === 0) return {};
    const rows = await db.assets.bulkGet(refs);
    const out: Record<string, string> = {};
    rows.forEach((row) => {
        if (row) out[row.hash] = row.data;
    });
    return out;
}

export async function renameProject(id: number, name: string): Promise<void> {
    await db.projects.update(id, { name });
}

export async function deleteProject(id: number): Promise<void> {
    await db.transaction('rw', db.projects, db.assets, async () => {
        await db.projects.delete(id);
        await collectGarbage();
    });
}

export async function clearAll(): Promise<void> {
    await db.transaction('rw', db.projects, db.assets, async () => {
        await db.projects.clear();
        await db.assets.clear();
    });
}

export async function storageUsage(): Promise<{ usage: number; quota: number }> {
    if (navigator.storage?.estimate) {
        const { usage = 0, quota = 0 } = await navigator.storage.estimate();
        return { usage, quota };
    }
    return { usage: 0, quota: 0 };
}

// Delete stored images no project references anymore (e.g. the old background
// after a crop, or everything a deleted project used).
async function collectGarbage(): Promise<void> {
    const live = new Set<string>();
    await db.projects.each((p) => {
        for (const hash of Object.keys(p.assets ?? {})) live.add(hash);
    });
    const stored = await db.assets.toCollection().primaryKeys();
    const dead = stored.filter((hash) => !live.has(hash));
    if (dead.length) await db.assets.bulkDelete(dead);
}

// Keep at most MAX_ITEMS (and under MAX_BYTES), evicting oldest first (LRU).
// A shared image counts once, for the newest project that uses it.
async function enforceLimits(): Promise<void> {
    const all = await db.projects.orderBy('updatedAt').reverse().toArray();
    const overCount = all.slice(MAX_ITEMS).map((p) => p.id!);

    let bytes = 0;
    const counted = new Set<string>();
    const overSize: number[] = [];
    for (const p of all.slice(0, MAX_ITEMS)) {
        bytes += p.state.length + p.thumbnail.length;
        for (const [hash, size] of Object.entries(p.assets ?? {})) {
            if (counted.has(hash)) continue;
            counted.add(hash);
            bytes += size;
        }
        if (bytes > MAX_BYTES) overSize.push(p.id!);
    }

    const ids = [...overCount, ...overSize];
    if (ids.length) await db.projects.bulkDelete(ids);
    await collectGarbage();
}
