import { Pattern, util } from 'fabric';
import type { Canvas, FabricObject, TMat2D } from 'fabric';

// The "塗りつぶし" (redact) tool. Objects keep their legacy marker `isBlur`
// (saved data depends on it) and add how they hide what's underneath:
//   fill   — solid color (default; the only mode that leaves nothing to read)
//   mosaic — pixelated copy of the image layers under the shape
//   blur   — blurred copy (looks soft, but large text can stay legible)
// Only the mode and strength are stored. The mosaic/blur imagery is rebuilt
// from the image layers whenever it's needed, so it never bloats undo history
// or autosave, and it stays aligned after undo/restore.

export type RedactMode = 'fill' | 'mosaic' | 'blur';

export const REDACT_MODES: RedactMode[] = ['fill', 'mosaic', 'blur'];
export const REDACT_PROPS = ['isBlur', 'redactMode', 'redactStrength'];
export const DEFAULT_REDACT_STRENGTH = 12;
export const REDACT_STRENGTH_RANGE = { min: 4, max: 40 } as const;

const PLACEHOLDER_FILL = '#000000';

export function isRedaction(obj: FabricObject | null | undefined): boolean {
    return !!obj?.get?.('isBlur');
}

export function getRedactMode(obj: FabricObject): RedactMode {
    const mode = obj.get('redactMode');
    return mode === 'mosaic' || mode === 'blur' ? mode : 'fill';
}

export function getRedactStrength(obj: FabricObject): number {
    const s = Number(obj.get('redactStrength'));
    return Number.isFinite(s) && s > 0 ? s : DEFAULT_REDACT_STRENGTH;
}

// Block-average pixelation of RGBA data (blocks anchored at 0,0). Pure, so it
// can be unit-tested without a canvas.
export function pixelate(data: Uint8ClampedArray, width: number, height: number, block: number): Uint8ClampedArray<ArrayBuffer> {
    const out = new Uint8ClampedArray(data.length);
    const size = Math.max(1, Math.round(block));
    for (let by = 0; by < height; by += size) {
        for (let bx = 0; bx < width; bx += size) {
            const xEnd = Math.min(bx + size, width);
            const yEnd = Math.min(by + size, height);
            let r = 0, g = 0, b = 0, a = 0;
            for (let y = by; y < yEnd; y++) {
                for (let x = bx; x < xEnd; x++) {
                    const i = (y * width + x) * 4;
                    r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3];
                }
            }
            const n = (xEnd - bx) * (yEnd - by);
            r /= n; g /= n; b /= n; a /= n;
            for (let y = by; y < yEnd; y++) {
                for (let x = bx; x < xEnd; x++) {
                    const i = (y * width + x) * 4;
                    out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = a;
                }
            }
        }
    }
    return out;
}

// ─── Source imagery (cached per canvas) ───────────────────────────────

interface SourceCache {
    signature: string;
    base: HTMLCanvasElement;
    variants: Map<string, HTMLCanvasElement>;
}

const caches = new WeakMap<Canvas, SourceCache>();
const elementIds = new WeakMap<object, number>();
let nextElementId = 1;
const elementId = (el: object) => {
    let id = elementIds.get(el);
    if (!id) {
        id = nextElementId++;
        elementIds.set(el, id);
    }
    return id;
};

const imageLayers = (canvas: Canvas) =>
    canvas.getObjects().filter((o: any) => (o.get('isBackground') || o.get('isAfterImage')) && o.getElement);

const layersSignature = (layers: FabricObject[]) =>
    layers.map((o: any) => [elementId(o.getElement()), o.left, o.top, o.scaleX, o.scaleY, o.angle, o.width, o.height, o.cropX, o.cropY].join(':')).join('|');

// Composite of just the image layers (background + Before/After image), in
// document coordinates with the origin at 0,0.
function buildBase(layers: FabricObject[]): HTMLCanvasElement {
    let right = 1, bottom = 1;
    for (const o of layers) {
        const r = o.getBoundingRect();
        right = Math.max(right, r.left + r.width);
        bottom = Math.max(bottom, r.top + r.height);
    }
    const base = document.createElement('canvas');
    base.width = Math.ceil(right);
    base.height = Math.ceil(bottom);
    const ctx = base.getContext('2d');
    if (!ctx) return base;
    for (const o of layers as any[]) {
        const m = o.calcTransformMatrix() as TMat2D;
        ctx.save();
        ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
        const w = o.width, h = o.height;
        ctx.drawImage(o.getElement(), o.cropX || 0, o.cropY || 0, w, h, -w / 2, -h / 2, w, h);
        ctx.restore();
    }
    return base;
}

