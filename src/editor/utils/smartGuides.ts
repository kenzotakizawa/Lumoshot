import { Canvas, Line, IText, Rect, Group } from 'fabric';

export const initSmartGuides = (canvas: Canvas) => {
    const snapDistance = 5; // Reduced from 8 for smoother, less severe UX
    const lineColor = 'rgba(0, 150, 255, 0.7)'; // iOS/macOS active blue
    const lineWidth = 1;
    const textLabelBg = 'rgba(0, 150, 255, 0.9)';

    let guideElements: any[] = [];

    const clearGuides = () => {
        guideElements.forEach(el => canvas.remove(el));
        guideElements = [];
        canvas.requestRenderAll();
    };

    canvas.on('mouse:up', clearGuides);

    canvas.on('object:moving', (e) => {
        clearGuides();

        const activeObject = e.target;
        if (!activeObject) return;

        // Skip snapping if background or if multiple objects are selected
        if (activeObject.type === 'activeSelection') return;

        // For step numbers, we want a stronger, magnetic "snap" feeling
        const currentSnapDist = activeObject.get('isStepNumber') ? 12 : snapDistance;

        // Find reference objects
        const referenceObjects = canvas.getObjects().filter(o =>
            o !== activeObject &&
            o.visible !== false &&
            o.type !== 'activeSelection' &&
            !o.get('isSpotlight') &&
            !o.get('isBlur') &&
            !o.get('isGuide') &&
            !(o.type === 'circle' && o.get('isFrame')) // Ignore the small macOS frame dots
        );

        if (referenceObjects.length === 0) return;

        // Current boundaries of moving object
        const activeBounds = activeObject.getBoundingRect();
        const aL = activeBounds.left;
        const aR = activeBounds.left + activeBounds.width;
        const aC = activeBounds.left + activeBounds.width / 2;
        const aT = activeBounds.top;
        const aB = activeBounds.top + activeBounds.height;
        const aM = activeBounds.top + activeBounds.height / 2;

        let snapX: number | null = null;
        let snapY: number | null = null;
        let linesToDraw: any[] = [];

        // 1. ALIGNMENT SNAPPING (Edges and Center)
        for (const obj of referenceObjects) {
            const b = obj.getBoundingRect();
            const oL = b.left;
            const oR = b.left + b.width;
            const oC = b.left + b.width / 2;
            const oT = b.top;
            const oB = b.top + b.height;
            const oM = b.top + b.height / 2;

            // X-Axis Alignment
            if (snapX === null) {
                if (Math.abs(aC - oC) < currentSnapDist) {
                    snapX = oC - activeBounds.width / 2;
                    linesToDraw.push({ x: oC, type: 'y' });
                } else if (Math.abs(aL - oL) < currentSnapDist) {
                    snapX = oL;
                    linesToDraw.push({ x: oL, type: 'y' });
                } else if (Math.abs(aR - oR) < currentSnapDist) {
                    snapX = oR - activeBounds.width;
                    linesToDraw.push({ x: oR, type: 'y' });
                } else if (Math.abs(aL - oR) < currentSnapDist) {
                    snapX = oR;
                    linesToDraw.push({ x: oR, type: 'y' });
                } else if (Math.abs(aR - oL) < currentSnapDist) {
                    snapX = oL - activeBounds.width;
                    linesToDraw.push({ x: oL, type: 'y' });
                }
            }

            // Y-Axis Alignment
            if (snapY === null) {
                if (Math.abs(aM - oM) < currentSnapDist) {
                    snapY = oM - activeBounds.height / 2;
                    linesToDraw.push({ y: oM, type: 'x' });
                } else if (Math.abs(aT - oT) < currentSnapDist) {
                    snapY = oT;
                    linesToDraw.push({ y: oT, type: 'x' });
                } else if (Math.abs(aB - oB) < currentSnapDist) {
                    snapY = oB - activeBounds.height;
                    linesToDraw.push({ y: oB, type: 'x' });
                } else if (Math.abs(aT - oB) < currentSnapDist) {
                    snapY = oB;
                    linesToDraw.push({ y: oB, type: 'x' });
                } else if (Math.abs(aB - oT) < currentSnapDist) {
                    snapY = oT - activeBounds.height;
                    linesToDraw.push({ y: oT, type: 'x' });
                }
            }
        }

        // 2. EQUIDISTANT (GAP) SNAPPING
        // Collect all gaps between reference objects
        // We only consider objects that are aligned (centers or edges roughly match) on the opposite axis.

        interface GapOptions {
            x1?: number; x2?: number; y1?: number; y2?: number;
            gap: number;
            coord: number;
            dir: 'horizontal' | 'vertical';
        }

        const addGapIndicator = (opts: GapOptions) => {
            if (opts.dir === 'horizontal') {
                const { x1, x2, gap, coord } = opts;
                if (x1 === undefined || x2 === undefined) return;

                const minX = Math.min(x1, x2);
                const maxX = Math.max(x1, x2);

                // Draw connecting line
                const l = new Line([minX, coord, maxX, coord], { stroke: lineColor, strokeWidth: lineWidth, selectable: false, evented: false, isGuide: true });

                // Draw Text pill
                const t = new IText(Math.round(gap).toString(), {
                    fontSize: 12, fill: '#fff', originX: 'center', originY: 'center', fontFamily: 'sans-serif'
                });
                const padding = 4;
                const r = new Rect({
                    width: t.width! + padding * 2, height: t.height! + padding * 2,
                    fill: textLabelBg, rx: 4, ry: 4, originX: 'center', originY: 'center', selectable: false, evented: false
                });
                const g = new Group([r, t], { left: minX + gap / 2, top: coord, originX: 'center', originY: 'center', selectable: false, evented: false });
                g.set('isGuide', true);

                guideElements.push(l, g);
            } else {
                const { y1, y2, gap, coord } = opts;
                if (y1 === undefined || y2 === undefined) return;

                const minY = Math.min(y1, y2);
                const maxY = Math.max(y1, y2);

                const l = new Line([coord, minY, coord, maxY], { stroke: lineColor, strokeWidth: lineWidth, selectable: false, evented: false, isGuide: true });

                const t = new IText(Math.round(gap).toString(), {
                    fontSize: 12, fill: '#fff', originX: 'center', originY: 'center', fontFamily: 'sans-serif'
                });
                const padding = 4;
                const r = new Rect({
                    width: t.width! + padding * 2, height: t.height! + padding * 2,
                    fill: textLabelBg, rx: 4, ry: 4, originX: 'center', originY: 'center', selectable: false, evented: false
                });
                const g = new Group([r, t], { left: coord, top: minY + gap / 2, originX: 'center', originY: 'center', selectable: false, evented: false });
                g.set('isGuide', true);

                guideElements.push(l, g);
            }
        };

        if (snapX === null || snapY === null) {
            const tolerance = 5;

            // Horizontal Gap Snapping
            if (snapX === null && referenceObjects.length >= 2) {
                for (let i = 0; i < referenceObjects.length - 1; i++) {
                    for (let j = i + 1; j < referenceObjects.length; j++) {
                        const o1 = referenceObjects[i].getBoundingRect();
                        const o2 = referenceObjects[j].getBoundingRect();

                        // Only consider horizontal gaps if they roughly align vertically
                        if (Math.abs(o1.top + o1.height / 2 - (o2.top + o2.height / 2)) > tolerance * 10) continue;

                        const [leftObj, rightObj] = o1.left < o2.left ? [o1, o2] : [o2, o1];
                        const gap = rightObj.left - (leftObj.left + leftObj.width);
                        if (gap <= 0) continue;

                        // Check if active object can snap to this gap (Active -> Left, or Active -> Right)

                        // Active is Right of rightObj
                        const expectedRightLeft = rightObj.left + rightObj.width + gap;
                        if (Math.abs(aL - expectedRightLeft) < currentSnapDist) {
                            snapX = expectedRightLeft - aL + aL; // Simplify: snapX = expectedRightLeft
                            // Add gap indicators
                            addGapIndicator({ x1: leftObj.left + leftObj.width, x2: rightObj.left, gap, coord: leftObj.top + leftObj.height / 2, dir: 'horizontal' });
                            addGapIndicator({ x1: rightObj.left + rightObj.width, x2: expectedRightLeft, gap, coord: leftObj.top + leftObj.height / 2, dir: 'horizontal' });
                        }

                        // Active is Left of leftObj
                        const expectedLeftRight = leftObj.left - gap - activeBounds.width;
                        if (Math.abs(aL - expectedLeftRight) < currentSnapDist) {
                            snapX = expectedLeftRight;
                            addGapIndicator({ x1: expectedLeftRight + activeBounds.width, x2: leftObj.left, gap, coord: leftObj.top + leftObj.height / 2, dir: 'horizontal' });
                            addGapIndicator({ x1: leftObj.left + leftObj.width, x2: rightObj.left, gap, coord: leftObj.top + leftObj.height / 2, dir: 'horizontal' });
                        }
                    }
                }
            }

            // Vertical Gap Snapping
            if (snapY === null && referenceObjects.length >= 2) {
                for (let i = 0; i < referenceObjects.length - 1; i++) {
                    for (let j = i + 1; j < referenceObjects.length; j++) {
                        const o1 = referenceObjects[i].getBoundingRect();
                        const o2 = referenceObjects[j].getBoundingRect();

                        // Only consider vertical gaps if they roughly align horizontally
                        if (Math.abs(o1.left + o1.width / 2 - (o2.left + o2.width / 2)) > tolerance * 10) continue;

                        const [topObj, bottomObj] = o1.top < o2.top ? [o1, o2] : [o2, o1];
                        const gap = bottomObj.top - (topObj.top + topObj.height);
                        if (gap <= 0) continue;

                        // Active is Below bottomObj
                        const expectedBelowTop = bottomObj.top + bottomObj.height + gap;
                        if (Math.abs(aT - expectedBelowTop) < currentSnapDist) {
                            snapY = expectedBelowTop;
                            addGapIndicator({ y1: topObj.top + topObj.height, y2: bottomObj.top, gap, coord: topObj.left + topObj.width / 2, dir: 'vertical' });
                            addGapIndicator({ y1: bottomObj.top + bottomObj.height, y2: expectedBelowTop, gap, coord: topObj.left + topObj.width / 2, dir: 'vertical' });
                        }

                        // Active is Above topObj
                        const expectedAboveBottom = topObj.top - gap - activeBounds.height;
                        if (Math.abs(aT - expectedAboveBottom) < currentSnapDist) {
                            snapY = expectedAboveBottom;
                            addGapIndicator({ y1: expectedAboveBottom + activeBounds.height, y2: topObj.top, gap, coord: topObj.left + topObj.width / 2, dir: 'vertical' });
                            addGapIndicator({ y1: topObj.top + topObj.height, y2: bottomObj.top, gap, coord: topObj.left + topObj.width / 2, dir: 'vertical' });
                        }
                    }
                }
            }
        }

        // Apply calculated snapping coordinates
        if (snapX !== null || snapY !== null) {
            // Adjust the object bounding rect back to coordinate space taking origin into account
            const dx = activeObject.left! - activeBounds.left;
            const dy = activeObject.top! - activeBounds.top;

            if (snapX !== null) activeObject.set('left', snapX + dx);
            if (snapY !== null) activeObject.set('top', snapY + dy);

            // Draw alignment lines
            const drawLen = 9999;
            linesToDraw.forEach(l => {
                let line: Line | null = null;
                if (l.type === 'x') {
                    line = new Line([-drawLen, l.y, drawLen, l.y], {
                        stroke: lineColor, strokeWidth: lineWidth, selectable: false, evented: false, isGuide: true
                    });
                } else if (l.type === 'y') {
                    line = new Line([l.x, -drawLen, l.x, drawLen], {
                        stroke: lineColor, strokeWidth: lineWidth, selectable: false, evented: false, isGuide: true
                    });
                }
                if (line) guideElements.push(line);
            });
        }

        // Add all lines/labels to canvas
        guideElements.forEach(el => canvas.add(el));
    });
};
