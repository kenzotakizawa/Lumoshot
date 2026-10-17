import type { GifEncodeSettings } from './gifEncode';
import type { GifWorkerRequest, GifWorkerResponse } from './gifWorker';

type Body<T> = T extends unknown ? Omit<T, 'id'> : never;

// Promise wrapper around the encoder worker.
export class GifEncoderClient {
    private worker = new Worker(new URL('./gifWorker.ts', import.meta.url), { type: 'module' });
    private nextId = 1;
    private pending = new Map<number, { resolve: (r: GifWorkerResponse & { ok: true }) => void; reject: (e: Error) => void }>();

    constructor() {
        this.worker.onmessage = (e: MessageEvent<GifWorkerResponse>) => {
            const res = e.data;
            const p = this.pending.get(res.id);
            if (!p) return;
            this.pending.delete(res.id);
            if (res.ok) p.resolve(res);
            else p.reject(new Error(res.error));
        };
        this.worker.onerror = (e) => {
            const err = new Error(e.message || 'GIF worker failed');
            this.pending.forEach((p) => p.reject(err));
            this.pending.clear();
        };
    }

    private send(body: Body<GifWorkerRequest>, transfer: Transferable[] = []) {
        const id = this.nextId++;
        return new Promise<GifWorkerResponse & { ok: true }>((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.worker.postMessage({ ...body, id }, transfer);
        });
    }

    start(width: number, height: number, settings: GifEncodeSettings, samples: Uint8ClampedArray[]) {
        return this.send({ type: 'start', width, height, settings, samples });
    }

    // The pixel buffer is handed over to the worker (not copied).
    addFrame(rgba: Uint8ClampedArray, delay: number) {
        return this.send({ type: 'frame', rgba, delay }, [rgba.buffer]);
    }

    async finish(): Promise<Uint8Array> {
        const res = await this.send({ type: 'finish' });
        return res.bytes!;
    }

    async estimate(
        width: number,
        height: number,
        settings: GifEncodeSettings,
        first: Uint8ClampedArray,
        pairs: Array<[Uint8ClampedArray, Uint8ClampedArray]>,
        frameCount: number,
    ): Promise<number> {
        const res = await this.send({ type: 'estimate', width, height, settings, first, pairs, frameCount });
        return res.size ?? 0;
    }

    terminate() {
        this.worker.terminate();
        const err = new Error('Cancelled');
        this.pending.forEach((p) => p.reject(err));
        this.pending.clear();
    }
}
