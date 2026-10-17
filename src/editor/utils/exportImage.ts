import type { Canvas, TMat2D } from 'fabric';

export type ExportFormat = 'png' | 'jpeg' | 'webp';

export interface ExportOptions {
    format: ExportFormat;
    // 0..1, only used by lossy formats (jpeg / webp)
    quality: number;
    // Output size relative to the original image pixels (1 = same pixels)
    scale: number;
}

export const EXPORT_FORMATS: Record<ExportFormat, { mime: string; ext: string; label: string; lossy: boolean }> = {
    png: { mime: 'image/png', ext: 'png', label: 'PNG', lossy: false },
    jpeg: { mime: 'image/jpeg', ext: 'jpg', label: 'JPEG', lossy: true },
    webp: { mime: 'image/webp', ext: 'webp', label: 'WebP', lossy: true },
};

export const EXPORT_SCALES = [0.5, 1, 2] as const;

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = { format: 'png', quality: 0.9, scale: 1 };

const STORAGE_KEY = 'lumoshot.exportOptions';

// Accepts anything (e.g. a parsed localStorage value) and returns valid options,
// falling back field by field to the defaults.
export function normalizeExportOptions(raw: unknown): ExportOptions {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const format = typeof r.format === 'string' && r.format in EXPORT_FORMATS
        ? (r.format as ExportFormat)
        : DEFAULT_EXPORT_OPTIONS.format;
    const quality = typeof r.quality === 'number' && Number.isFinite(r.quality)
        ? Math.min(1, Math.max(0.5, r.quality))
        : DEFAULT_EXPORT_OPTIONS.quality;
    const scale = typeof r.scale === 'number' && (EXPORT_SCALES as readonly number[]).includes(r.scale)
        ? r.scale
        : DEFAULT_EXPORT_OPTIONS.scale;
    return { format, quality, scale };
}

export function loadExportOptions(): ExportOptions {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return normalizeExportOptions(raw ? JSON.parse(raw) : null);
    } catch {
        return { ...DEFAULT_EXPORT_OPTIONS };
    }
}

export function saveExportOptions(options: ExportOptions): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
    } catch {
        // Private mode / blocked storage: the choice just won't be remembered.
    }
}

// lumoshot_20261017-104512.png
export function buildExportFileName(format: ExportFormat, date: Date = new Date()): string {
    const p = (n: number) => String(n).padStart(2, '0');
    const stamp = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
    return `lumoshot_${stamp}.${EXPORT_FORMATS[format].ext}`;
}

export function exportPixelSize(size: { width: number; height: number }, scale: number) {
    return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
}

// Paints the document (origin 0,0, `size` = original image pixels) into a fresh
// canvas at `scale`. The live canvas is not resized or repainted, so nothing
// flickers, and retina scaling is off so 1 means exactly the original pixels.
// after:render overlays (spotlight / zoom) draw into the ctx fabric passes them,
// so they land on this offscreen canvas too.
export function renderDocumentToCanvas(
    canvas: Canvas,
    size: { width: number; height: number },
    scale: number
): HTMLCanvasElement {
    const vpt = [...canvas.viewportTransform] as TMat2D;
    canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
    try {
        return canvas.toCanvasElement(scale, { left: 0, top: 0, width: size.width, height: size.height });
    } finally {
        canvas.viewportTransform = vpt;
        canvas.calcViewportBoundaries();
    }
}

export function encodeCanvas(source: HTMLCanvasElement, format: ExportFormat, quality: number): Promise<Blob> {
    let target = source;
    if (format === 'jpeg') {
        // JPEG has no alpha: transparent areas (e.g. rounded frame corners)
        // would otherwise turn black.
        target = document.createElement('canvas');
        target.width = source.width;
        target.height = source.height;
        const ctx = target.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, target.width, target.height);
            ctx.drawImage(source, 0, 0);
        }
    }
    const { mime, lossy } = EXPORT_FORMATS[format];
    return new Promise((resolve, reject) => {
        target.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode image'))),
            mime,
            lossy ? quality : undefined
        );
    });
}

export function downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = fileName;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Give the browser a moment to start the download before revoking.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
