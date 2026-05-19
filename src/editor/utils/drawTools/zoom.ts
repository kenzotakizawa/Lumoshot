import { Canvas, Rect, Ellipse } from 'fabric';
import type { DrawToolContext } from './types';

let zoomCounter = 0;

export function zoomMouseDown(
    canvas: Canvas,
    pointer: { x: number; y: number },
    ctx: DrawToolContext,
    isEllipse: boolean
) {
    const { strokeColor } = ctx;

    const shape = isEllipse
        ? new Ellipse({
            left: pointer.x,
            top: pointer.y,
            originX: 'center',
            originY: 'center',
            rx: 0,
            ry: 0,
            fill: 'rgba(255,255,255,0.01)',
            stroke: strokeColor,
            strokeWidth: 2,
            strokeDashArray: [6, 4],
            strokeUniform: true,
            selectable: false,
            evented: false,
        })
        : new Rect({
            left: pointer.x,
            top: pointer.y,
            originX: 'left',
            originY: 'top',
            width: 0,
            height: 0,
            fill: 'rgba(255,255,255,0.01)',
            stroke: strokeColor,
            strokeWidth: 2,
            strokeDashArray: [6, 4],
            strokeUniform: true,
            selectable: false,
            evented: false,
        });

    shape.set('isZoomSource', true);
    ctx.currentShape.current = shape;
    canvas.add(shape);
}

export function zoomMouseMove(
    _canvas: Canvas,
    pointer: { x: number; y: number },
    ctx: DrawToolContext,
    isEllipse: boolean
) {
    const shape = ctx.currentShape.current;
    if (!shape) return;

    const minX = Math.min(pointer.x, ctx.startX.current);
    const maxX = Math.max(pointer.x, ctx.startX.current);
    const minY = Math.min(pointer.y, ctx.startY.current);
    const maxY = Math.max(pointer.y, ctx.startY.current);
    const width = maxX - minX;
    const height = maxY - minY;

    if (isEllipse) {
        shape.set({ left: minX + width / 2, top: minY + height / 2, rx: width / 2, ry: height / 2 });
    } else {
        shape.set({ left: minX, top: minY, width, height });
    }
    shape.setCoords();
}

export function zoomMouseUp(
    canvas: Canvas,
    ctx: DrawToolContext,
    isEllipse: boolean
) {
    const source = ctx.currentShape.current;
    if (!source) return;

    const srcW = isEllipse ? source.rx * 2 : (source.width || 0);
    const srcH = isEllipse ? source.ry * 2 : (source.height || 0);

    if (srcW < 10 || srcH < 10) {
        canvas.remove(source);
        return;
    }

    const zoomId = `zoom_${++zoomCounter}_${Date.now()}`;
    const { strokeColor, controlConfig } = ctx;

    // Source top-left in canvas logical coords
    const srcLeft = isEllipse ? source.left - source.rx : (source.left || 0);
    const srcTop = isEllipse ? source.top - source.ry : (source.top || 0);

    source.set({ zoomId, zoomColor: strokeColor, selectable: false, evented: false } as any);
    source.setCoords();

    // Panel = 2× source size, placed to the right with a gap
    const GAP = 30;
    const panelW = srcW * 2;
    const panelH = srcH * 2;
    const panelCx = srcLeft + srcW + GAP + panelW / 2;
    const panelCy = srcTop + srcH / 2;

    const panel = isEllipse
        ? new Ellipse({
            left: panelCx,
            top: panelCy,
            originX: 'center',
            originY: 'center',
            rx: panelW / 2,
            ry: panelH / 2,
            fill: 'rgba(255,255,255,0.01)',
            stroke: 'transparent',
            strokeWidth: 0,
            selectable: true,
            evented: true,
            ...controlConfig,
        })
        : new Rect({
            left: panelCx,
            top: panelCy,
            originX: 'center',
            originY: 'center',
            width: panelW,
            height: panelH,
            fill: 'rgba(255,255,255,0.01)',
            stroke: 'transparent',
            strokeWidth: 0,
            selectable: true,
            evented: true,
            ...controlConfig,
        });

    panel.set({
        isZoomPanel: true,
        zoomId,
        zoomColor: strokeColor,
        zoomIsEllipse: isEllipse,
    } as any);

    canvas.add(panel);
    panel.setCoords();
    canvas.requestRenderAll();
}

// Returns logical bounds (accounting for scaleX/scaleY) of a non-rotated Fabric object
function getLogicalBounds(obj: any) {
    const center = obj.getCenterPoint();
    const halfW = (obj.type === 'ellipse' ? obj.rx : (obj.width || 0) / 2) * (obj.scaleX || 1);
    const halfH = (obj.type === 'ellipse' ? obj.ry : (obj.height || 0) / 2) * (obj.scaleY || 1);
    return {
        left: center.x - halfW,
        top: center.y - halfH,
        right: center.x + halfW,
        bottom: center.y + halfH,
        cx: center.x,
        cy: center.y,
        halfW,
        halfH,
    };
}

