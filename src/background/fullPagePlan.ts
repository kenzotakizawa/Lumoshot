// Pure planning for full-page (scrolling) screenshots. All values are CSS px
// unless noted; the caller multiplies by the capture's device-pixel scale.

// Keep the stitched image within what Chrome canvases (and the editor's memory)
// can comfortably handle. Canvases cap at 32767px per side; we also cap the
// total pixel count, since the editor holds several copies of the image.
export const MAX_DEVICE_HEIGHT = 32000;
export const MAX_DEVICE_PIXELS = 64 * 1024 * 1024;

export interface CapturePlan {
    // Document height that will be captured (may be less than the page's).
    captureHeight: number;
    // Whether the page was taller than what we can capture.
    truncated: boolean;
    // Scroll positions to visit, top to bottom.
    scrollPositions: number[];
}

// `scale` = device px per CSS px (devicePixelRatio, incl. page zoom),
// `deviceWidth` = width of one captured strip in device px.
export function planCapture(pageHeight: number, viewportHeight: number, scale: number, deviceWidth: number): CapturePlan {
    const vh = Math.max(1, Math.floor(viewportHeight));
    const maxByHeight = Math.floor(MAX_DEVICE_HEIGHT / scale);
    const maxByArea = Math.floor(MAX_DEVICE_PIXELS / Math.max(1, deviceWidth) / scale);
    const limit = Math.max(vh, Math.min(maxByHeight, maxByArea));
    const captureHeight = Math.max(vh, Math.min(Math.ceil(pageHeight), limit));
    const truncated = Math.ceil(pageHeight) > captureHeight;

    const scrollPositions: number[] = [];
    for (let y = 0; y < captureHeight; y += vh) {
        // The last strip is aligned to the bottom of the captured range so it
        // is a full viewport; the overlap is trimmed when stitching.
        scrollPositions.push(Math.min(y, captureHeight - vh));
    }
    return { captureHeight, truncated, scrollPositions: [...new Set(scrollPositions)] };
}

export interface DrawOp {
    strip: number;
    // Rows within the strip (CSS px from the strip's top)
    srcY: number;
    // Rows in the stitched image (CSS px from the document top)
    dstY: number;
    height: number;
}

// Given where each strip actually ended up (pages may clamp or round scroll
// positions), decide which rows of each strip go where, so every document row
// in [0, captureHeight) is drawn exactly once.
export function planStitch(actualScrollYs: number[], viewportHeight: number, captureHeight: number): DrawOp[] {
    const ops: DrawOp[] = [];
    let covered = 0;
    actualScrollYs.forEach((y, strip) => {
        const start = Math.max(covered, y);
        const end = Math.min(y + viewportHeight, captureHeight);
        if (end <= start) return;
        ops.push({ strip, srcY: start - y, dstY: start, height: end - start });
        covered = end;
    });
    return ops;
}

// Which fixed/sticky elements may be visible in a given strip: top-anchored
// ones only in the first strip, bottom-anchored ones only in the last, so
// headers, cookie bars and chat buttons don't repeat down the stitched page.
export type StripPhase = 'only' | 'first' | 'middle' | 'last';

export function stripPhase(index: number, count: number): StripPhase {
    if (count <= 1) return 'only';
    if (index === 0) return 'first';
    if (index === count - 1) return 'last';
    return 'middle';
}
