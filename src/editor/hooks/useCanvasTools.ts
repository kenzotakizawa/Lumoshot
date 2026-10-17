import { useEffect, useRef } from 'react';
import { Canvas, PencilBrush } from 'fabric';
import type { TPointerEventInfo } from 'fabric';

import type { DrawToolContext } from '../utils/drawTools/types';
import { rectMouseDown, rectMouseMove, rectMouseUp } from '../utils/drawTools/rect';
import { ellipseMouseDown, ellipseMouseMove, ellipseMouseUp } from '../utils/drawTools/ellipse';
import { arrowMouseDown, arrowMouseMove, arrowMouseUp } from '../utils/drawTools/arrow';
import { textMouseDown } from '../utils/drawTools/text';
import { stepNumberMouseDown } from '../utils/drawTools/stepNumber';
import { spotlightMouseDown, spotlightMouseMove, spotlightMouseUp, spotlightAfterRender } from '../utils/drawTools/spotlight';
import { blurMouseDown, blurMouseMove, blurMouseUp } from '../utils/drawTools/blur';
import { speechBubbleMouseDown, speechBubbleMouseMove, speechBubbleMouseUp } from '../utils/drawTools/speechBubble';
import { clickIconMouseDown, clickIconMouseMove, clickIconMouseUp } from '../utils/drawTools/clickIcon';
import { zoomMouseDown, zoomMouseMove, zoomMouseUp, zoomAfterRender } from '../utils/drawTools/zoom';
import type { ArrowStyle } from '../utils/drawTools/arrow';
import { applyRedaction, isRedaction, normalizeRedactionGeometry, type RedactMode } from '../utils/redaction';

// Re-export for external consumers
export { updateSpeechBubble, createSpeechBubblePath } from '../utils/drawTools/speechBubble';

export type ToolType = 'select' | 'rect' | 'arrow' | 'text' | 'spotlight-rect' | 'spotlight-ellipse' | 'blur-rect' | 'step-number' | 'pen' | 'highlighter' | 'rounded-rect' | 'ellipse' | 'speech-bubble' | 'click-icon' | 'zoom-rect' | 'zoom-ellipse';

const controlConfig = {
    transparentCorners: false,
    cornerColor: '#ffffff',
    cornerStrokeColor: '#0066ff',
    borderColor: '#0066ff',
    cornerSize: 10,
    padding: 0,
    cornerStyle: 'circle' as const,
    borderDashArray: [4, 4]
};

