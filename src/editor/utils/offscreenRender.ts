import { StaticCanvas } from 'fabric';
import type { Canvas } from 'fabric';
import { resolveAssetRefs } from './snapshotAssets';
import { refreshRedactions } from './redaction';
import { spotlightAfterRender } from './drawTools/spotlight';
import { zoomAfterRender } from './drawTools/zoom';
import { encodeCanvas, renderDocumentToCanvas, type ExportOptions } from './exportImage';

// Renders a saved project (snapshot JSON + its assets) to an image without
// opening it in the editor — for exporting several projects at once.
// Uses the same pieces as the live editor: redaction imagery is rebuilt and
// the spotlight/zoom overlays draw into whatever context fabric renders to.
export async function renderStateToBlob(state: string, assets: Record<string, string>, options: ExportOptions): Promise<Blob> {
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
    try {
        await canvas.loadFromJSON(canvasData);
        // These helpers only use the StaticCanvas part of Canvas.
        const c = canvas as unknown as Canvas;
        refreshRedactions(c);
        canvas.on('after:render', ({ ctx }) => {
            spotlightAfterRender(c, ctx);
            zoomAfterRender(c, ctx);
        });
        return await encodeCanvas(renderDocumentToCanvas(c, size, options.scale), options.format, options.quality);
    } finally {
        canvas.dispose();
    }
}
