import { Canvas, Ellipse } from 'fabric';
import type { DrawToolContext } from './types';

/**
 * mouseDown handler for the ellipse tool.
 */
export function ellipseMouseDown(
    canvas: Canvas,
    pointer: { x: number; y: number },
    ctx: DrawToolContext
) {
    const { strokeColor, strokeWidth, controlConfig } = ctx;

    const ellipse = new Ellipse({
        left: pointer.x - strokeWidth / 2,
        top: pointer.y - strokeWidth / 2,
        originX: 'left',
        originY: 'top',
        rx: strokeWidth / 2, // Initialize so the inner area is 0 (mirrors rect.ts)
        ry: strokeWidth / 2,
        fill: 'transparent',
        stroke: strokeColor,
        strokeWidth: strokeWidth,
        strokeUniform: true,
        selectable: false,
        evented: false,
        ...controlConfig
    });
    ctx.currentShape.current = ellipse;
    canvas.add(ellipse);
}

/**
 * mouseMove handler for the ellipse tool.
 */
export function ellipseMouseMove(
    _canvas: Canvas,
    pointer: { x: number; y: number },
    ctx: DrawToolContext
) {
    const ellipse = ctx.currentShape.current as Ellipse;
    const { strokeWidth } = ctx;

    const minX = Math.min(pointer.x, ctx.startX.current);
    const maxX = Math.max(pointer.x, ctx.startX.current);
    const minY = Math.min(pointer.y, ctx.startY.current);
    const maxY = Math.max(pointer.y, ctx.startY.current);

    // Same outward offset as rect.ts so the stroke sits OUTSIDE the drag area
    ellipse.set({
        left: minX - strokeWidth / 2,
        top: minY - strokeWidth / 2,
        rx: (maxX - minX + strokeWidth) / 2,
        ry: (maxY - minY + strokeWidth) / 2
    });
}

/**
 * mouseUp handler for the ellipse tool.
 */
export function ellipseMouseUp(canvas: Canvas, ctx: DrawToolContext) {
    const ellipse = ctx.currentShape.current as Ellipse;
    if (ellipse.rx * 2 < 5 && ellipse.ry * 2 < 5) {
        canvas.remove(ellipse);
    } else {
        ellipse.set({ selectable: true, evented: true });
    }
}
