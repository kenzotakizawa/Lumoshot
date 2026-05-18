import { Canvas, Rect, Group, Path, Textbox, Control, util, Point, controlsUtils } from 'fabric';
import type { DrawToolContext } from './types';

// ─── Path generation ───────────────────────────────────────────────

export const createSpeechBubblePath = (w: number, h: number, r: number, tx: number, ty: number) => {
    const hw = w / 2;
    const hh = h / 2;
    const bw = 24; // 固定の根元幅

    const absTx = Math.abs(tx) || 0.001;
    const absTy = Math.abs(ty) || 0.001;

    let edge = '';
    if (absTy / absTx > hh / hw) {
        edge = ty > 0 ? 'bottom' : 'top';
    } else {
        edge = tx > 0 ? 'right' : 'left';
    }

    let ix = 0, iy = 0;
    if (edge === 'bottom') {
        ix = tx * (hh / ty);
        ix = Math.max(-hw + r + bw / 2, Math.min(hw - r - bw / 2, ix));
    } else if (edge === 'top') {
        ix = tx * (-hh / ty);
        ix = Math.max(-hw + r + bw / 2, Math.min(hw - r - bw / 2, ix));
    } else if (edge === 'right') {
        iy = ty * (hw / tx);
        iy = Math.max(-hh + r + bw / 2, Math.min(hh - r - bw / 2, iy));
    } else if (edge === 'left') {
        iy = ty * (-hw / tx);
        iy = Math.max(-hh + r + bw / 2, Math.min(hh - r - bw / 2, iy));
    }

    const p = [];
    // 左上から時計回りに描画 (Top-left corner to Top-right)
    p.push(`M ${-hw + r} ${-hh}`);

    if (edge === 'top') {
        p.push(`L ${ix - bw / 2} ${-hh}`);
        p.push(`L ${tx} ${ty}`);
        p.push(`L ${ix + bw / 2} ${-hh}`);
    }
    p.push(`L ${hw - r} ${-hh}`, `Q ${hw} ${-hh} ${hw} ${-hh + r}`); // TR corner

    if (edge === 'right') {
        p.push(`L ${hw} ${iy - bw / 2}`);
        p.push(`L ${tx} ${ty}`);
        p.push(`L ${hw} ${iy + bw / 2}`);
    }
    p.push(`L ${hw} ${hh - r}`, `Q ${hw} ${hh} ${hw - r} ${hh}`); // BR corner

    if (edge === 'bottom') {
        p.push(`L ${ix + bw / 2} ${hh}`);
        p.push(`L ${tx} ${ty}`);
        p.push(`L ${ix - bw / 2} ${hh}`);
    }
    p.push(`L ${-hw + r} ${hh}`, `Q ${-hw} ${hh} ${-hw} ${hh - r}`); // BL corner

    if (edge === 'left') {
        p.push(`L ${-hw} ${iy + bw / 2}`);
        p.push(`L ${tx} ${ty}`);
        p.push(`L ${-hw} ${iy - bw / 2}`);
    }
    p.push(`L ${-hw} ${-hh + r}`, `Q ${-hw} ${-hh} ${-hw + r} ${-hh}`); // TL corner

    p.push('Z');
    return { pathStr: p.join(' '), tx, ty };
};

// ─── Update existing bubble after scaling / moving / text change ───

