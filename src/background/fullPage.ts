import { MAX_DEVICE_HEIGHT, MAX_DEVICE_PIXELS, planCapture, planStitch, stripPhase, type StripPhase } from './fullPagePlan';

// Full-page (scrolling) screenshot: scroll the page one viewport at a time,
// capture each with captureVisibleTab, and stitch the strips into one image
// here in the service worker (OffscreenCanvas), so the editor just receives an
// ordinary captured image.
//
// The page-side helpers below run in the page via chrome.scripting
// (executeScript serializes the function), so they must be self-contained:
// no references to anything outside their own body.

interface PageMetrics {
    pageHeight: number;
    viewportHeight: number;
    viewportWidth: number;
    dpr: number;
    innerScroller: boolean;
}

export interface FullPageResult {
    dataUrl: string;
    notice?: string;
}

// ─── Page-side helpers (self-contained) ───────────────────────────────

function pagePrepare(): void {
    const w = window as any;
    if (w.__lumoshotFP) return;
    const style = document.createElement('style');
    style.id = '__lumoshot_fp_style';
    // No smooth scrolling (positions must be exact) and no scrollbar in the strips.
    style.textContent = 'html,body{scroll-behavior:auto!important}html{scrollbar-width:none!important}html::-webkit-scrollbar,body::-webkit-scrollbar{display:none!important}';
    document.documentElement.appendChild(style);

    // Fixed/sticky elements, classified by which half of the viewport they sit in.
    const vh = window.innerHeight;
    const fixed: Array<{ el: HTMLElement; anchor: 'top' | 'bottom'; prev: string; prevPriority: string }> = [];
    document.querySelectorAll<HTMLElement>('body *').forEach((el) => {
        const cs = getComputedStyle(el);
        if (cs.position !== 'fixed' && cs.position !== 'sticky') return;
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        fixed.push({
            el,
            anchor: r.top + r.height / 2 < vh / 2 ? 'top' : 'bottom',
            prev: el.style.getPropertyValue('visibility'),
            prevPriority: el.style.getPropertyPriority('visibility'),
        });
    });
    w.__lumoshotFP = { x: window.scrollX, y: window.scrollY, fixed };
}

function pageMeasure(): PageMetrics {
    const doc = document.documentElement;
    const body = document.body;
    const vh = window.innerHeight;
    const pageHeight = Math.max(doc.scrollHeight, body ? body.scrollHeight : 0);
    // Apps that scroll an inner element instead of the page (Gmail, Notion…)
    let innerScroller = false;
    if (pageHeight <= vh + 1) {
        const all = document.querySelectorAll<HTMLElement>('body *');
        for (let i = 0; i < all.length && i < 20000; i++) {
            const el = all[i];
            if (el.clientHeight < vh * 0.5 || el.scrollHeight <= el.clientHeight + 100) continue;
            const oy = getComputedStyle(el).overflowY;
            if (oy === 'auto' || oy === 'scroll') {
                innerScroller = true;
                break;
            }
        }
    }
    return { pageHeight, viewportHeight: vh, viewportWidth: window.innerWidth, dpr: window.devicePixelRatio || 1, innerScroller };
}

function pageSetPhase(phase: string): void {
    const st = (window as any).__lumoshotFP;
    if (!st) return;
    for (const f of st.fixed) {
        const visible = phase === 'only' || (phase === 'first' && f.anchor === 'top') || (phase === 'last' && f.anchor === 'bottom');
        if (visible) {
            if (f.prev) f.el.style.setProperty('visibility', f.prev, f.prevPriority);
            else f.el.style.removeProperty('visibility');
        } else {
            f.el.style.setProperty('visibility', 'hidden', 'important');
        }
    }
}

function pageScrollTo(y: number): Promise<number> {
    window.scrollTo(0, y);
    // Let the page lay out and paint (and lazy content settle) before capturing.
    return new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => resolve(window.scrollY), 150)));
    });
}

// Jump to the bottom and back once so lazy-loaded images/sections load.
function pageWarmUp(): Promise<void> {
    const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    window.scrollTo(0, Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0));
    return wait(400).then(() => {
        window.scrollTo(0, 0);
        return wait(300);
    });
}

function pageRestore(): void {
    const w = window as any;
    const st = w.__lumoshotFP;
    if (st) {
        for (const f of st.fixed) {
            if (f.prev) f.el.style.setProperty('visibility', f.prev, f.prevPriority);
            else f.el.style.removeProperty('visibility');
        }
        window.scrollTo(st.x, st.y);
        delete w.__lumoshotFP;
    }
    document.getElementById('__lumoshot_fp_style')?.remove();
}

// ─── Service-worker side ──────────────────────────────────────────────

// captureVisibleTab is limited to 2 calls per second.
const MIN_CAPTURE_INTERVAL_MS = 550;

const isJa = () => (chrome.i18n.getUILanguage?.() || '').toLowerCase().startsWith('ja');
const msg = (ja: string, en: string) => (isJa() ? ja : en);

async function runInPage<A extends unknown[], R>(tabId: number, func: (...args: A) => R, ...args: A): Promise<Awaited<R>> {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: func as any, args: args as any });
    return res?.result as Awaited<R>;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
}

