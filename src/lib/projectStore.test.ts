import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db, listProjects, upsertProject, renameProject, deleteProject, clearAll, getProjectAssets, MAX_ITEMS } from './projectStore';

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
        await db.assets.clear();
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

    describe('assets (snapshot format 2)', () => {
        const BG = 'data:image/png;base64,' + 'B'.repeat(10000);
        const STAMP = 'data:image/png;base64,' + 'S'.repeat(6000);
        const stateWith = (...hashes: string[]) =>
            JSON.stringify({ formatVersion: 2, canvasData: { objects: hashes.map((h) => ({ type: 'Image', src: `asset:${h}` })) }, dimensions: { width: 1, height: 1 } });

        it('stores each image once and returns it when reopening', async () => {
            const id = await upsertProject(null, stateWith('bg1'), DUMMY_THUMB, { bg1: BG });
            // a later autosave of the same project references the same image
            await upsertProject(id, stateWith('bg1', 'st1'), DUMMY_THUMB, { bg1: BG, st1: STAMP });
            expect(await db.assets.count()).toBe(2);
            const [project] = await listProjects();
            expect(project.assets).toEqual({ bg1: BG.length, st1: STAMP.length });
            expect(await getProjectAssets(project)).toEqual({ bg1: BG, st1: STAMP });
        });

        it('drops images a project stops referencing (e.g. after a crop)', async () => {
            const id = await upsertProject(null, stateWith('old'), DUMMY_THUMB, { old: BG });
            await upsertProject(id, stateWith('new'), DUMMY_THUMB, { new: STAMP });
            expect(await db.assets.toCollection().primaryKeys()).toEqual(['new']);
        });

        it('keeps an image shared by two projects until both are deleted', async () => {
            vi.setSystemTime(1000);
            const a = await upsertProject(null, stateWith('shared'), DUMMY_THUMB, { shared: BG });
            vi.setSystemTime(2000);
            const b = await upsertProject(null, stateWith('shared'), DUMMY_THUMB, { shared: BG });
            await deleteProject(a);
            expect(await db.assets.count()).toBe(1);
            await deleteProject(b);
            expect(await db.assets.count()).toBe(0);
        });

        it('still reads format-1 projects (images inline, no assets)', async () => {
            const inline = JSON.stringify({ canvasData: { objects: [{ type: 'Image', src: BG }] }, dimensions: { width: 1, height: 1 } });
            await upsertProject(null, inline, DUMMY_THUMB);
            const [project] = await listProjects();
            expect(project.state).toBe(inline);
            expect(await getProjectAssets(project)).toEqual({});
        });

        it('clearAll also removes stored images', async () => {
            await upsertProject(null, stateWith('bg1'), DUMMY_THUMB, { bg1: BG });
            await clearAll();
            expect(await db.assets.count()).toBe(0);
        });
    });
});
