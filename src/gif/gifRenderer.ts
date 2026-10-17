import { StaticCanvas } from 'fabric';
import type { Canvas } from 'fabric';
import { resolveAssetRefs } from '../editor/utils/snapshotAssets';
import { refreshRedactions, isRedaction, getRedactMode } from '../editor/utils/redaction';
import { spotlightAfterRender } from '../editor/utils/drawTools/spotlight';
import { zoomAfterRender } from '../editor/utils/drawTools/zoom';
import { renderDocumentToCanvas } from '../editor/utils/exportImage';
import { applyFrameVisibility, setBackgroundFrame } from './annotations';

// Renders GIF frames off screen from a snapshot of the editor document: the
// same annotations, with the background swapped for each recorded frame.
// Separate from the live canvas, so exporting never disturbs the editor.
export class GifFrameRenderer {
    private canvas: StaticCanvas;
    readonly size: { width: number; height: number };
    private hasImageRedactions: boolean;

    private constructor(canvas: StaticCanvas, size: { width: number; height: number }) {
        this.canvas = canvas;
        this.size = size;
        const c = canvas as unknown as Canvas;
        this.hasImageRedactions = canvas.getObjects().some((o) => isRedaction(o) && getRedactMode(o) !== 'fill');
        canvas.on('after:render', ({ ctx }) => {
            spotlightAfterRender(c, ctx);
            zoomAfterRender(c, ctx);
        });
    }

    static async create(state: string, assets: Record<string, string>): Promise<GifFrameRenderer> {
        const parsed = JSON.parse(state);
        const size = parsed.dimensions ?? { width: 800, height: 600 };
        const canvasData = parsed.canvasData ?? parsed;
        resolveAssetRefs(canvasData, (hash) => assets[hash]);
        const canvas = new StaticCanvas(document.createElement('canvas'), {
            width: size.width,
            height: size.height,
            enableRetinaScaling: false,
            renderOnAddRemove: false,
        });
        await canvas.loadFromJSON(canvasData);
        return new GifFrameRenderer(canvas, size);
    }

    // RGBA pixels of source frame `index` (shown as `frame`) at `scale`.
    render(frame: CanvasImageSource, index: number, scale: number): ImageData {
        const c = this.canvas as unknown as Canvas;
        setBackgroundFrame(c, frame);
        applyFrameVisibility(c, index);
        // Mosaic / blur are computed from the picture underneath.
        if (this.hasImageRedactions) refreshRedactions(c);
        const out = renderDocumentToCanvas(c, this.size, scale);
        const ctx = out.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('No 2D context');
        return ctx.getImageData(0, 0, out.width, out.height);
    }

    outputSize(scale: number) {
        return { width: Math.round(this.size.width * scale), height: Math.round(this.size.height * scale) };
    }

    dispose(): void {
        this.canvas.dispose();
    }
}
