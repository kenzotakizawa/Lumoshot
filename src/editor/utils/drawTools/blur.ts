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

    const shape = new Rect({
        left: pointer.x,
        top: pointer.y,
        width: 0,
        height: 0,
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
    _canvas: Canvas,
    pointer: { x: number; y: number },
    ctx: DrawToolContext
) {
    const shape = ctx.currentShape.current as Rect;

    const minX = Math.min(pointer.x, ctx.startX.current);
    const maxX = Math.max(pointer.x, ctx.startX.current);
    const minY = Math.min(pointer.y, ctx.startY.current);
    const maxY = Math.max(pointer.y, ctx.startY.current);

    shape.set({
        left: minX,
        top: minY,
        width: maxX - minX,
        height: maxY - minY
    });
    shape.setCoords();

    if (shape.fill instanceof Pattern) {
        const m = shape.calcTransformMatrix();
        shape.fill.patternTransform = util.invertTransform(m);
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
