import { Canvas, Rect } from 'fabric';
import type { DrawToolContext } from './types';
import { applyRedaction, DEFAULT_REDACT_STRENGTH, normalizeRedactionGeometry } from '../redaction';

// The "塗りつぶし" (redact) tool. File/ids keep the legacy "blur" name because
// saved data uses `isBlur`.

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

    const shape = new Rect({
        left: pointer.x,
        top: pointer.y,
        originX: 'left',
        originY: 'top',
        width: 0,
        height: 0,
        rx: 8,
        ry: 8,
        fill: fillColor,
        stroke: fillColor,
        strokeWidth: 0,
        selectable: false,
        evented: false,
        ...controlConfig
    });

    shape.set({
        isBlur: true,
        redactMode: ctx.redactMode ?? 'fill',
        redactStrength: ctx.redactStrength ?? DEFAULT_REDACT_STRENGTH,
    });
    applyRedaction(canvas, shape, fillColor);
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
    // Mosaic/blur imagery is anchored to the document, so re-align as the
    // shape grows.
    applyRedaction(canvas, shape);
}

/**
 * mouseUp handler for blur-rect tool.
 */
export function blurMouseUp(canvas: Canvas, ctx: DrawToolContext) {
    const rect = ctx.currentShape.current as Rect;
    if (rect.width! < 5 && rect.height! < 5) {
        canvas.remove(rect);
    } else {
        rect.set({ selectable: true, evented: true });
        normalizeRedactionGeometry(rect);
        applyRedaction(canvas, rect);
    }
}
