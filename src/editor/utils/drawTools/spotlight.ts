import { Canvas, Rect, Ellipse } from 'fabric';
import type { DrawToolContext } from './types';

/**
 * mouseDown handler for spotlight-rect / spotlight-ellipse tools.
 */
export function spotlightMouseDown(
    canvas: Canvas,
    pointer: { x: number; y: number },
    ctx: DrawToolContext,
    isEllipse: boolean
) {
    const { controlConfig } = ctx;

    const shape = isEllipse ? new Ellipse({
        left: pointer.x,
        top: pointer.y,
        originX: 'center',
        originY: 'center',
        rx: 0,
        ry: 0,
        fill: 'rgba(255,255,255,0.01)', // Clickable internally but nearly invisible
        stroke: 'transparent',
        strokeWidth: 0,
        selectable: false,
        evented: false,
        ...controlConfig
    }) : new Rect({
        left: pointer.x,
        top: pointer.y,
        originX: 'left',
        originY: 'top',
        width: 0,
        height: 0,
        fill: 'rgba(255,255,255,0.01)',
        stroke: 'transparent',
        strokeWidth: 0,
        selectable: false,
        evented: false,
        ...controlConfig
    });

    shape.set('isSpotlight', true);
    ctx.currentShape.current = shape;
    canvas.add(shape);
}

/**
 * mouseMove handler for spotlight tools.
 */
export function spotlightMouseMove(
    _canvas: Canvas,
    pointer: { x: number; y: number },
    ctx: DrawToolContext,
    isEllipse: boolean
) {
    const shape = ctx.currentShape.current;

    const minX = Math.min(pointer.x, ctx.startX.current);
    const maxX = Math.max(pointer.x, ctx.startX.current);
    const minY = Math.min(pointer.y, ctx.startY.current);
    const maxY = Math.max(pointer.y, ctx.startY.current);

    const width = maxX - minX;
    const height = maxY - minY;

    if (!isEllipse) {
        shape.set({ left: minX, top: minY, width, height });
    } else {
        shape.set({
            left: minX + width / 2,
            top: minY + height / 2,
            rx: width / 2,
            ry: height / 2
        });
    }

    shape.setCoords();
}

/**
 * mouseUp handler for spotlight tools.
 */
export function spotlightMouseUp(canvas: Canvas, ctx: DrawToolContext, isEllipse: boolean) {
    const shape = ctx.currentShape.current;
    const w = !isEllipse ? shape.width : shape.rx * 2;
    const h = !isEllipse ? shape.height : shape.ry * 2;

    if (w < 5 && h < 5) {
        canvas.remove(shape);
    } else {
        shape.set({ selectable: true, evented: true });
        shape.fire('modified');
    }
}

/**
 * after:render handler that draws the spotlight overlay using evenodd fill rule.
 */
export function spotlightAfterRender(canvas: Canvas) {
    const spotlights = canvas.getObjects().filter(o => o.get('isSpotlight'));
    if (spotlights.length === 0) return;

    const ctx = canvas.getContext();

    ctx.save();

    // Apply Retina and Viewport scaling so our logical vectors map correctly
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const retinaScaling = canvas.getRetinaScaling ? canvas.getRetinaScaling() : 1;
    ctx.scale(retinaScaling, retinaScaling);

    const vpt = canvas.viewportTransform;
    if (vpt) {
        ctx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]);
    }

    // Start a single unified path for the overlay and holes
    ctx.beginPath();

    // 1. Draw a massive outer rectangle spanning the entire logical space
    ctx.rect(-99999, -99999, 199998, 199998);

    // 2. Add sub-paths for each spotlight hole
    spotlights.forEach((spot: any) => {
        ctx.save();
        const m = spot.calcTransformMatrix();
        ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);

        if (spot.type === 'rect') {
            ctx.rect(-spot.width / 2, -spot.height / 2, spot.width, spot.height);
        } else if (spot.type === 'ellipse') {
            ctx.ellipse(0, 0, spot.rx, spot.ry, 0, 0, Math.PI * 2);
        }

        ctx.restore();
    });

    // 3. Fill with evenodd rule to create transparent holes
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fill('evenodd');

    ctx.restore();
}
