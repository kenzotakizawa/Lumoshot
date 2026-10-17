import { startRecorder, RECORD_FPS, type Recorder } from '../gif/recorder';

// Offscreen document: MV3 service workers can't use getUserMedia, so the tab
// recording for GIFs runs here. The background starts and stops it with
// messages addressed to `target: 'offscreen'`.

let recorder: Recorder | null = null;

async function start(streamId: string) {
    if (recorder) return { ok: false, error: 'already-recording' };
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                // Chrome's tab-capture constraints (legacy "mandatory" form).
                // A min below the max lets frames keep the tab's own shape.
                mandatory: {
                    chromeMediaSource: 'tab',
                    chromeMediaSourceId: streamId,
                    minWidth: 16,
                    minHeight: 16,
                    maxWidth: 2560,
                    maxHeight: 2560,
                    maxFrameRate: RECORD_FPS,
                },
            } as MediaTrackConstraints,
        });
        recorder = await startRecorder(stream, {
            onTick: (elapsedMs) => {
                chrome.runtime.sendMessage({ type: 'GIF_TICK', elapsedMs }).catch(() => {});
            },
            onAutoStop: (result, reason) => {
                recorder = null;
                chrome.runtime.sendMessage({ type: 'GIF_AUTO_STOPPED', result, reason }).catch(() => {});
            },
        });
        return { ok: true, recordingId: recorder.recordingId };
    } catch (err) {
        console.error('Could not start recording', err);
        return { ok: false, error: String(err) };
    }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.target !== 'offscreen') return;
    if (message.type === 'GIF_OFFSCREEN_START') {
        start(message.streamId).then(sendResponse);
        return true;
    }
    if (message.type === 'GIF_OFFSCREEN_STOP') {
        const current = recorder;
        recorder = null;
        (current ? current.stop() : Promise.resolve(null)).then((result) => sendResponse({ result }));
        return true;
    }
});
