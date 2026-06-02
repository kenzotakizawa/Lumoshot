import { Canvas, Group, Line, Path, Polygon } from 'fabric';
import type { DrawToolContext } from './types';

export type ArrowStyle = 'straight' | 'curved' | 'elbow';

interface Point {
    x: number;
    y: number;
}

interface PathArrowShape {
    kind: 'curved-arrow' | 'elbow-arrow';
    path: Path;
    arrowHead: Polygon;
    points: Point[];
    previewPoint?: Point;
    style: ArrowStyle;
}

const MIN_ARROW_DISTANCE = 5;
const DEFAULT_HEAD_LENGTH = 15;
const ELBOW_SNAP_THRESHOLD = 12;

const pathOptions = (ctx: DrawToolContext) => ({
    stroke: ctx.strokeColor,
    strokeWidth: ctx.strokeWidth,
    fill: '',
    strokeLineCap: 'round' as const,
    strokeLineJoin: 'round' as const,
    selectable: false,
    evented: false,
});

const createArrowHead = (point: Point, color: string) => new Polygon([
    { x: 0, y: 0 },
    { x: -DEFAULT_HEAD_LENGTH, y: DEFAULT_HEAD_LENGTH / 2 },
    { x: -DEFAULT_HEAD_LENGTH, y: -DEFAULT_HEAD_LENGTH / 2 }
], {
    fill: color,
    selectable: false,
    evented: false,
    left: point.x,
    top: point.y,
    originX: 'center',
    originY: 'center'
});

const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

const appendPoint = (points: Point[], point: Point) => {
    const lastPoint = points[points.length - 1];
    return lastPoint && distance(lastPoint, point) < 2 ? points : [...points, point];
};

const pathPoint = (point: Point) => `${point.x} ${point.y}`;

