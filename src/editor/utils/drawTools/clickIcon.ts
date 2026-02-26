import * as fabric from 'fabric';
import type { DrawToolContext } from './types';

export const clickIconMouseDown = (
    canvas: fabric.Canvas,
    pointer: { x: number; y: number },
    ctx: DrawToolContext
) => {
    const dot = new fabric.Circle({
        left: pointer.x, top: pointer.y, radius: 4,
        fill: ctx.strokeColor, originX: 'center', originY: 'center',
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

    const group = buildClickCursorGroup(
        ctx.startX.current, ctx.startY.current,
        'left', ctx.strokeColor, ctx.controlConfig
    );
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
//  • Line color   : same as badge background → color unity
//  • Badge        : horizontally centered on the cursor body center
//  • Cursor body  : white fill + dark outline (near-black)
//  • Dark color   : consistent #1a1a2e everywhere
// ─────────────────────────────────────────────────────────

const DARK = '#1a1a2e';   // cursor outline, badge text-area
const STROKE = 2.5;         // universal stroke weight

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
    color: string,
    controlConfig: Record<string, unknown>
): fabric.Group {

    // ── Cursor tip position (leave headroom top-left for lines) ──
    const TIP_X = 34;
    const TIP_Y = 34;

    // ── Motion lines ─────────────────────────────────────────────
    // Direction encodes which button is being clicked:
    //   LEFT  → lines fan from the LEFT  (centered at 215°, spread ±20°)
    //   RIGHT → lines fan from the RIGHT (centered at 325°, spread ±20°)
    // Center line is longest → natural rhythm and visual weight.
    const LINE_GAP = 8;
    const LINE_LENGTHS = [20, 26, 20];   // outer, center, outer

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
            stroke: color,
            strokeWidth: STROKE,
            strokeLineCap: 'round',
            selectable: false,
        });
    });

    // ── Cursor arrow ─────────────────────────────────────────────
    const pathData = cursorPath(TIP_X, TIP_Y);

    const arrowFill = new fabric.Path(pathData, {
        fill: '#ffffff', stroke: 'none', strokeWidth: 0,
    });
    const arrowBorder = new fabric.Path(pathData, {
        fill: 'none',
        stroke: DARK,
        strokeWidth: STROKE,
        strokeLineJoin: 'round',
        strokeLineCap: 'round',
    });



    // ── Assemble ─────────────────────────────────────────────────
    const group = new fabric.Group(
        [...motionLines, arrowFill, arrowBorder],
        { left, top, originX: 'left', originY: 'top', ...controlConfig } as fabric.GroupProps
    );

    group.set('isClickIcon', true);
    group.set('clickType', clickType);
    group.set('clickColor', color);

    return group;
}
