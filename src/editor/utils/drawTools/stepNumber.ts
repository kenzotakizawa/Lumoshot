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
    // stepOffset > 0 continues numbering from a previous screenshot.
    const nextVal = (ctx.stepOffset ?? 0) + stepObjects.length + 1;

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

    const SNAP_TOLERANCE = 15;
    let finalX = pointer.x;
    let finalY = pointer.y;

    if (stepObjects.length > 0) {
        let minDx = SNAP_TOLERANCE;
        let minDy = SNAP_TOLERANCE;

        stepObjects.forEach((obj: any) => {
            // Because originX/Y is 'center', left/top represents the exact center of the badge
            const objX = obj.left ?? 0;
            const objY = obj.top ?? 0;
            
            const dx = Math.abs(objX - pointer.x);
            if (dx < minDx) {
                minDx = dx;
                finalX = objX;
            }
            
            const dy = Math.abs(objY - pointer.y);
            if (dy < minDy) {
                minDy = dy;
                finalY = objY;
            }
        });
    }

    const group = new Group([circle, text], {
        left: finalX,
        top: finalY,
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

// Re-number every step badge 1..n (plus `offset`) in their current order,
// e.g. after one is deleted or when "continue from previous" is toggled.
export function renumberStepBadges(canvas: Canvas, offset: number) {
    const stepObjects = canvas.getObjects().filter((o: any) => o.get('isStepNumber'));
    stepObjects.sort((a: any, b: any) => a.get('stepValue') - b.get('stepValue'));
    stepObjects.forEach((obj: any, index) => {
        const newValue = offset + index + 1;
        obj.set('stepValue', newValue);
        const textObj = obj.getObjects?.().find((o: any) => o.type === 'i-text' || o.type === 'text' || o.type === 'IText' || o.type === 'Text');
        if (textObj) textObj.set('text', newValue.toString());
        obj.set('dirty', true);
    });
    canvas.requestRenderAll();
}

// Highest step number in a serialized snapshot (0 if none). Cheap string scan.
export function lastStepInState(state: string): number {
    let max = 0;
    for (const m of state.matchAll(/"stepValue":(\d+)/g)) max = Math.max(max, Number(m[1]));
    return max;
}
