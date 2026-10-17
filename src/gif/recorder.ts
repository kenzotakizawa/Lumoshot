import { createRecording, deleteRecording, MAX_RECORDINGS, pruneRecordings, putFrame, updateRecording } from './gifStore';

// Records a video MediaStream (the captured tab) into the GIF store.
//
// To make 5 minutes fit: at most 10 frames per second, the long side scaled
// down to 1280 px, each frame stored as WebP at 75% — and only when the
// picture changed. A frame that equals the previous one isn't stored at all;
// the previous frame simply lasts longer (frames carry their start time).

export const RECORD_FPS = 10;
export const RECORD_MAX_SIDE = 1280;
export const RECORD_QUALITY = 0.75;
export const RECORD_MAX_MS = 5 * 60 * 1000;
const SLOT_MS = 1000 / RECORD_FPS;

export interface RecorderResult {
    recordingId: number;
    frameCount: number;
    durationMs: number;
}

export type AutoStopReason = 'limit' | 'ended' | 'error';

export interface RecorderOptions {
    maxMs?: number;
    // Every second, with the time since recording started.
    onTick?: (elapsedMs: number) => void;
    // The recording stopped by itself (time limit, the tab went away, or
    // storage failed). Not called after stop().
    onAutoStop?: (result: RecorderResult | null, reason: AutoStopReason) => void;
}

export interface Recorder {
    readonly recordingId: number;
    stop(): Promise<RecorderResult | null>;
}

interface VideoFrameLike {
    timestamp: number;
    displayWidth: number;
    displayHeight: number;
    close(): void;
}

interface TrackProcessorCtor {
    new (init: { track: MediaStreamTrack; maxBufferSize?: number }): { readable: ReadableStream<VideoFrameLike> };
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

function samePixels(a: Uint32Array, b: Uint32Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

async function makeThumbnail(blob: Blob): Promise<string> {
    const bitmap = await createImageBitmap(blob);
    const w = 320;
    const h = Math.max(1, Math.round(bitmap.height * (w / bitmap.width)));
    const canvas = new OffscreenCanvas(w, h);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return blobToDataUrl(await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 }));
}