// Returns the two endpoints of the side of `bounds` that faces `targetCx, targetCy`
function facingSide(
    b: ReturnType<typeof getLogicalBounds>,
    targetCx: number,
    targetCy: number
): [{ x: number; y: number }, { x: number; y: number }] {
    const dx = targetCx - b.cx;
    const dy = targetCy - b.cy;
    if (Math.abs(dx) >= Math.abs(dy)) {
        const ex = dx > 0 ? b.right : b.left;
        return [{ x: ex, y: b.top }, { x: ex, y: b.bottom }];
    } else {
        const ey = dy > 0 ? b.bottom : b.top;
        return [{ x: b.left, y: ey }, { x: b.right, y: ey }];
    }
}

export function zoomAfterRender(canvas: Canvas) {
    const panels = canvas.getObjects().filter((o: any) => o.get('isZoomPanel'));
    if (panels.length === 0) return;

    const bgImg: any = canvas.getObjects().find((o: any) => o.get('isBackground'));
    if (!bgImg) return;
    const imgEl = bgImg.getElement() as HTMLImageElement;

    const ctx2d = canvas.getContext();
    const retinaScaling = (canvas as any).getRetinaScaling ? (canvas as any).getRetinaScaling() : 1;
    const vpt = canvas.viewportTransform;
    const vptScale = vpt ? vpt[0] : 1;

    for (const panel of panels as any[]) {
        const zoomId = panel.get('zoomId');
        const color = panel.get('zoomColor') || '#ff0000';
        const isEllipse = panel.get('zoomIsEllipse');

        const sources = canvas.getObjects().filter(
            (o: any) => o.get('isZoomSource') && o.get('zoomId') === zoomId
        );
        if (sources.length === 0) continue;

        const src: any = sources[0];
        const srcBounds = getLogicalBounds(src);

        // Source region in image pixel space
        const imgNatW = imgEl.naturalWidth || bgImg.width;
        const imgNatH = imgEl.naturalHeight || bgImg.height;
        const renderedImgW = bgImg.width * (bgImg.scaleX || 1);
        const renderedImgH = bgImg.height * (bgImg.scaleY || 1);
        const imgScaleX = imgNatW / renderedImgW;
        const imgScaleY = imgNatH / renderedImgH;

        const pixSrcX = srcBounds.left * imgScaleX;
        const pixSrcY = srcBounds.top * imgScaleY;
        const pixSrcW = srcBounds.halfW * 2 * imgScaleX;
        const pixSrcH = srcBounds.halfH * 2 * imgScaleY;

        // ── Draw zoomed image content inside panel ──────────────
        ctx2d.save();
        ctx2d.setTransform(1, 0, 0, 1, 0, 0);
        ctx2d.scale(retinaScaling, retinaScaling);
        if (vpt) ctx2d.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]);

        const m = panel.calcTransformMatrix();
        ctx2d.save();
        ctx2d.transform(m[0], m[1], m[2], m[3], m[4], m[5]);

        // Clip to panel shape (object-local coords, center = 0,0)
        ctx2d.beginPath();
        if (isEllipse) {
            ctx2d.ellipse(0, 0, panel.rx, panel.ry, 0, 0, Math.PI * 2);
        } else {
            ctx2d.rect(-(panel.width || 0) / 2, -(panel.height || 0) / 2, panel.width || 0, panel.height || 0);
        }
        ctx2d.clip();

        // Draw background image portion scaled to fill panel local area
        const localW = isEllipse ? panel.rx * 2 : (panel.width || 0);
        const localH = isEllipse ? panel.ry * 2 : (panel.height || 0);
        ctx2d.drawImage(imgEl, pixSrcX, pixSrcY, pixSrcW, pixSrcH, -localW / 2, -localH / 2, localW, localH);

        ctx2d.restore(); // pop calcTransformMatrix

        // ── Draw panel border (in vpt space so lineWidth is consistent) ──
        const panelBounds = getLogicalBounds(panel);
        const lw = 2.5 / vptScale;
        ctx2d.strokeStyle = color;
        ctx2d.lineWidth = lw;
        ctx2d.setLineDash([]);
        ctx2d.beginPath();
        if (isEllipse) {
            ctx2d.ellipse(panelBounds.cx, panelBounds.cy, panelBounds.halfW, panelBounds.halfH, 0, 0, Math.PI * 2);
        } else {
            ctx2d.rect(panelBounds.left, panelBounds.top, panelBounds.halfW * 2, panelBounds.halfH * 2);
        }
        ctx2d.stroke();

        // ── Draw connecting lines ────────────────────────────────
        const srcPts = facingSide(srcBounds, panelBounds.cx, panelBounds.cy);
        const panelPts = facingSide(panelBounds, srcBounds.cx, srcBounds.cy);

        ctx2d.strokeStyle = color;
        ctx2d.lineWidth = 1.5 / vptScale;
        ctx2d.globalAlpha = 0.55;

        ctx2d.beginPath();
        ctx2d.moveTo(srcPts[0].x, srcPts[0].y);
        ctx2d.lineTo(panelPts[0].x, panelPts[0].y);
        ctx2d.stroke();

        ctx2d.beginPath();
        ctx2d.moveTo(srcPts[1].x, srcPts[1].y);
        ctx2d.lineTo(panelPts[1].x, panelPts[1].y);
        ctx2d.stroke();

        ctx2d.globalAlpha = 1;
        ctx2d.restore(); // pop retina + vpt
    }
}
