import { Canvas, Rect } from 'fabric';
import type { DrawToolContext } from './types';

/**
 * mouseDown handler for blur-rect tool.
 */
export function blurMouseDown(
    canvas: Canvas,
    pointer: { x: number; y: number },
    ctx: DrawToolContext
) {
    const { controlConfig, strokeColor } = ctx;
    const fillColor = strokeColor || '#000000';

    const sw = 0;
    const shape = new Rect({
        left: pointer.x - sw / 2,
        top: pointer.y - sw / 2,
        originX: 'left',
        originY: 'top',
        width: sw,
        height: sw,
        rx: 8,
        ry: 8,
        fill: fillColor,
        stroke: fillColor,
        strokeWidth: 0,
        selectable: false,
        evented: false,
        ...controlConfig
    });

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
