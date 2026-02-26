import { Canvas, IText } from 'fabric';
import type { DrawToolContext } from './types';

/**
 * mouseDown handler for text tool.
 * Text tool immediately creates the text object and enters editing mode (no drag).
 */
export function textMouseDown(
    canvas: Canvas,
    pointer: { x: number; y: number },
    ctx: DrawToolContext
) {
    const { strokeColor, strokeWidth, controlConfig } = ctx;

    const text = new IText('Text', {
        left: pointer.x,
        top: pointer.y,
        fill: strokeColor,
        fontSize: Math.max(20, strokeWidth * 5),
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
        ...controlConfig
    });
    canvas.add(text);

    canvas.fire('object:modified' as any, { target: text });

    canvas.setActiveObject(text);
    text.enterEditing();
    text.selectAll();
    ctx.isDrawing.current = false;
}