const buildLinePathData = (points: Point[]) => {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${pathPoint(points[0])}`;
    return `M ${pathPoint(points[0])} ${points.slice(1).map(point => `L ${pathPoint(point)}`).join(' ')}`;
};

const snapElbowPoint = (previous: Point, point: Point) => {
    const dx = point.x - previous.x;
    const dy = point.y - previous.y;

    if (Math.abs(dy) <= ELBOW_SNAP_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
        return { x: point.x, y: previous.y };
    }

    if (Math.abs(dx) <= ELBOW_SNAP_THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
        return { x: previous.x, y: point.y };
    }

    return point;
};

const snapElbowControlPoints = (points: Point[]) => {
    if (points.length < 2) return points;

    return points.slice(1).reduce<Point[]>((snappedPoints, point) => {
        const previous = snappedPoints[snappedPoints.length - 1];
        snappedPoints.push(snapElbowPoint(previous, point));
        return snappedPoints;
    }, [points[0]]);
};

const buildElbowPoints = (points: Point[]) => {
    const snappedPoints = snapElbowControlPoints(points);
    if (snappedPoints.length < 2) return snappedPoints;

    return snappedPoints.slice(1).reduce<Point[]>((pathPoints, point) => {
        const previous = pathPoints[pathPoints.length - 1];
        const corner = { x: point.x, y: previous.y };

        if (distance(previous, corner) >= 2) pathPoints.push(corner);
        if (distance(pathPoints[pathPoints.length - 1], point) >= 2) pathPoints.push(point);

        return pathPoints;
    }, [snappedPoints[0]]);
};

const buildCurvePathData = (points: Point[]) => {
    if (points.length < 3) return buildLinePathData(points);

    let data = `M ${pathPoint(points[0])}`;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i - 1] || points[i];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2] || p2;
        const cp1 = {
            x: p1.x + (p2.x - p0.x) / 6,
            y: p1.y + (p2.y - p0.y) / 6
        };
        const cp2 = {
            x: p2.x - (p3.x - p1.x) / 6,
            y: p2.y - (p3.y - p1.y) / 6
        };
        data += ` C ${pathPoint(cp1)} ${pathPoint(cp2)} ${pathPoint(p2)}`;
    }
    return data;
};

const getRenderablePoints = (points: Point[], style: ArrowStyle) => (
    style === 'elbow' ? buildElbowPoints(points) : points
);

const getPathData = (points: Point[], style: ArrowStyle) => (
    style === 'curved'
        ? buildCurvePathData(points)
        : buildLinePathData(getRenderablePoints(points, style))
);

const setPathData = (path: Path, points: Point[], style: ArrowStyle) => {
    (path as Path & { _setPath: (path: string, adjustPosition?: boolean) => void })._setPath(getPathData(points, style), true);
    path.setCoords();
};

const getHeadAngle = (points: Point[]) => {
    const end = points[points.length - 1];
    const prev = points[points.length - 2] || end;
    return Math.atan2(end.y - prev.y, end.x - prev.x) * 180 / Math.PI;
};

const updatePathArrow = (shape: PathArrowShape, points: Point[]) => {
    shape.previewPoint = points[points.length - 1];
    setPathData(shape.path, points, shape.style);

    const renderPoints = getRenderablePoints(points, shape.style);
    const end = renderPoints[renderPoints.length - 1];
    shape.arrowHead.set({
        left: end.x,
        top: end.y,
        angle: getHeadAngle(renderPoints)
    });
    shape.arrowHead.setCoords();
};

const finishPathArrow = (canvas: Canvas, ctx: DrawToolContext, shape: PathArrowShape, points: Point[]) => {
    const start = points[0];
    const end = points[points.length - 1];
    if (!start || !end || distance(start, end) < MIN_ARROW_DISTANCE) {
        canvas.remove(shape.path, shape.arrowHead);
        ctx.currentShape.current = null;
        return { completed: true };
    }

    updatePathArrow(shape, points);
    canvas.remove(shape.path, shape.arrowHead);
    const arrowGroup = new Group([shape.path, shape.arrowHead], {
        selectable: true,
        evented: true,
        ...ctx.controlConfig
    });
    (arrowGroup as Group & { isArrow: boolean; arrowStyle: ArrowStyle }).isArrow = true;
    (arrowGroup as Group & { isArrow: boolean; arrowStyle: ArrowStyle }).arrowStyle = shape.style;
    canvas.add(arrowGroup);
    ctx.currentShape.current = arrowGroup;
    return { completed: true };
};

/**
 * mouseDown handler for arrow tool.
 */
export function arrowMouseDown(
    canvas: Canvas,
    pointer: Point,
    ctx: DrawToolContext,
    clickCount = 1
) {
    const style = ctx.arrowStyle || 'straight';

    if (style === 'curved' || style === 'elbow') {
        const activeShape = ctx.currentShape.current as PathArrowShape | null;
        if (activeShape?.kind === `${style}-arrow`) {
            const nextPoints = appendPoint(activeShape.points, pointer);
            if (clickCount >= 2) {
                return finishPathArrow(canvas, ctx, activeShape, nextPoints);
            }

            activeShape.points = nextPoints;
            updatePathArrow(activeShape, nextPoints);
            return { completed: false };
        }

        const path = new Path(getPathData([pointer, pointer], style), pathOptions(ctx));
        const arrowHead = createArrowHead(pointer, ctx.strokeColor);
        ctx.currentShape.current = {
            kind: `${style}-arrow`,
            path,
            arrowHead,
            points: [pointer],
            previewPoint: pointer,
            style
        } satisfies PathArrowShape;
        canvas.add(path, arrowHead);
        return { completed: false };
    }

    const { strokeColor, strokeWidth } = ctx;

    const line = new Line([pointer.x, pointer.y, pointer.x, pointer.y], {
        stroke: strokeColor,
        strokeWidth: strokeWidth,
        selectable: false,
        evented: false,
    });

    const arrowHead = createArrowHead(pointer, strokeColor);

    ctx.currentShape.current = { line, arrowHead, style: 'straight' };
    canvas.add(line, arrowHead);
    return { completed: false };
}

/**
 * mouseMove handler for arrow tool.
 */
export function arrowMouseMove(
    _canvas: Canvas,
    pointer: Point,
    ctx: DrawToolContext
) {
    const shape = ctx.currentShape.current;
    if (!shape) return;

    if (shape.kind === 'curved-arrow' || shape.kind === 'elbow-arrow') {
        updatePathArrow(shape, [...shape.points, pointer]);
        return;
    }

    const { line, arrowHead } = shape;

    line.set({
        x2: pointer.x,
        y2: pointer.y
    });

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
    const shape = ctx.currentShape.current;
    if (!shape) return;

    const { line, arrowHead } = shape;
    const dx = Math.abs(line.x2! - line.x1!);
    const dy = Math.abs(line.y2! - line.y1!);
    if (dx < MIN_ARROW_DISTANCE && dy < MIN_ARROW_DISTANCE) {
        canvas.remove(line, arrowHead);
        ctx.currentShape.current = null;
    } else {
        canvas.remove(line, arrowHead);
        const arrowGroup = new Group([line, arrowHead], {
            selectable: true,
            evented: true,
            ...ctx.controlConfig
        });
        (arrowGroup as Group & { isArrow: boolean; arrowStyle: ArrowStyle }).isArrow = true;
        (arrowGroup as Group & { isArrow: boolean; arrowStyle: ArrowStyle }).arrowStyle = 'straight';
        canvas.add(arrowGroup);
        ctx.currentShape.current = arrowGroup;
    }
    return { completed: true };
}