export const updateSpeechBubble = (g: Group) => {
    const bg = g._objects.find(o => o.type === 'path') as Path;
    const txt = g._objects.find(o => o.type === 'textbox' || o.type === 'i-text') as Textbox;
    if (!bg || !txt) return;

    let sX = g.scaleX || 1;
    let sY = g.scaleY || 1;
    let bw = g.get('bubbleWidth') as number;
    let bh = g.get('bubbleHeight') as number;

    if (sX !== 1 || sY !== 1) {
        bw = Math.max(80, bw * Math.abs(sX));
        bh = Math.max(60, bh * Math.abs(sY));
        g.set({ scaleX: 1, scaleY: 1 });
        g.set('bubbleWidth', bw);
        g.set('bubbleHeight', bh);
    }

    const pad = 16;
    txt.set('width', Math.max(40, bw - pad * 2));
    const finalH = Math.max(bh, txt.height + pad * 2);

    // Get absolute tip and convert to local for path generation
    const globalTip = new Point(g.get('tipGlobalX') || 0, g.get('tipGlobalY') || 0);
    const inv = util.invertTransform(g.calcTransformMatrix());
    const localTip = util.transformPoint(globalTip, inv);

    const { pathStr } = createSpeechBubblePath(bw, finalH, 16, localTip.x, localTip.y);

    // Measure old center of text to prevent physical drifting when bounding box changes
    g.setCoords();
    const oldTextCenter = util.transformPoint(new Point(0, 0), txt.calcTransformMatrix());

    const newPath = new Path(pathStr);
    bg.set({
        path: newPath.path,
        width: newPath.width,
        height: newPath.height,
        pathOffset: newPath.pathOffset
    });

    txt.set({
        left: bg.left - (bg.pathOffset?.x || 0),
        top: bg.top - (bg.pathOffset?.y || 0)
    });

    if (typeof (g as any).addWithUpdate === 'function') {
        (g as any).addWithUpdate();
    } else if (typeof (g as any)._calcBounds === 'function') {
        (g as any)._calcBounds();
    }

    // Counteract any generic center shifts from path bounds expansion
    g.setCoords();
    const newTextCenter = util.transformPoint(new Point(0, 0), txt.calcTransformMatrix());
    g.set({
        left: g.left + (oldTextCenter.x - newTextCenter.x),
        top: g.top + (oldTextCenter.y - newTextCenter.y)
    });

    // Explicitly update control offsets instead of global position handler
    if (g.controls && g.controls.tailPoint) {
        g.controls.tailPoint.offsetX = bg.left - (bg.pathOffset?.x || 0) + localTip.x;
        g.controls.tailPoint.offsetY = bg.top - (bg.pathOffset?.y || 0) + localTip.y;
    }
    g.setCoords();
};

// ─── Spawn a brand new speech bubble ───────────────────────────────

