import { Canvas, Ellipse, IText, Group } from 'fabric';
import type { DrawToolContext } from './types';

/**
 * mouseDown handler for step-number tool.
 * Creates a numbered badge (circle + text group) at the clicked position.
 */
export function stepNumberMouseDown(
    canvas: Canvas,
    pointer: { x: number; y: number },
    ctx: DrawToolContext
) {
    const { strokeColor, controlConfig } = ctx;

    const stepObjects = canvas.getObjects().filter((o: any) => o.get('isStepNumber'));
    const nextVal = stepObjects.length + 1;

    // User requested Step Number to have an 8px base default instead of typical 4px
    const baseWidth = 8;
    const radius = Math.max(16, baseWidth * 3);
    const circle = new Ellipse({
        rx: radius,
        ry: radius,
        fill: strokeColor,
        originX: 'center',
        originY: 'center',
    });
    const text = new IText(nextVal.toString(), {
        fontSize: radius * 1.2,
        fill: '#ffffff',
        originX: 'center',
        originY: 'center',
        fontWeight: 'bold',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
    });

    const group = new Group([circle, text], {
        left: pointer.x,
        top: pointer.y,
        originX: 'center',
        originY: 'center',
        ...controlConfig
    });

    group.set('isStepNumber', true);
    group.set('stepValue', nextVal);
    canvas.add(group);
    canvas.requestRenderAll();
    canvas.fire('object:modified' as any, { target: group });
    ctx.isDrawing.current = false;
}
