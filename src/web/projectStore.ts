import Dexie, { type Table } from 'dexie';

// One saved edit. `state` is the editor snapshot JSON (canvasData + dimensions),
// `thumbnail` is a small JPEG dataURL for the gallery.
export interface Project {
    id?: number;
    createdAt: number;
    updatedAt: number;
    name: string;
    thumbnail: string;
    state: string;
}

class LumoshotDB extends Dexie {
    projects!: Table<Project, number>;
    constructor() {
        super('lumoshot');
        this.version(1).stores({ projects: '++id, updatedAt' });
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

// Create (id == null) or update an existing project; returns its id.
export async function upsertProject(id: number | null, state: string, thumbnail: string): Promise<number> {
    const now = Date.now();
    if (id != null) {
        await db.projects.update(id, { state, thumbnail, updatedAt: now });
        return id;
    }
    const newId = (await db.projects.add({
        createdAt: now,
        updatedAt: now,
        name: defaultName(now),
        thumbnail,
        state,
    })) as number;
    await enforceLimits();
    return newId;
}

export async function createProjectFromFile(name: string, state: string, thumbnail: string): Promise<number> {
    const now = Date.now();
    const newId = (await db.projects.add({
        createdAt: now,
        updatedAt: now,
        name: name.trim() || defaultName(now),
        thumbnail,
        state,
    })) as number;
    await enforceLimits();
    return newId;
}

export async function renameProject(id: number, name: string): Promise<void> {
    await db.projects.update(id, { name });
}

export async function deleteProject(id: number): Promise<void> {
    await db.projects.delete(id);
}

export async function clearAll(): Promise<void> {
    await db.projects.clear();
}

export async function storageUsage(): Promise<{ usage: number; quota: number }> {
    if (navigator.storage?.estimate) {
        const { usage = 0, quota = 0 } = await navigator.storage.estimate();
        return { usage, quota };
    }
    return { usage: 0, quota: 0 };
}

// Keep at most MAX_ITEMS (and under MAX_BYTES), evicting oldest first (LRU).
async function enforceLimits(): Promise<void> {
    const all = await db.projects.orderBy('updatedAt').reverse().toArray();
    const overCount = all.slice(MAX_ITEMS).map((p) => p.id!);

    let bytes = 0;
    const overSize: number[] = [];
    for (const p of all.slice(0, MAX_ITEMS)) {
        bytes += p.state.length + p.thumbnail.length;
        if (bytes > MAX_BYTES) overSize.push(p.id!);
    }

    const ids = [...overCount, ...overSize];
    if (ids.length) await db.projects.bulkDelete(ids);
}