export const useCanvasTools = (
    canvas: Canvas | null,
    currentTool: ToolType,
    strokeColor: string = '#FF0000',
    strokeWidth: number = 4,
    fontColor: string = '#ffffff',
    fontSize: number = 24,
    arrowStyle: ArrowStyle = 'straight',
    bubbleFillColor: string = '#ffffff',
    onToolComplete?: () => void,
    clickIconScheme: 'dark' | 'light' = 'dark',
    redactMode: RedactMode = 'fill',
    redactStrength: number = 12
) => {
    const isDrawing = useRef(false);
    const startX = useRef(0);
    const startY = useRef(0);
    const currentShape = useRef<any>(null);

    useEffect(() => {
        if (!canvas) return;

        // Build the shared context object for tool handlers
        const ctx: DrawToolContext = {
            strokeColor, strokeWidth, fontColor, fontSize,
            arrowStyle, bubbleFillColor,
            controlConfig, isDrawing, startX, startY, currentShape,
            onToolComplete, clickIconScheme, redactMode, redactStrength
        };

        // While a shape is being dragged out, the Editor must not snapshot it
        // on 'object:added' (that recorded half-drawn shapes into undo
        // history). The finished shape is committed once, on completion.
        const setDrawingInProgress = (on: boolean) => {
            (canvas as any).__lumoshotDrawing = on;
        };
        const commitShape = (shape: any) => {
            if (!shape) return;
            // Object-level listeners (e.g. speech bubble layout) + the canvas
            // event the Editor's undo/autosave listens to.
            if (shape.fire) shape.fire('modified');
            canvas.fire('object:modified' as any, { target: shape });
        };

        const completeCreatedShape = (emitModified = false) => {
            const shape = currentShape.current;
            if (!shape) return;
            setDrawingInProgress(false);

            if (canvas.contains(shape)) {
                if (emitModified) commitShape(shape);
                canvas.setActiveObject(shape);
            }
            currentShape.current = null;
            canvas.requestRenderAll();
        };

        // Reset state when tool changes
        canvas.selection = currentTool === 'select';
        canvas.defaultCursor = currentTool === 'select' ? 'default' : 'crosshair';

        // Handle Free Drawing modes. `fabric` is already statically imported
        // above, so PencilBrush no longer needs a dynamic import() (it only
        // produced a spurious bundler warning, since fabric can't actually be
        // split into a separate chunk here).
        if (currentTool === 'pen' || currentTool === 'highlighter') {
            canvas.isDrawingMode = true;
            const brush = new PencilBrush(canvas);
            let brushColor = strokeColor;
            let brushWidth = strokeWidth;

            if (currentTool === 'highlighter') {
                brushColor = strokeColor + '80';
                brushWidth = Math.max(20, strokeWidth * 2);
            }

            brush.color = brushColor;
            brush.width = brushWidth;
            canvas.freeDrawingBrush = brush;
        } else {
            canvas.isDrawingMode = false;
        }

        // Disable selection on existing objects if drawing
        canvas.forEachObject(obj => {
            if (obj.get('isBackground') || obj.get('isFrame')) return;
            if (obj.get('hoverCursor') === 'default') return;
            obj.selectable = currentTool === 'select';
            obj.evented = currentTool === 'select';
        });

        // ─── Mouse Down Dispatcher ─────────────────────────────────

        const handleMouseDown = (opt: TPointerEventInfo) => {
            if (currentTool === 'select') return;

            const pointer = canvas.getScenePoint(opt.e);

            if (currentTool === 'arrow'
                && (arrowStyle === 'curved' || arrowStyle === 'elbow')
                && isDrawing.current
                && currentShape.current?.kind === `${arrowStyle}-arrow`) {
                const result = arrowMouseDown(canvas, pointer, ctx, (opt.e as MouseEvent).detail || 1);
                if (result?.completed) {
                    isDrawing.current = false;
                    completeCreatedShape(true);
                }
                canvas.requestRenderAll();
                return;
            }

            // If the user clicks on an existing (non-background) object, switch to select
            // so they can move/resize it. Objects have evented:false during drawing, so we
            // use containsPoint instead of relying on opt.target.
            const clickedObj = [...canvas.getObjects()].reverse().find(obj => {
                if (obj.get('isBackground') || obj.get('isFrame')) return false;
                if (obj.get('hoverCursor') === 'default') return false;
                return obj.containsPoint(pointer);
            });
            if (clickedObj) {
                clickedObj.selectable = true;
                clickedObj.evented = true;
                canvas.setActiveObject(clickedObj);
                canvas.requestRenderAll();
                onToolComplete?.();
                return;
            }

            isDrawing.current = true;
            startX.current = pointer.x;
            startY.current = pointer.y;

            // Set before the tool adds its shape, so that 'object:added' is
            // already suppressed for it.
            setDrawingInProgress(true);
            switch (currentTool) {
                case 'rect':
                    rectMouseDown(canvas, pointer, ctx, false);
                    break;
                case 'rounded-rect':
                    rectMouseDown(canvas, pointer, ctx, true);
                    break;
                case 'ellipse':
                    ellipseMouseDown(canvas, pointer, ctx);
                    break;
                case 'arrow':
                    arrowMouseDown(canvas, pointer, ctx, (opt.e as MouseEvent).detail || 1);
                    break;
                case 'text':
                    textMouseDown(canvas, pointer, ctx);
                    break;
                case 'step-number':
                    stepNumberMouseDown(canvas, pointer, ctx);
                    break;
                case 'spotlight-rect':
                    spotlightMouseDown(canvas, pointer, ctx, false);
                    break;
                case 'spotlight-ellipse':
                    spotlightMouseDown(canvas, pointer, ctx, true);
                    break;
                case 'blur-rect':
                    blurMouseDown(canvas, pointer, ctx);
                    break;
                case 'speech-bubble':
                    speechBubbleMouseDown(canvas, pointer, ctx);
                    break;
                case 'click-icon':
                    clickIconMouseDown(canvas, pointer, ctx);
                    break;
                case 'zoom-rect':
                    zoomMouseDown(canvas, pointer, ctx, false);
                    break;
                case 'zoom-ellipse':
                    zoomMouseDown(canvas, pointer, ctx, true);
                    break;
            }
            // Tools that didn't start a drag (nothing to finish on mouseup)
            if (!currentShape.current) setDrawingInProgress(false);
        };

        // ─── Mouse Move Dispatcher ─────────────────────────────────

        const handleMouseMove = (opt: TPointerEventInfo) => {
            if (!isDrawing.current || !currentShape.current) return;

            const pointer = canvas.getScenePoint(opt.e);

            switch (currentTool) {
                case 'rect':
                case 'rounded-rect':
                    rectMouseMove(canvas, pointer, ctx);
                    break;
                case 'ellipse':
                    ellipseMouseMove(canvas, pointer, ctx);
                    break;
                case 'arrow':
                    arrowMouseMove(canvas, pointer, ctx);
                    break;
                case 'spotlight-rect':
                    spotlightMouseMove(canvas, pointer, ctx, false);
                    break;
                case 'spotlight-ellipse':
                    spotlightMouseMove(canvas, pointer, ctx, true);
                    break;
                case 'blur-rect':
                    blurMouseMove(canvas, pointer, ctx);
                    break;
                case 'speech-bubble':
                    speechBubbleMouseMove(canvas, pointer, ctx);
                    break;
                case 'click-icon':
                    clickIconMouseMove(canvas, pointer, ctx);
                    break;
                case 'zoom-rect':
                    zoomMouseMove(canvas, pointer, ctx, false);
                    break;
                case 'zoom-ellipse':
                    zoomMouseMove(canvas, pointer, ctx, true);
                    break;
            }
            canvas.requestRenderAll();
        };

        // ─── Mouse Up Dispatcher ───────────────────────────────────

        const handleMouseUp = () => {
            if (!isDrawing.current) return;
            if (currentTool === 'arrow'
                && (currentShape.current?.kind === 'curved-arrow' || currentShape.current?.kind === 'elbow-arrow')) return;

            isDrawing.current = false;
            setDrawingInProgress(false);

            if (currentShape.current) {
                switch (currentTool) {
                    case 'click-icon':
                        clickIconMouseUp(canvas, ctx);
                        break;
                    case 'speech-bubble':
                        speechBubbleMouseUp(canvas, ctx);
                        break;
                    case 'rect':
                    case 'rounded-rect':
                        rectMouseUp(canvas, ctx);
                        break;
                    case 'ellipse':
                        ellipseMouseUp(canvas, ctx);
                        break;
                    case 'blur-rect':
                        blurMouseUp(canvas, ctx);
                        break;
                    case 'arrow':
                        arrowMouseUp(canvas, ctx);
                        break;
                    case 'spotlight-rect':
                        spotlightMouseUp(canvas, ctx, false);
                        break;
                    case 'spotlight-ellipse':
                        spotlightMouseUp(canvas, ctx, true);
                        break;
                    case 'zoom-rect':
                        zoomMouseUp(canvas, ctx, false);
                        break;
                    case 'zoom-ellipse':
                        zoomMouseUp(canvas, ctx, true);
                        break;
                }

                // Commit the finished shape to undo history / autosave
                if (currentShape.current) {
                    const shape = currentShape.current;
                    if (canvas.contains(shape) || canvas.contains(shape.line)) commitShape(shape);
                }

                // Auto-select the created object; stay in current tool for continuous creation
                completeCreatedShape();
                if (currentTool === 'speech-bubble' || currentTool === 'click-icon') {
                    onToolComplete?.();
                }
            }
        };

        // ─── After Render (Spotlight Overlay) ──────────────────────

        const handleAfterRender = ({ ctx }: { ctx: CanvasRenderingContext2D }) => {
            // fabric also fires after:render for the upper (selection/controls)
            // layer; the overlays belong to the document layer only.
            if (ctx === canvas.contextTop) return;
            spotlightAfterRender(canvas, ctx);
            zoomAfterRender(canvas, ctx);
        };

        // Mosaic/blur redactions show the image under them, so re-align their
        // pattern whenever they're moved/resized/rotated (alone or as part of
        // a multi-selection). Registered on the canvas rather than per object
        // so it also covers objects restored from undo history or autosave.
        const handleTransforming = (opt: { target?: any }) => {
            const target = opt.target;
            if (!target) return;
            const objs = target.type === 'activeSelection' ? target.getObjects() : [target];
            for (const o of objs) if (isRedaction(o)) applyRedaction(canvas, o);
        };
        // Once a move/resize ends, snap redactions to whole pixels so mosaic
        // blocks stay crisp (see normalizeRedactionGeometry).
        const handleTransformEnd = (opt: { target?: any }) => {
            const target = opt.target;
            if (target && isRedaction(target)) normalizeRedactionGeometry(target);
            handleTransforming(opt);
        };

        canvas.on('mouse:down', handleMouseDown);
        canvas.on('mouse:move', handleMouseMove);
        canvas.on('mouse:up', handleMouseUp);
        canvas.on('after:render', handleAfterRender);
        canvas.on('object:moving', handleTransforming);
        canvas.on('object:scaling', handleTransforming);
        canvas.on('object:rotating', handleTransforming);
        canvas.on('object:modified', handleTransformEnd);

        return () => {
            setDrawingInProgress(false);
            canvas.off('mouse:down', handleMouseDown);
            canvas.off('mouse:move', handleMouseMove);
            canvas.off('mouse:up', handleMouseUp);
            canvas.off('after:render', handleAfterRender);
            canvas.off('object:moving', handleTransforming);
            canvas.off('object:scaling', handleTransforming);
            canvas.off('object:rotating', handleTransforming);
            canvas.off('object:modified', handleTransformEnd);
        };
    }, [canvas, currentTool, strokeColor, strokeWidth, fontColor, fontSize, arrowStyle, bubbleFillColor, clickIconScheme, redactMode, redactStrength]);
};