export function spawnSpeechBubble(
    canvas: Canvas,
    cx: number, cy: number, fw: number, fh: number,
    strokeColor: string, strokeWidth: number, fontColor: string, fontSize: number,
    controlConfig: any
) {
    const bubbleId = 'bubble_' + Date.now();
    const pad = 16;

    const text = new Textbox('メッセージ', {
        width: fw - pad * 2,
        fontSize: fontSize,
        fill: fontColor,
        originX: 'center',
        originY: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
        textAlign: 'center',
        splitByGrapheme: true,
    });

    const actualFh = Math.max(fh, text.height + pad * 2);
    const r = 16;
    const tipGlobalX = cx;
    const tipGlobalY = cy + actualFh / 2 + 30;

    const localTx = tipGlobalX - cx;
    const localTy = tipGlobalY - cy;

    const { pathStr } = createSpeechBubblePath(fw, actualFh, r, localTx, localTy);

    const bgObj = new Path(pathStr, {
        fill: strokeColor === '#ffffff' ? '#000000' : '#ffffff',
        stroke: strokeColor,
        strokeWidth: strokeWidth,
        strokeLineJoin: 'round',
        originX: 'center',
        originY: 'center',
    });

    bgObj.set('bubbleId', bubbleId);
    text.set('bubbleId', bubbleId);

    text.set({
        left: bgObj.left - (bgObj.pathOffset?.x || 0),
        top: bgObj.top - (bgObj.pathOffset?.y || 0)
    });

    const group = new Group([bgObj, text], {
        left: cx,
        top: cy,
        originX: 'center',
        originY: 'center',
        interactive: true,
        selectable: true,
        evented: true,
        subTargetCheck: false,
        objectCaching: false,
        hasControls: true,
        hasBorders: true,
        ...controlConfig
    });

    group.set('bubbleId', bubbleId);
    group.set('bubbleWidth', fw);
    group.set('bubbleHeight', actualFh);
    group.set('tipGlobalX', tipGlobalX);
    group.set('tipGlobalY', tipGlobalY);

    const tailControl = new Control({
        x: 0,
        y: 0,
        cursorStyle: 'pointer',
        actionHandler: (_eventData, transform, x, y) => {
            const target = transform.target as Group;
            target.set('tipGlobalX', x);
            target.set('tipGlobalY', y);
            updateSpeechBubble(target);
            return true;
        },
        render: (ctx, left, top, _styleOverride, fabricObject) => {
            ctx.save();
            ctx.translate(left, top);
            ctx.rotate(util.degreesToRadians(fabricObject.angle || 0));
            ctx.beginPath();
            ctx.arc(0, 0, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#ffeb3b';
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1;
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }
    });

    // Set initial offset relative to bgObj
    tailControl.offsetX = bgObj.left - (bgObj.pathOffset?.x || 0) + localTx;
    tailControl.offsetY = bgObj.top - (bgObj.pathOffset?.y || 0) + localTy;

    const defaultControls = controlsUtils.createObjectDefaultControls();
    if (defaultControls.mb) {
        defaultControls.mb.visible = false;
    }

    group.controls = { ...defaultControls, tailPoint: tailControl };
    group.setControlsVisibility({ tailPoint: true, mb: false });

    console.log('[SpeechBubble] Controls initialized on bubble:', group.get('bubbleId'), Object.keys(group.controls));

    const restoreControls = () => {
        if (group.controls.tailPoint !== tailControl) {
            console.log('[SpeechBubble] Controls were wiped out. Restoring tail pointer.');
            group.controls = { ...controlsUtils.createObjectDefaultControls(), tailPoint: tailControl };
            if (group.controls.mb) group.controls.mb.visible = false;
            group.setControlsVisibility({ tailPoint: true, mb: false });
            canvas.requestRenderAll();
        }
    };

    group.on('selected', restoreControls);
    group.on('deselected', restoreControls);
    canvas.on('selection:updated', restoreControls);

    text.on('changed', () => {
        updateSpeechBubble(group);
        canvas.requestRenderAll();
    });

    group.on('scaling', () => {
        const sX = group.scaleX || 1;
        const sY = group.scaleY || 1;
        text.set({ scaleX: 1 / sX, scaleY: 1 / sY });
    });

    group.on('modified', () => {
        updateSpeechBubble(group);
        canvas.requestRenderAll();
    });

    canvas.add(group);
    group.setCoords();
    canvas.setActiveObject(group);
    canvas.requestRenderAll();

    canvas.fire('selection:created' as any, { selected: [group] });
    canvas.fire('object:modified' as any, { target: group });
}

// ─── mouseDown for speech-bubble temporary rectangle ───────────────

export function speechBubbleMouseDown(
    canvas: Canvas,
    pointer: { x: number; y: number },
    ctx: DrawToolContext
) {
    const { strokeColor } = ctx;

    const active = canvas.getActiveObject();
    if (active && (active as any).get?.('bubbleId')) {
        return;
    }

    const shape = new Rect({
        left: pointer.x,
        top: pointer.y,
        width: 0,
        height: 0,
        stroke: strokeColor,
        strokeWidth: 2,
        strokeDashArray: [5, 5],
        fill: 'transparent',
        selectable: false,
        evented: false,
        originX: 'left',
        originY: 'top'
    });
    shape.set('isTempBubble', true);
    ctx.currentShape.current = shape;
    canvas.add(shape);
}

/**
 * mouseMove handler for speech-bubble (same as spotlight-rect shape resize).
 */
export function speechBubbleMouseMove(
    _canvas: Canvas,
    pointer: { x: number; y: number },
    ctx: DrawToolContext
) {
    const shape = ctx.currentShape.current as Rect;
    const minX = Math.min(pointer.x, ctx.startX.current);
    const minY = Math.min(pointer.y, ctx.startY.current);

    shape.set({
        left: minX,
        top: minY,
        width: Math.abs(pointer.x - ctx.startX.current),
        height: Math.abs(pointer.y - ctx.startY.current)
    });
    shape.setCoords();
}

/**
 * mouseUp handler for speech-bubble.
 * Removes temp rect and spawns the actual Group bubble.
 */
export function speechBubbleMouseUp(canvas: Canvas, ctx: DrawToolContext) {
    const rect = ctx.currentShape.current as Rect;
    const w = rect.width || 0;
    const h = rect.height || 0;
    const l = rect.left || 0;
    const t = rect.top || 0;
    canvas.remove(rect);

    const finalW = Math.max(80, w);
    const finalH = Math.max(60, h);

    spawnSpeechBubble(
        canvas, l + w / 2, t + h / 2, finalW, finalH,
        ctx.strokeColor, ctx.strokeWidth, ctx.fontColor, ctx.fontSize,
        ctx.controlConfig
    );
}
