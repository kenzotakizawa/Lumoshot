import { getFrameBlob } from './gifStore';

// Decodes recorded frames on demand and keeps the most recent ones, so a
// 5-minute recording never has to be decoded (or held) all at once.
// Evicted bitmaps aren't closed: one may still be on the canvas; the garbage
// collector frees them once nothing references them.
export class FrameCache {
    private recordingId: number;
    private limit: number;
    private bitmaps = new Map<number, Promise<ImageBitmap>>();
    private thumbs = new Map<string, Promise<ImageBitmap>>();

    constructor(recordingId: number, limit = 24) {
        this.recordingId = recordingId;
        this.limit = limit;
    }

    private async blob(index: number): Promise<Blob> {
        const blob = await getFrameBlob(this.recordingId, index);
        if (!blob) throw new Error(`Frame ${index} is missing`);
        return blob;
    }

    get(index: number): Promise<ImageBitmap> {
        const hit = this.bitmaps.get(index);
        if (hit) {
            // Most recently used goes last.
            this.bitmaps.delete(index);
            this.bitmaps.set(index, hit);
            return hit;
        }
        const loading = this.blob(index).then((b) => createImageBitmap(b));
        loading.catch(() => this.bitmaps.delete(index));
        this.bitmaps.set(index, loading);
        while (this.bitmaps.size > this.limit) {
            const oldest = this.bitmaps.keys().next().value as number;
            this.bitmaps.delete(oldest);
        }
        return loading;
    }

    // Warm up the next frames (e.g. while playing).
    prefetch(indices: number[]): void {
        for (const i of indices) if (!this.bitmaps.has(i)) this.get(i).catch(() => {});
    }

    thumbnail(index: number, height: number): Promise<ImageBitmap> {
        const key = `${index}:${height}`;
        let hit = this.thumbs.get(key);
        if (!hit) {
            hit = this.blob(index).then((b) => createImageBitmap(b, { resizeHeight: height, resizeQuality: 'medium' }));
            hit.catch(() => this.thumbs.delete(key));
            this.thumbs.set(key, hit);
        }
        return hit;
    }

    async dataUrl(index: number): Promise<string> {
        const blob = await this.blob(index);
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
    }
}
