// GIF recording, background side: starts/stops the recorder in the offscreen
// document and turns the toolbar icon into a REC button with the elapsed time.
// While recording, the action has no popup, so a click on the icon arrives
// as action.onClicked and stops the recording.

const STATE_KEY = 'gifRecording';
const OFFSCREEN_URL = 'offscreen.html';

interface RecordingState {
    tabId: number;
    windowId: number;
    tabIndex: number;
    startedAt: number;
}

interface RecorderResult {
    recordingId: number;
    frameCount: number;
    durationMs: number;
}

const getState = async () => ((await chrome.storage.session.get(STATE_KEY))[STATE_KEY] as RecordingState | undefined) ?? null;
const setState = (state: RecordingState) => chrome.storage.session.set({ [STATE_KEY]: state });
const clearState = () => chrome.storage.session.remove(STATE_KEY);

const msg = (key: string, fallback: string) => chrome.i18n.getMessage(key) || fallback;

// 72300 → "1:12"
export function formatBadgeTime(ms: number): string {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ─── Offscreen document ───

async function hasOffscreen(): Promise<boolean> {
    try {
        const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
        return contexts.length > 0;
    } catch {
        return false;
    }
}

async function ensureOffscreen() {
    if (await hasOffscreen()) return;
    await chrome.offscreen.createDocument({
        url: OFFSCREEN_URL,
        reasons: [chrome.offscreen.Reason.USER_MEDIA],
        justification: 'Record the current tab to make a GIF.',
    });
}

async function closeOffscreen() {
    if (await hasOffscreen()) await chrome.offscreen.closeDocument().catch(() => {});
}

// ─── Toolbar icon ───

function recIcon(size: number): ImageData {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d')!;
    const c = size / 2;
    ctx.beginPath();
    ctx.arc(c, c, size * 0.46, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c, c, size * 0.36, 0, Math.PI * 2);
    ctx.fillStyle = '#dc2626';
    ctx.fill();
    return ctx.getImageData(0, 0, size, size);
}

async function showRecording() {
    await chrome.action.setPopup({ popup: '' });
    await chrome.action.setIcon({ imageData: { 16: recIcon(16), 32: recIcon(32) } });
    await chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
    await chrome.action.setBadgeTextColor?.({ color: '#ffffff' });
    await chrome.action.setBadgeText({ text: '0:00' });
    await chrome.action.setTitle({ title: msg('gifRecordingTitle', 'Recording — click to stop') });
}

async function restoreAction() {
    await chrome.action.setPopup({ popup: 'popup.html' });
    await chrome.action.setIcon({ path: { 16: 'icons/icon16.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' } });
    await chrome.action.setBadgeText({ text: '' });
    await chrome.action.setTitle({ title: msg('appName', 'Lumoshot') });
}

// ─── Start / stop ───

let finishing = false;

async function startRecording(streamId: string, tabId: number): Promise<{ ok: boolean; error?: string }> {
    if (await getState()) return { ok: false, error: 'already-recording' };
    const tab = await chrome.tabs.get(tabId);
    await ensureOffscreen();
    const res = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'GIF_OFFSCREEN_START', streamId }).catch((err) => ({ ok: false, error: String(err) }));
    if (!res?.ok) {
        await closeOffscreen();
        return { ok: false, error: res?.error ?? 'start-failed' };
    }
    await setState({ tabId, windowId: tab.windowId, tabIndex: tab.index, startedAt: Date.now() });
    await showRecording();
    return { ok: true };
}

async function stopRecording() {
    const state = await getState();
    if (!state || finishing) return;
    const res = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'GIF_OFFSCREEN_STOP' }).catch(() => null);
    await finishRecording((res?.result as RecorderResult | null) ?? null);
}

// Puts the icon back and opens the GIF editor. Runs once per recording, no
// matter whether the user stopped it or it stopped by itself.
async function finishRecording(result: RecorderResult | null) {
    if (finishing) return;
    finishing = true;
    try {
        const state = await getState();
        if (!state) return;
        await clearState();
        await closeOffscreen();
        await restoreAction();
        if (!result?.recordingId) return;
        const url = `gif.html?recording=${result.recordingId}`;
        try {
            await chrome.tabs.create({ url, windowId: state.windowId, index: state.tabIndex + 1, active: true });
        } catch {
            await chrome.tabs.create({ url, active: true });
        }
    } finally {
        finishing = false;
    }
}

// After an extension reload or crash the recorder is gone; don't leave the
// icon stuck in REC mode.
async function recoverStaleRecording() {
    if ((await getState()) && !(await hasOffscreen())) {
        await clearState();
        await restoreAction();
    }
}

export function registerGifRecording() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (!message || message.target === 'offscreen') return;
        if (message.type === 'GIF_START') {
            startRecording(message.streamId, message.tabId).then(sendResponse, (err) => sendResponse({ ok: false, error: String(err) }));
            return true;
        }
        if (message.type === 'GIF_TICK') {
            chrome.action.setBadgeText({ text: formatBadgeTime(message.elapsedMs) });
        }
        if (message.type === 'GIF_AUTO_STOPPED') {
            finishRecording(message.result ?? null);
        }
    });

    chrome.action.onClicked.addListener(() => {
        stopRecording();
    });

    chrome.tabs.onRemoved.addListener(async (tabId) => {
        if ((await getState())?.tabId === tabId) stopRecording();
    });

    recoverStaleRecording();
}