export async function startRecorder(stream: MediaStream, opts: RecorderOptions = {}): Promise<Recorder> {
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error('No video track to record');
    const maxMs = opts.maxMs ?? RECORD_MAX_MS;

    await pruneRecordings(MAX_RECORDINGS - 1);
    const recordingId = await createRecording();
    const startWall = performance.now();

    let firstFrameWall: number | null = null;
    let canvas: OffscreenCanvas | null = null;
    let ctx: OffscreenCanvasRenderingContext2D | null = null;
    let outW = 0;
    let outH = 0;
    let prev: Uint32Array | null = null;
    let firstBlob: Blob | null = null;
    const times: number[] = [];
    let lastSlot = -1;
    let running = true;
    let stopping: Promise<RecorderResult | null> | null = null;
    let autoStopped = false;

    // Draws one captured picture and stores it if it differs from the last one.
    const handle = async (source: CanvasImageSource, srcW: number, srcH: number, tMs: number) => {
        if (!srcW || !srcH || tMs >= maxMs) return;
        if (!canvas) {
            const scale = Math.min(1, RECORD_MAX_SIDE / Math.max(srcW, srcH));
            outW = even(srcW * scale);
            outH = even(srcH * scale);
            canvas = new OffscreenCanvas(outW, outH);
            ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
        }
        if (!ctx) return;
        // The tab can be resized while recording: fit it into the first size.
        const s = Math.min(outW / srcW, outH / srcH);
        const dw = srcW * s;
        const dh = srcH * s;
        if (Math.abs(dw - outW) > 0.5 || Math.abs(dh - outH) > 0.5) {
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, outW, outH);
        }
        ctx.drawImage(source, (outW - dw) / 2, (outH - dh) / 2, dw, dh);
        const pixels = new Uint32Array(ctx.getImageData(0, 0, outW, outH).data.buffer);
        if (prev && samePixels(prev, pixels)) return;

        // Frames are placed on a 100 ms grid. A second picture within the same
        // slot replaces the first, so the slot shows the newest state.
        const slot = Math.floor(tMs / SLOT_MS);
        let index: number;
        if (times.length > 0 && slot <= lastSlot) {
            index = times.length - 1;
        } else {
            index = times.length;
            times.push(index === 0 ? 0 : slot * SLOT_MS);
            lastSlot = index === 0 ? 0 : slot;
        }
        const blob = await canvas!.convertToBlob({ type: 'image/webp', quality: RECORD_QUALITY });
        await putFrame(recordingId, index, blob);
        if (index === 0) firstBlob = blob;
        prev = pixels;
        // Keep the frame list stored now and then, so a crash loses little.
        if (index > 0 && index % 50 === 0) {
            await updateRecording(recordingId, { times: [...times], width: outW, height: outH });
        }
    };

    const autoStop = (reason: AutoStopReason) => {
        if (stopping || autoStopped) return;
        autoStopped = true;
        stop().then((result) => opts.onAutoStop?.(result, reason));
    };

    // ─── Frame source ───
    const Processor = (globalThis as unknown as { MediaStreamTrackProcessor?: TrackProcessorCtor }).MediaStreamTrackProcessor;
    let reader: ReadableStreamDefaultReader<VideoFrameLike> | null = null;
    let video: HTMLVideoElement | null = null;
    let loop: Promise<void>;

    if (Processor) {
        // Frames arrive when the tab repaints (at most RECORD_FPS per second);
        // when busy, only the newest waiting frame is kept.
        reader = new Processor({ track, maxBufferSize: 2 }).readable.getReader();
        let firstTs: number | null = null;
        loop = (async () => {
            while (running) {
                const { value: frame, done } = await reader!.read();
                if (done || !frame) break;
                try {
                    if (!running) continue;
                    if (firstTs === null) {
                        firstTs = frame.timestamp;
                        firstFrameWall = performance.now();
                    }
                    await handle(frame as unknown as CanvasImageSource, frame.displayWidth, frame.displayHeight, (frame.timestamp - firstTs) / 1000);
                } catch (err) {
                    console.error('Recording frame failed', err);
                    autoStop('error');
                } finally {
                    frame.close();
                }
            }
        })();
    } else {
        // Fallback: sample a <video> element on a timer.
        video = document.createElement('video');
        video.muted = true;
        video.srcObject = stream;
        await video.play();
        loop = (async () => {
            while (running) {
                await new Promise((r) => setTimeout(r, SLOT_MS));
                if (!running || !video!.videoWidth) continue;
                if (firstFrameWall === null) firstFrameWall = performance.now();
                try {
                    await handle(video!, video!.videoWidth, video!.videoHeight, performance.now() - firstFrameWall);
                } catch (err) {
                    console.error('Recording frame failed', err);
                    autoStop('error');
                }
            }
        })();
    }

    const ticker = setInterval(() => {
        const elapsed = performance.now() - startWall;
        opts.onTick?.(Math.min(elapsed, maxMs));
        if (elapsed >= maxMs) autoStop('limit');
    }, 1000);
    track.addEventListener('ended', () => autoStop('ended'));

    const stop = (): Promise<RecorderResult | null> => {
        if (stopping) return stopping;
        stopping = (async () => {
            running = false;
            clearInterval(ticker);
            const endWall = performance.now();
            try {
                await reader?.cancel();
            } catch {
                // Already closed.
            }
            await loop.catch(() => {});
            stream.getTracks().forEach((t) => t.stop());
            if (video) video.srcObject = null;

            if (times.length === 0 || !firstBlob) {
                await deleteRecording(recordingId);
                return null;
            }
            const elapsed = firstFrameWall !== null ? endWall - firstFrameWall : 0;
            const durationMs = Math.round(Math.min(maxMs, Math.max(elapsed, times[times.length - 1] + SLOT_MS)));
            let thumbnail = '';
            try {
                thumbnail = await makeThumbnail(firstBlob);
            } catch (err) {
                console.warn('Thumbnail failed', err);
            }
            await updateRecording(recordingId, {
                status: 'done',
                width: outW,
                height: outH,
                durationMs,
                times: [...times],
                thumbnail,
                updatedAt: Date.now(),
            });
            return { recordingId, frameCount: times.length, durationMs };
        })();
        return stopping;
    };

    return { recordingId, stop };
}