function buildVariant(base: HTMLCanvasElement, mode: Exclude<RedactMode, 'fill'>, strength: number): HTMLCanvasElement {
    const out = document.createElement('canvas');
    out.width = base.width;
    out.height = base.height;
    const ctx = out.getContext('2d', { willReadFrequently: mode === 'mosaic' });
    if (!ctx) return out;
    if (mode === 'mosaic') {
        const src = base.getContext('2d')?.getImageData(0, 0, base.width, base.height);
        if (src) {
            ctx.putImageData(new ImageData(pixelate(src.data, src.width, src.height, strength), src.width, src.height), 0, 0);
        }
    } else {
        // Blurring pulls in transparency at the image edges; underlay a flat
        // tone so the result stays opaque and nothing beneath shows through.
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, out.width, out.height);
        ctx.filter = `blur(${strength}px)`;
        ctx.drawImage(base, 0, 0);
        ctx.filter = 'none';
    }
    return out;
}

function getVariant(canvas: Canvas, mode: Exclude<RedactMode, 'fill'>, strength: number): HTMLCanvasElement | null {
    const layers = imageLayers(canvas);
    if (layers.length === 0) return null;
    const signature = layersSignature(layers);
    let cache = caches.get(canvas);
    if (!cache || cache.signature !== signature) {
        cache = { signature, base: buildBase(layers), variants: new Map() };
        caches.set(canvas, cache);
    }
    const key = `${mode}:${strength}`;
    let variant = cache.variants.get(key);
    if (!variant) {
        variant = buildVariant(cache.base, mode, strength);
        cache.variants.set(key, variant);
    }
    return variant;
}

// ─── Applying to objects ──────────────────────────────────────────────

// fabric paints a pattern in the object's local space shifted by
// (-width/2, -height/2) and then by patternTransform. Choose patternTransform
// so pattern pixel (x, y) lands on document pixel (x, y).
function alignPattern(obj: FabricObject, pattern: Pattern) {
    const m = obj.calcTransformMatrix() as TMat2D;
    const toLocal = util.invertTransform(m);
    pattern.patternTransform = util.multiplyTransformMatrices([1, 0, 0, 1, (obj.width ?? 0) / 2, (obj.height ?? 0) / 2], toLocal);
}

// Sets the object's fill for its mode. `color` is used for (or when switching
// to) the solid mode; otherwise the existing solid color is kept.
export function applyRedaction(canvas: Canvas, obj: FabricObject, color?: string) {
    const mode = getRedactMode(obj);
    if (mode === 'fill') {
        const solid = color ?? (typeof obj.fill === 'string' ? obj.fill : PLACEHOLDER_FILL);
        obj.set({ fill: solid, stroke: solid });
        return;
    }
    const source = getVariant(canvas, mode, getRedactStrength(obj));
    if (!source) return;
    let pattern = obj.fill instanceof Pattern && obj.fill.source === source ? obj.fill : null;
    if (!pattern) {
        pattern = new Pattern({ source, repeat: 'no-repeat' });
        obj.set({ fill: pattern, stroke: null });
    }
    alignPattern(obj, pattern);
    obj.set('dirty', true);
}

// Snap a finished redaction to whole document pixels and bake any scaling
// into its size. Fractional offsets (pointer math at non-100% zoom) or a
// leftover scale make the pattern resample, which smears the crisp mosaic
// block edges in the exported image. Skipped while the object is inside a
// multi-selection (its coordinates are relative to the selection then) or
// rotated.
export function normalizeRedactionGeometry(obj: FabricObject) {
    if ((obj as any).group || obj.angle) return;
    const width = Math.max(1, Math.round((obj.width ?? 0) * (obj.scaleX ?? 1)));
    const height = Math.max(1, Math.round((obj.height ?? 0) * (obj.scaleY ?? 1)));
    obj.set({
        left: Math.round(obj.left ?? 0),
        top: Math.round(obj.top ?? 0),
        width,
        height,
        scaleX: 1,
        scaleY: 1,
    });
    obj.setCoords();
}

// Re-applies every mosaic/blur redaction (after load/undo, or when the image
// layers or object positions changed in bulk: crop, resize, frame toggle…).
export function refreshRedactions(canvas: Canvas) {
    for (const obj of canvas.getObjects()) {
        if (isRedaction(obj) && getRedactMode(obj) !== 'fill') applyRedaction(canvas, obj);
    }
}

// Patterns would serialize their whole source canvas as a data URL. Swap them
// for a placeholder while taking a snapshot; call the returned function to
// put them back (synchronously, before anything re-renders).
export function withoutRedactionPatterns<T>(canvas: Canvas, fn: () => T): T {
    const swapped: Array<[FabricObject, unknown]> = [];
    for (const obj of canvas.getObjects()) {
        if (isRedaction(obj) && obj.fill instanceof Pattern) {
            swapped.push([obj, obj.fill]);
            obj.fill = PLACEHOLDER_FILL;
        }
    }
    try {
        return fn();
    } finally {
        for (const [obj, fill] of swapped) obj.fill = fill as Pattern;
    }
}
