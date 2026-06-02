import * as fabric from 'fabric';
import type { DrawToolContext } from './types';

export const clickIconMouseDown = (
    canvas: fabric.Canvas,
    pointer: { x: number; y: number },
    ctx: DrawToolContext
) => {
    const scheme = ctx.clickIconScheme ?? 'dark';
    const dotColor = scheme === 'dark' ? '#1a1a2e' : '#ffffff';
    const dot = new fabric.Circle({
        left: pointer.x, top: pointer.y, radius: 4,
        fill: dotColor, originX: 'center', originY: 'center',
        selectable: false, evented: false,
    });
    canvas.add(dot);
    ctx.currentShape.current = dot;
    canvas.requestRenderAll();
};

export const clickIconMouseMove = (
    // @ts-ignore
    _canvas: fabric.Canvas, _pointer: { x: number; y: number }, _ctx: DrawToolContext
) => { /* stamp on up */ };

export const clickIconMouseUp = (canvas: fabric.Canvas, ctx: DrawToolContext) => {
    const dot = ctx.currentShape.current;
    if (dot) canvas.remove(dot);

    const scheme = ctx.clickIconScheme ?? 'dark';
    const group = buildClickCursorGroup(
        ctx.startX.current, ctx.startY.current,
        'left', scheme, ctx.controlConfig
    );
    group.set({ scaleX: 2, scaleY: 2 });
    canvas.add(group);
    canvas.setActiveObject(group);
    ctx.currentShape.current = group;
    canvas.requestRenderAll();
};

// ─────────────────────────────────────────────────────────
//  Design constants (all in a unified coordinate space)
// ─────────────────────────────────────────────────────────
//
//  Composition layout (y grows downward):
//
//    ╔══════════════════╗  ← group bounding box top
//    ║  \               ║
//    ║   \──── lines    ║  } 3 motion lines (集中線)
//    ║    \             ║
//    ║     ★ tip        ║  ← cursor tip (TIP_X, TIP_Y)
//    ║      \           ║
//    ║       |cursor|   ║  } cursor arrow body
//    ║                  ║
//    ║   [  LEFT  ]     ║  } badge, centered under cursor
//    ╚══════════════════╝
//
//  Visual rules applied:
//  • Motion lines: 3 lines at 205°/225°/245° (20° equal spacing)
//                 Center line longest, outer two slightly shorter → rhythm
//  • All strokes  : same weight (STROKE = 2.5 px) → harmony
//  • dark scheme  : white cursor body + dark outline/text — for light backgrounds
//  • light scheme : dark cursor body + white outline/text — for dark backgrounds
// ─────────────────────────────────────────────────────────

const STROKE = 2.5;

const getClickLabel = (clickType: 'left' | 'right') => {
    const isJapanese = typeof chrome !== 'undefined'
        && chrome.i18n?.getUILanguage?.().toLowerCase().startsWith('ja');

    if (isJapanese) return clickType === 'left' ? '左クリック' : '右クリック';
    return clickType === 'left' ? 'Left click' : 'Right click';
};

/** Cursor arrow path. Tip at (tX, tY); body extends ~18 px right, ~34 px down. */
function cursorPath(tX: number, tY: number) {
    return (
        `M ${tX} ${tY} ` +
        `L ${tX} ${tY + 28} ` +
        `L ${tX + 6} ${tY + 22} ` +
        `L ${tX + 11} ${tY + 34} ` +
        `L ${tX + 15} ${tY + 32} ` +
        `L ${tX + 10} ${tY + 20} ` +
        `L ${tX + 18} ${tY + 20} Z`
    );
}

export function buildClickCursorGroup(
    left: number, top: number,
    clickType: 'left' | 'right',
    scheme: 'dark' | 'light',
    controlConfig: Record<string, unknown>
): fabric.Group {

    const linesColor  = scheme === 'dark' ? '#1a1a2e' : '#ffffff';
    const cursorFill  = scheme === 'dark' ? '#ffffff' : '#1a1a2e';
    const cursorStroke = scheme === 'dark' ? '#1a1a2e' : '#ffffff';
    const labelFill   = scheme === 'dark' ? '#1a1a2e' : '#ffffff';

    // ── Cursor tip position (leave headroom top-left for lines) ──
    const TIP_X = 34;
    const TIP_Y = 34;

    // ── Motion lines ─────────────────────────────────────────────
    const LINE_GAP = 8;
    const LINE_LENGTHS = [20, 26, 20];

    const CENTER_ANGLE = clickType === 'left' ? 215 : 325;
    const ANGLES_DEG = [CENTER_ANGLE - 20, CENTER_ANGLE, CENTER_ANGLE + 20];

    const motionLines = ANGLES_DEG.map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const len = LINE_LENGTHS[i];
        const x1 = TIP_X + Math.cos(rad) * LINE_GAP;
        const y1 = TIP_Y + Math.sin(rad) * LINE_GAP;
        const x2 = TIP_X + Math.cos(rad) * (LINE_GAP + len);
        const y2 = TIP_Y + Math.sin(rad) * (LINE_GAP + len);
        return new fabric.Line([x1, y1, x2, y2], {
            stroke: linesColor,
            strokeWidth: STROKE,
            strokeLineCap: 'round',
            selectable: false,
        });
    });

    // ── Cursor arrow ─────────────────────────────────────────────
    const pathData = cursorPath(TIP_X, TIP_Y);

    const arrowFill = new fabric.Path(pathData, {
        fill: cursorFill, stroke: 'none', strokeWidth: 0,
    });
    const arrowBorder = new fabric.Path(pathData, {
        fill: 'none',
        stroke: cursorStroke,
        strokeWidth: STROKE,
        strokeLineJoin: 'round',
        strokeLineCap: 'round',
    });

    const label = new fabric.Text(getClickLabel(clickType), {
        left: 43,
        top: 76,
        originX: 'center',
        originY: 'center',
        fill: labelFill,
        fontSize: 11,
        fontWeight: '600',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
        selectable: false,
        evented: false,
    });

    // ── Assemble ─────────────────────────────────────────────────
    const group = new fabric.Group(
        [...motionLines, arrowFill, arrowBorder, label],
        { left, top, originX: 'left', originY: 'top', ...controlConfig } as fabric.GroupProps
    );

    group.set('isClickIcon', true);
    group.set('clickType', clickType);
    group.set('clickScheme', scheme);

    return group;
}