async function setBadge(tabId: number, text: string) {
    try {
        await chrome.action.setBadgeBackgroundColor({ color: '#4f46e5' });
        await chrome.action.setBadgeText({ tabId, text });
    } catch {
        // Badge is cosmetic.
    }
}

async function captureVisible(windowId: number): Promise<string> {
    return chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
}

export async function captureFullPage(tab: chrome.tabs.Tab): Promise<FullPageResult | null> {
    const tabId = tab.id!;
    const windowId = tab.windowId;

    // Pages extensions can't script (chrome://, the Web Store…): fall back to
    // the visible area.
    try {
        await runInPage(tabId, pageScrollTo, 0);
        await runInPage(tabId, pagePrepare);
    } catch (err) {
        console.warn('Full-page capture not possible on this page', err);
        try {
            return {
                dataUrl: await captureVisible(windowId),
                notice: msg('このページはページ全体の撮影に対応していないため、表示範囲を撮影しました。', 'This page can’t be captured in full, so the visible area was captured.'),
            };
        } catch (e) {
            console.error('Visible capture failed', e);
            await setBadge(tabId, '!');
            setTimeout(() => setBadge(tabId, ''), 3000);
            return null;
        }
    }

    let lastCapture = 0;
    const throttledCapture = async () => {
        const wait = lastCapture + MIN_CAPTURE_INTERVAL_MS - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        lastCapture = Date.now();
        return captureVisible(windowId);
    };

    try {
        await runInPage(tabId, pageWarmUp);
        const m = await runInPage(tabId, pageMeasure);

        // Planned with devicePixelRatio; the real scale comes from the first strip.
        const plan = planCapture(m.pageHeight, m.viewportHeight, m.dpr, Math.round(m.viewportWidth * m.dpr));
        const count = plan.scrollPositions.length;
        const strips: string[] = [];
        const actualYs: number[] = [];

        for (let i = 0; i < count; i++) {
            await setBadge(tabId, count > 1 ? `${i + 1}/${count}` : '…');
            await runInPage(tabId, pageSetPhase, stripPhase(i, count) as StripPhase);
            actualYs.push(await runInPage(tabId, pageScrollTo, plan.scrollPositions[i]));
            strips.push(await throttledCapture());
        }

        await runInPage(tabId, pageRestore).catch(() => {});

        // Stitch. `scale` = strip px per CSS px (measured), `outScale` = output
        // px per CSS px (lower than `scale` when a long page is scaled down).
        const bitmaps = await Promise.all(strips.map(async (d) => createImageBitmap(await (await fetch(d)).blob())));
        const scale = bitmaps[0].height / m.viewportHeight;
        const stripWidth = bitmaps[0].width;
        // The plan assumed devicePixelRatio; if the strips came out at another
        // scale, still keep the output within the size limits.
        const cssWidth = stripWidth / scale;
        const outScale = Math.min(
            scale * plan.outputScale,
            MAX_DEVICE_HEIGHT / plan.captureHeight,
            Math.sqrt(MAX_DEVICE_PIXELS / (cssWidth * plan.captureHeight)),
        );
        const width = Math.round(cssWidth * outScale);
        const height = Math.round(plan.captureHeight * outScale);
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('No 2D context');
        ctx.imageSmoothingQuality = 'high';
        for (const op of planStitch(actualYs, m.viewportHeight, plan.captureHeight)) {
            const bmp = bitmaps[op.strip];
            const srcStart = Math.round(op.srcY * scale);
            const srcEnd = Math.min(bmp.height, Math.round((op.srcY + op.height) * scale));
            const dstStart = Math.round(op.dstY * outScale);
            const dstEnd = Math.round((op.dstY + op.height) * outScale);
            if (srcEnd > srcStart && dstEnd > dstStart) {
                ctx.drawImage(bmp, 0, srcStart, stripWidth, srcEnd - srcStart, 0, dstStart, width, dstEnd - dstStart);
            }
        }
        bitmaps.forEach((b) => b.close());
        const dataUrl = await blobToDataUrl(await canvas.convertToBlob({ type: 'image/png' }));

        let notice: string | undefined;
        if (count === 1 && m.innerScroller) {
            notice = msg('このページは内側の枠がスクロールするため、表示範囲のみ撮影しました。', 'This page scrolls inside a panel, so only the visible area was captured.');
        } else if (plan.truncated) {
            notice = msg(`ページが非常に長いため、上から約${plan.captureHeight.toLocaleString()}pxまでを撮影しました。`, `The page is extremely long, so the top ${plan.captureHeight.toLocaleString()}px were captured.`);
        } else if (outScale < scale - 0.01) {
            notice = msg('ページが長いため、画像の解像度を下げてページ全体を撮影しました。', 'The page is long, so it was captured in full at a reduced resolution.');
        }
        await setBadge(tabId, '');
        return { dataUrl, notice };
    } catch (err) {
        console.error('Full-page capture failed', err);
        await runInPage(tabId, pageRestore).catch(() => {});
        await setBadge(tabId, '!');
        setTimeout(() => setBadge(tabId, ''), 3000);
        return null;
    }
}
