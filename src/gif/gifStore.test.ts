import { beforeEach, describe, expect, it } from 'vitest';
import { createRecording, deleteRecording, getFrameBlob, gifDb, listRecordings, pruneRecordings, putFrame, updateRecording } from './gifStore';

beforeEach(async () => {
    await gifDb.recordings.clear();
    await gifDb.frames.clear();
});

async function finished(createdAt: number) {
    const id = await createRecording();
    await updateRecording(id, { status: 'done', createdAt, updatedAt: createdAt });
    await putFrame(id, 0, new Blob(['frame']));
    return id;
}

describe('gifStore', () => {
    it('stores frames and lists only finished recordings', async () => {
        const id = await createRecording();
        await putFrame(id, 0, new Blob(['a']));
        await putFrame(id, 1, new Blob(['b']));
        expect(await listRecordings()).toEqual([]);
        await updateRecording(id, { status: 'done', times: [0, 100], durationMs: 500 });
        const [rec] = await listRecordings();
        expect(rec.times).toEqual([0, 100]);
        expect(await getFrameBlob(id, 1)).toBeDefined();
        expect(await getFrameBlob(id, 2)).toBeUndefined();
    });

    it('deletes a recording with its frames', async () => {
        const id = await finished(1);
        await deleteRecording(id);
        expect(await gifDb.recordings.count()).toBe(0);
        expect(await gifDb.frames.count()).toBe(0);
    });

    it('keeps only the newest recordings and drops unfinished ones', async () => {
        const a = await finished(1);
        const b = await finished(2);
        const c = await finished(3);
        const broken = await createRecording(); // left 'recording' by a crash
        const current = await createRecording();
        await pruneRecordings(2, current);
        const ids = (await gifDb.recordings.toArray()).map((r) => r.id).sort();
        expect(ids).toEqual([b, c, current].sort());
        expect(ids).not.toContain(a);
        expect(ids).not.toContain(broken);
        expect(await gifDb.frames.where('recordingId').equals(a).count()).toBe(0);
    });
});
