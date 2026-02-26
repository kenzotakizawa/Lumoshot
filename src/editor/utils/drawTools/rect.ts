import { Canvas, Rect } from 'fabric';
import type { DrawToolContext } from './types';

/**
 * mouseDown handler for rect / rounded-rect tools.
 */
export function rectMouseDown(
    canvas: Canvas,
    pointer: { x: number; y: number },
    ctx: DrawToolContext,
    isRounded: boolean
) {
    const { strokeColor, strokeWidth, controlConfig } = ctx;

    const rect = new Rect({
        left: pointer.x - strokeWidth / 2,
        top: pointer.y - strokeWidth / 2,
        originX: 'left',
        originY: 'top',
        width: strokeWidth, // Initialize with strokeWidth so inner is 0
        height: strokeWidth,
        fill: 'transparent',
        stroke: strokeColor,
        strokeWidth: strokeWidth,
        strokeUniform: true,
        selectable: false,
        evented: false,
        ...(isRounded ? { rx: 16, ry: 16 } : {}),
        ...controlConfig
    });
    ctx.currentShape.current = rect;
    canvas.add(rect);
}

/**
 * mouseMove handler for rect / rounded-rect tools.
 */
export function rectMouseMove(
    _canvas: Canvas,
    pointer: { x: number; y: number },
    ctx: DrawToolContext
) {
    const rect = ctx.currentShape.current as Rect;
    const { strokeWidth } = ctx;

    const minX = Math.min(pointer.x, ctx.startX.current);
    const maxX = Math.max(pointer.x, ctx.startX.current);
    const minY = Math.min(pointer.y, ctx.startY.current);
    const maxY = Math.max(pointer.y, ctx.startY.current);

    const dragWidth = maxX - minX;
    const dragHeight = maxY - minY;

    // Push path outward by half strokeWidth so the border is OUTSIDE the drag area
    rect.set({
        left: minX - strokeWidth / 2,
        top: minY - strokeWidth / 2,
        width: dragWidth + strokeWidth,
        height: dragHeight + strokeWidth
    });
}

/**
 * mouseUp handler for rect / rounded-rect tools.
 */
export function rectMouseUp(canvas: Canvas, ctx: DrawToolContext) {
    const rect = ctx.currentShape.current as Rect;
    if (rect.width! < 5 && rect.height! < 5) {
        canvas.remove(rect);
    } else {
        rect.set({ selectable: true, evented: true });
    }
}
