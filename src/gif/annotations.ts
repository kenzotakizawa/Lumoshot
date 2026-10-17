import type { Canvas, FabricObject } from 'fabric';

// GIF annotations: every annotation can be limited to a range of frames
// (`gifFrom`..`gifTo`, source frame indices, inclusive; missing = no limit).
// The document's background image object shows the current frame.

export interface FrameRange {
    from?: number;
    to?: number;
}

const isSystem = (o: FabricObject) => !!(o.get('isBackground') || o.get('isOutline') || o.get('isFrame'));

export function rangeOf(obj: FabricObject): FrameRange {
    const from = obj.get('gifFrom');
    const to = obj.get('gifTo');
    return {
        from: typeof from === 'number' ? from : undefined,
        to: typeof to === 'number' ? to : undefined,
    };
}

export function isVisibleAt(range: FrameRange, index: number): boolean {
    return (range.from === undefined || index >= range.from) && (range.to === undefined || index <= range.to);
}

// Annotations the user works with (zoom sources follow their panel).
export function annotationObjects(canvas: Canvas): FabricObject[] {
    return canvas.getObjects().filter((o) => !isSystem(o) && !o.get('isZoomSource') && !o.get('isCropRect'));
}

// Shows each annotation only on the frames it belongs to.
export function applyFrameVisibility(canvas: Canvas, index: number): void {
    const objects = canvas.getObjects();
    const panelRanges = new Map<string, FrameRange>();
    for (const o of objects) if (o.get('isZoomPanel')) panelRanges.set(o.get('zoomId'), rangeOf(o));
    for (const o of objects) {
        if (isSystem(o)) continue;
        const range = o.get('isZoomSource') ? panelRanges.get(o.get('zoomId')) ?? rangeOf(o) : rangeOf(o);
        o.visible = isVisibleAt(range, index);
    }
}

// The selected objects plus what belongs to them (a zoom panel's source).
export function withRelated(canvas: Canvas, objects: FabricObject[]): FabricObject[] {
    const out = new Set(objects);
    for (const o of objects) {
        if (!o.get('isZoomPanel')) continue;
        const id = o.get('zoomId');
        canvas.getObjects().filter((s) => s.get('isZoomSource') && s.get('zoomId') === id).forEach((s) => out.add(s));
    }
    return [...out];
}

export function setRange(objects: FabricObject[], range: FrameRange): void {
    for (const o of objects) {
        o.set('gifFrom', range.from);
        o.set('gifTo', range.to);
    }
}

// Puts `source` (a decoded frame) into the background image object without
// replacing its original element, so snapshots keep serializing the same
// (first) frame instead of re-encoding a new image for every frame shown.
export function setBackgroundFrame(canvas: Canvas, source: CanvasImageSource): boolean {
    const bg = canvas.getObjects().find((o) => o.get('isBackground')) as (FabricObject & { _element?: unknown }) | undefined;
    if (!bg) return false;
    bg._element = source;
    bg.set('dirty', true);
    return true;
}

// The background object in a snapshot holds a placeholder instead of image
// data; the first frame goes back in when the editor opens.
export const FRAME_PLACEHOLDER = 'lumoshot:gif-frame';

// Snapshot → stored annotations: the frame image is dropped (it's in the
// recording) and only the other images' data is kept.
export function stripFrameFromState(state: string, assets: Record<string, string>): { state: string; assets: Record<string, string> } {
    const parsed = JSON.parse(state);
    const canvasData = parsed.canvasData ?? parsed;
    const dropped = new Set<string>();
    let seenBackground = false;
    // A recording has exactly one frame image; drop any extra copy.
    canvasData.objects = (canvasData.objects ?? []).filter((o: { isBackground?: boolean; src?: unknown }) => {
        if (!o?.isBackground) return true;
        if (typeof o.src === 'string' && o.src.startsWith('asset:')) dropped.add(o.src.slice(6));
        if (seenBackground) return false;
        seenBackground = true;
        o.src = FRAME_PLACEHOLDER;
        return true;
    });
    const kept: Record<string, string> = {};
    for (const [hash, data] of Object.entries(assets)) if (!dropped.has(hash)) kept[hash] = data;
    return { state: JSON.stringify(parsed), assets: kept };
}

export function restoreFrameInState(state: string, frameDataUrl: string): string {
    const parsed = JSON.parse(state);
    const canvasData = parsed.canvasData ?? parsed;
    for (const o of canvasData.objects ?? []) {
        if (o?.isBackground) o.src = frameDataUrl;
    }
    return JSON.stringify(parsed);
}
