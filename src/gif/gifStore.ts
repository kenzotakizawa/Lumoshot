import Dexie, { type Table } from 'dexie';
import type { GifEdit } from './timeline';

// GIF recordings (extension only). Frames are written while recording, so a
// long recording never has to fit in memory; the editor reads them back one
// at a time. Kept in its own database so it never touches saved projects.

export interface Recording {
    id?: number;
    createdAt: number;
    updatedAt: number;
    status: 'recording' | 'done';
    // Frame size in pixels (every frame has the same size).
    width: number;
    height: number;
    durationMs: number;
    // Start time (ms) of each stored frame; a frame lasts until the next one.
    times: number[];
    // Small JPEG data URL for lists.
    thumbnail: string;
    // Editing state, saved by the GIF editor.
    edit?: GifEdit;
    // Editor snapshot of the annotations (without the frame image), and the
    // data of images it references (e.g. inserted stamps).
    annotations?: string;
    annotationAssets?: Record<string, string>;
}

export interface RecordedFrame {
    recordingId: number;
    index: number;
    blob: Blob;
}

class GifDB extends Dexie {
    recordings!: Table<Recording, number>;
    frames!: Table<RecordedFrame, [number, number]>;
    constructor() {
        super('lumoshot-gif');
        this.version(1).stores({
            recordings: '++id, updatedAt',
            frames: '[recordingId+index], recordingId',
        });
    }
}

export const gifDb = new GifDB();

// Recordings can be 100 MB+, so only the newest few are kept.
export const MAX_RECORDINGS = 3;

export async function createRecording(): Promise<number> {
    const now = Date.now();
    return (await gifDb.recordings.add({
        createdAt: now,
        updatedAt: now,
        status: 'recording',
        width: 0,
        height: 0,
        durationMs: 0,
        times: [],
        thumbnail: '',
    })) as number;
}

export async function putFrame(recordingId: number, index: number, blob: Blob): Promise<void> {
    await gifDb.frames.put({ recordingId, index, blob });
}

export async function updateRecording(id: number, patch: Partial<Omit<Recording, 'id'>>): Promise<void> {
    await gifDb.recordings.update(id, patch);
}

export async function getRecording(id: number): Promise<Recording | undefined> {
    return gifDb.recordings.get(id);
}

export async function getFrameBlob(recordingId: number, index: number): Promise<Blob | undefined> {
    return (await gifDb.frames.get([recordingId, index]))?.blob;
}

// Finished recordings, newest first (frames are not loaded).
export async function listRecordings(): Promise<Recording[]> {
    const all = await gifDb.recordings.orderBy('updatedAt').reverse().toArray();
    return all.filter((r) => r.status === 'done');
}

export async function deleteRecording(id: number): Promise<void> {
    await gifDb.transaction('rw', gifDb.recordings, gifDb.frames, async () => {
        await gifDb.frames.where('recordingId').equals(id).delete();
        await gifDb.recordings.delete(id);
    });
}

// Deletes the oldest recordings beyond `keep` (never `exceptId`), plus any
// left unfinished by a crash.
export async function pruneRecordings(keep: number, exceptId?: number): Promise<void> {
    const all = (await gifDb.recordings.toArray()).sort((a, b) => b.createdAt - a.createdAt);
    let kept = 0;
    for (const r of all) {
        if (r.id === exceptId) continue;
        if (r.status === 'done' && kept < keep) {
            kept++;
            continue;
        }
        await deleteRecording(r.id!);
    }
}

// "2026-10-17 20:07"
export function recordingName(r: Pick<Recording, 'createdAt'>): string {
    const d = new Date(r.createdAt);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
