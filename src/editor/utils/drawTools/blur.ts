import { Canvas, Rect, Pattern, util } from 'fabric';
import type { DrawToolContext } from './types';

/**
 * mouseDown handler for blur-rect tool.
 */
export function blurMouseDown(
    canvas: Canvas,
    pointer: { x: number; y: number },
    ctx: DrawToolContext
) {
    const { controlConfig, blurCanvas } = ctx;
    if (!blurCanvas) return;

    const pattern = new Pattern({
        source: blurCanvas,
        repeat: 'no-repeat',
    });

    const sw = 1; // blur border is always 1px
    const shape = new Rect({
        left: pointer.x - sw / 2,
        top: pointer.y - sw / 2,
        originX: 'left',
        originY: 'top',
        width: sw,
        height: sw,
        rx: 8,
        ry: 8,
        fill: pattern,
        stroke: 'rgba(0,0,0,0.1)', // Subtle border
        strokeWidth: 1,
        selectable: false,
        evented: false,
        ...controlConfig
    });

    // Keep the pattern absolutely positioned to the canvas, regardless of object transform
    const alignPattern = () => {
        if (shape.fill instanceof Pattern) {
            const m = shape.calcTransformMatrix();
            const invertM = util.invertTransform(m);

            // Offset pattern by base background position if framed
            const baseImg = canvas.getObjects().find((o: any) => o.get('isBackground'));
            if (baseImg) {
                invertM[4] += baseImg.left || 0;
                invertM[5] += baseImg.top || 0;
            }

            shape.fill.patternTransform = invertM;
        }
    };

    // Track object modifications to maintain pattern alignment
    shape.on('moving', alignPattern);
    shape.on('scaling', alignPattern);
    shape.on('rotating', alignPattern);
    shape.on('skewing', alignPattern);

    alignPattern(); // Apply initial

    shape.set('isBlur', true);
    ctx.currentShape.current = shape;
    canvas.add(shape);
}

/**
 * mouseMove handler for blur-rect tool.
 */
export function blurMouseMove(
    canvas: Canvas,
    pointer: { x: number; y: number },
    ctx: DrawToolContext
) {
    const shape = ctx.currentShape.current as Rect;
    const sw = shape.strokeWidth ?? 1;

    const minX = Math.min(pointer.x, ctx.startX.current);
    const maxX = Math.max(pointer.x, ctx.startX.current);
    const minY = Math.min(pointer.y, ctx.startY.current);
    const maxY = Math.max(pointer.y, ctx.startY.current);

    // Mirror rect.ts: offset by sw/2 so the stroke's inner edge aligns with the drag area
    shape.set({
        left: minX - sw / 2,
        top: minY - sw / 2,
        width: maxX - minX + sw,
        height: maxY - minY + sw
    });
    shape.setCoords();

    // Mirror blurMouseDown's alignPattern: include baseImg offset so the blur fill
    // tracks the correct region of the background image during drag
    if (shape.fill instanceof Pattern) {
        const m = shape.calcTransformMatrix();
        const invertM = util.invertTransform(m);
        const baseImg = canvas.getObjects().find((o: any) => o.get('isBackground'));
        if (baseImg) {
            invertM[4] += baseImg.left || 0;
            invertM[5] += baseImg.top || 0;
        }
        shape.fill.patternTransform = invertM;
    }
}

/**
 * mouseUp handler for blur-rect tool.
 * Reuses the same logic as rect (min-size check).
 */
export function blurMouseUp(canvas: Canvas, ctx: DrawToolContext) {
    const rect = ctx.currentShape.current as Rect;
    if (rect.width! < 5 && rect.height! < 5) {
        canvas.remove(rect);
    } else {
        rect.set({ selectable: true, evented: true });
    }
}
