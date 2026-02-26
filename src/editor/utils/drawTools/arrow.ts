import { Canvas, Line, Polygon, Group } from 'fabric';
import type { DrawToolContext } from './types';

/**
 * mouseDown handler for arrow tool.
 */
export function arrowMouseDown(
    canvas: Canvas,
    pointer: { x: number; y: number },
    ctx: DrawToolContext
) {
    const { strokeColor, strokeWidth } = ctx;

    const line = new Line([pointer.x, pointer.y, pointer.x, pointer.y], {
        stroke: strokeColor,
        strokeWidth: strokeWidth,
        selectable: false,
        evented: false,
    });

    const headLength = 15;
    const arrowHead = new Polygon([
        { x: 0, y: 0 },
        { x: -headLength, y: headLength / 2 },
        { x: -headLength, y: -headLength / 2 }
    ], {
        fill: strokeColor,
        selectable: false,
        evented: false,
        left: pointer.x,
        top: pointer.y,
        originX: 'center',
        originY: 'center'
    });

    ctx.currentShape.current = { line, arrowHead };
    canvas.add(line, arrowHead);
}

/**
 * mouseMove handler for arrow tool.
 */
export function arrowMouseMove(
    _canvas: Canvas,
    pointer: { x: number; y: number },
    ctx: DrawToolContext
) {
    const { line, arrowHead } = ctx.currentShape.current;

    line.set({
        x2: pointer.x,
        y2: pointer.y
    });

    // Calculate arrow head rotation
    const dx = pointer.x - ctx.startX.current;
    const dy = pointer.y - ctx.startY.current;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;

    arrowHead.set({
        left: pointer.x,
        top: pointer.y,
        angle: angle
    });

    line.setCoords();
    arrowHead.setCoords();
}

/**
 * mouseUp handler for arrow tool.
 */
export function arrowMouseUp(canvas: Canvas, ctx: DrawToolContext) {
    const { line, arrowHead } = ctx.currentShape.current;
    const dx = Math.abs(line.x2! - line.x1!);
    const dy = Math.abs(line.y2! - line.y1!);
    if (dx < 5 && dy < 5) {
        canvas.remove(line, arrowHead);
    } else {
        // Group them together so they can be selected and moved as one arrow
        canvas.remove(line, arrowHead);
        const arrowGroup = new Group([line, arrowHead], {
            selectable: true,
            evented: true,
            ...ctx.controlConfig
        });
        canvas.add(arrowGroup);
    }
}
