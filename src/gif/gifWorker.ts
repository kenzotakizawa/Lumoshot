import { buildPalette, estimateGifSize, GifFrameEncoder, type GifEncodeSettings } from './gifEncode';

// Encodes GIFs off the main thread. The page renders frames (that needs the
// DOM) and streams their pixels here; replies carry the request's id.

export type GifWorkerRequest =
    | { id: number; type: 'start'; width: number; height: number; settings: GifEncodeSettings; samples: Uint8ClampedArray[] }
    | { id: number; type: 'frame'; rgba: Uint8ClampedArray; delay: number }
    | { id: number; type: 'finish' }
    | {
        id: number;
        type: 'estimate';
        width: number;
        height: number;
        settings: GifEncodeSettings;
        first: Uint8ClampedArray;
        pairs: Array<[Uint8ClampedArray, Uint8ClampedArray]>;
        frameCount: number;
    };

export type GifWorkerResponse =
    | { id: number; ok: true; bytes?: Uint8Array; size?: number }
    | { id: number; ok: false; error: string };

let encoder: GifFrameEncoder | null = null;

// `self` is the worker scope here (typed as Window by the DOM lib).
const scope = self as unknown as { postMessage: (msg: unknown, transfer: Transferable[]) => void };
const reply = (msg: GifWorkerResponse, transfer: Transferable[] = []) => scope.postMessage(msg, transfer);

self.onmessage = (e: MessageEvent<GifWorkerRequest>) => {
    const req = e.data;
    try {
        switch (req.type) {
            case 'start': {
                const palette = buildPalette(req.samples, req.settings.colors);
                encoder = new GifFrameEncoder(req.width, req.height, palette, req.settings);
                reply({ id: req.id, ok: true });
                break;
            }
            case 'frame': {
                if (!encoder) throw new Error('Encoder not started');
                encoder.addFrame(req.rgba, req.delay);
                reply({ id: req.id, ok: true, size: encoder.writer.byteLength });
                break;
            }
            case 'finish': {
                if (!encoder) throw new Error('Encoder not started');
                const bytes = encoder.finish();
                encoder = null;
                reply({ id: req.id, ok: true, bytes }, [bytes.buffer]);
                break;
            }
            case 'estimate': {
                const samples = [req.first, ...req.pairs.map((p) => p[1])];
                const palette = buildPalette(samples, req.settings.colors);
                const size = estimateGifSize(req.width, req.height, palette, req.settings, req.first, req.pairs, req.frameCount);
                reply({ id: req.id, ok: true, size });
                break;
            }
        }
    } catch (err) {
        reply({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
};
