import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db, listProjects, upsertProject, renameProject, deleteProject, clearAll, MAX_ITEMS } from './projectStore';

const DUMMY_STATE = '{"canvasData":{},"dimensions":{"width":10,"height":10}}';
const DUMMY_THUMB = 'data:image/jpeg;base64,AA==';

// `Date.now()`-based `updatedAt` timestamps drive the LRU ordering, so we pin
// the clock per insert to make ordering deterministic instead of relying on
// however fast the test happens to run.
async function seedProject(atMs: number, name: string) {
    vi.setSystemTime(atMs);
    const id = await upsertProject(null, DUMMY_STATE, DUMMY_THUMB);
    await renameProject(id, name);
    return id;
}

describe('projectStore', () => {
    beforeEach(async () => {
        await db.projects.clear();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('lists saved projects newest-first', async () => {
        await seedProject(1000, 'first');
        await seedProject(2000, 'second');
        const all = await listProjects();
        expect(all.map((p) => p.name)).toEqual(['second', 'first']);
    });

    it('evicts the oldest project once past MAX_ITEMS (LRU)', async () => {
        for (let i = 0; i < MAX_ITEMS + 3; i++) {
            await seedProject(1000 + i * 1000, `p${i}`);
        }
        const all = await listProjects();
        expect(all).toHaveLength(MAX_ITEMS);

        const names = all.map((p) => p.name);
        expect(names).not.toContain('p0');
        expect(names).not.toContain('p1');
        expect(names).not.toContain('p2');
        expect(names[0]).toBe(`p${MAX_ITEMS + 2}`); // most recently saved stays first
    });

    it('renames a project', async () => {
        const id = await seedProject(1000, 'original');
        await renameProject(id, 'renamed');
        const all = await listProjects();
        expect(all[0].name).toBe('renamed');
    });

    it('deletes a single project without affecting others', async () => {
        const a = await seedProject(1000, 'a');
        await seedProject(2000, 'b');
        await deleteProject(a);
        const all = await listProjects();
        expect(all.map((p) => p.name)).toEqual(['b']);
    });

    it('clears every saved project', async () => {
        await seedProject(1000, 'a');
        await seedProject(2000, 'b');
        await clearAll();
        expect(await listProjects()).toHaveLength(0);
    });

    it('updates an existing project in place when an id is passed to upsertProject', async () => {
        const id = await seedProject(1000, 'original');
        vi.setSystemTime(5000);
        const updatedState = '{"canvasData":{"updated":true},"dimensions":{"width":1,"height":1}}';
        const returnedId = await upsertProject(id, updatedState, DUMMY_THUMB);

        expect(returnedId).toBe(id);
        const all = await listProjects();
        expect(all).toHaveLength(1);
        expect(all[0].state).toBe(updatedState);
    });
});
