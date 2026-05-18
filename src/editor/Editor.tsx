import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Canvas, FabricImage, Rect, Shadow, Circle as FabricCircle, Line, ActiveSelection, IText } from 'fabric';
import { useCanvasTools } from './hooks/useCanvasTools';
import type { ToolType } from './hooks/useCanvasTools';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import SubHeader from './components/SubHeader';
import ResizeModal from './components/ResizeModal';
import BeforeAfterModal from './components/BeforeAfterModal';
import Ruler from './components/Ruler';
import { Check, X, Trash2 } from 'lucide-react';
import { initSmartGuides } from './utils/smartGuides';

interface CropRect {
    left: number;
    top: number;
    width: number;
    height: number;
    windowWidth: number;
    windowHeight: number;
    devicePixelRatio: number;
}

const Editor: React.FC = () => {
    const canvasEl = useRef<HTMLCanvasElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const fabricCanvas = useRef<Canvas | null>(null);
    const originalSize = useRef({ width: 800, height: 600 });
    const baseImageSize = useRef({ width: 800, height: 600 }); // Store physical image size securely

    const [status, setStatus] = useState<string>("Initializing...");
    const [currentTool, setCurrentTool] = useState<ToolType>('select');
    const [strokeColor, setStrokeColor] = useState<string>('#ff0000');
    const [strokeWidth, setStrokeWidth] = useState<number>(2);
    const [fontColor, setFontColor] = useState<string>('#ff0000');
    const [fontSize, setFontSize] = useState<number>(24);
    const [isBold, setIsBold] = useState<boolean>(false);
    const [isItalic, setIsItalic] = useState<boolean>(false);
    const [textBgColor, setTextBgColor] = useState<string>('transparent');
    const [zoomLevel, setZoomLevel] = useState<number>(1);
    const [hasFrame, setHasFrame] = useState<boolean>(false);
    const [isMultiSelection, setIsMultiSelection] = useState<boolean>(false);
    const [hasSelection, setHasSelection] = useState<boolean>(false);
    const [isBubbleSelected, setIsBubbleSelected] = useState<boolean>(false);
    const [showResizeModal, setShowResizeModal] = useState<boolean>(false);
    const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
    const [showRuler, setShowRuler] = useState<boolean>(true);
    const [isCropping, setIsCropping] = useState<boolean>(false);
    const [cropReady, setCropReady] = useState<boolean>(false);
    const [isBAMode, setIsBAMode] = useState<boolean>(false);
    const [showBAModal, setShowBAModal] = useState<boolean>(false);
    const [hasAfterImage, setHasAfterImage] = useState<boolean>(false);
    const beforeBAWidth = useRef<number>(0);
    const baHeaderHeight = useRef<number>(0);
    const afterImageDataUrl = useRef<string | null>(null);
    const [isLocked, setIsLocked] = useState<boolean>(false);
    const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; target: any | null }>({
        visible: false,
        x: 0,
        y: 0,
        target: null
    });
    const cropRectRef = useRef<Rect | null>(null);
    const cropDrawing = useRef<boolean>(false);
    const cropStartX = useRef<number>(0);
    const cropStartY = useRef<number>(0);

    const blurCanvasRef = useRef<HTMLCanvasElement | null>(null);

    // History states for Undo/Redo
    const history = useRef<string[]>([]);
    const redoStack = useRef<string[]>([]);
    const isHistoryProcessing = useRef<boolean>(false);
    const saveTimeout = useRef<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const clipboardRef = useRef<any>(null);

    const saveState = () => {
        if (saveTimeout.current !== null) {
            window.clearTimeout(saveTimeout.current);
        }

        saveTimeout.current = window.setTimeout(() => {
            const canvas = fabricCanvas.current;
            if (!canvas || isHistoryProcessing.current) return;

            // Include custom properties in JSON serialization
            const obj = canvas.toObject(['isBackground', 'isFrame', 'isSpotlight', 'isBlur', 'isStepNumber', 'stepValue', 'hoverCursor', 'selectable', 'evented', 'bubbleId', 'bubbleWidth', 'bubbleHeight', 'tipGlobalX', 'tipGlobalY', 'isAfterImage', 'isBALabel']);

            // Save canvas dimensions alongside object state
            const stateEntry = JSON.stringify({
                canvasData: obj,
                dimensions: { ...originalSize.current }
            });

            // Deduplicate: Don't push if the state is exactly the same as the last recorded state
            if (history.current.length > 0 && history.current[history.current.length - 1] === stateEntry) {
                return;
            }

            history.current.push(stateEntry);
            redoStack.current = [];
        }, 100);
    };

    const restoreState = (stateStr: string) => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;

        const parsed = JSON.parse(stateStr);

        // Restore dimensions if present (new format), fall back to current for old entries
        if (parsed.dimensions) {
            originalSize.current = { width: parsed.dimensions.width, height: parsed.dimensions.height };
            const scaledW = originalSize.current.width * zoomLevel;
            const scaledH = originalSize.current.height * zoomLevel;
            canvas.setDimensions({ width: scaledW, height: scaledH });
            canvas.setZoom(zoomLevel);
        }

        const canvasData = parsed.canvasData || parsed;
        canvas.loadFromJSON(canvasData, () => {
            canvas.requestRenderAll();
            isHistoryProcessing.current = false;
        });
    };

    const handleUndo = () => {
        const canvas = fabricCanvas.current;
        if (!canvas || history.current.length <= 1) return; // Need at least initial state + 1 action

        isHistoryProcessing.current = true;
        const currentState = history.current.pop()!;
        redoStack.current.push(currentState);

        const previousState = history.current[history.current.length - 1];
        restoreState(previousState);
    };

    const handleRedo = () => {
        const canvas = fabricCanvas.current;
        if (!canvas || redoStack.current.length === 0) return;

        isHistoryProcessing.current = true;
        const nextState = redoStack.current.pop()!;
        history.current.push(nextState);

        restoreState(nextState);
    };

    const handleAlignment = (action: string) => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;
        const activeObject = canvas.getActiveObject();
        if (!activeObject || activeObject.type !== 'activeSelection') return;

        const objects = (activeObject as ActiveSelection).getObjects();
        if (objects.length < 2) return;

        canvas.discardActiveObject();

        const bounds = objects.map(o => o.getBoundingRect());
        const minLeft = Math.min(...bounds.map(b => b.left));
        const maxRight = Math.max(...bounds.map(b => b.left + b.width));
        const minTop = Math.min(...bounds.map(b => b.top));
        const maxBottom = Math.max(...bounds.map(b => b.top + b.height));
        const centerX = minLeft + (maxRight - minLeft) / 2;
        const centerY = minTop + (maxBottom - minTop) / 2;

        objects.forEach(obj => {
            const bound = obj.getBoundingRect();
            const dx = obj.left! - bound.left;
            const dy = obj.top! - bound.top;

            if (action === 'left') {
                obj.set('left', minLeft + dx);
            } else if (action === 'center') {
                obj.set('left', centerX - bound.width / 2 + dx);
            } else if (action === 'right') {
                obj.set('left', maxRight - bound.width + dx);
            } else if (action === 'top') {
                obj.set('top', minTop + dy);
            } else if (action === 'middle') {
                obj.set('top', centerY - bound.height / 2 + dy);
            } else if (action === 'bottom') {
                obj.set('top', maxBottom - bound.height + dy);
            }
            obj.setCoords();
        });

        if (action === 'distribute-horizontal' || action === 'distribute-vertical') {
            const sorted = [...objects].sort((a, b) => {
                const aB = a.getBoundingRect();
                const bB = b.getBoundingRect();
                return action === 'distribute-horizontal' ? aB.left - bB.left : aB.top - bB.top;
            });

            if (action === 'distribute-horizontal') {
                const first = sorted[0].getBoundingRect();
                const last = sorted[sorted.length - 1].getBoundingRect();
                const totalGap = (last.left) - (first.left + first.width);
                let innerWidths = 0;
                for (let i = 1; i < sorted.length - 1; i++) innerWidths += sorted[i].getBoundingRect().width;

                const space = (totalGap - innerWidths) / (sorted.length - 1);
                let currentX = first.left + first.width;

                for (let i = 1; i < sorted.length - 1; i++) {
                    const obj = sorted[i];
                    const b = obj.getBoundingRect();
                    const dx = obj.left! - b.left;
                    obj.set('left', currentX + space + dx);
                    obj.setCoords();
                    currentX += space + b.width;
                }
            } else {
                const first = sorted[0].getBoundingRect();
                const last = sorted[sorted.length - 1].getBoundingRect();
                const totalGap = (last.top) - (first.top + first.height);
                let innerHeights = 0;
                for (let i = 1; i < sorted.length - 1; i++) innerHeights += sorted[i].getBoundingRect().height;

                const space = (totalGap - innerHeights) / (sorted.length - 1);
                let currentY = first.top + first.height;

                for (let i = 1; i < sorted.length - 1; i++) {
                    const obj = sorted[i];
                    const b = obj.getBoundingRect();
                    const dy = obj.top! - b.top;
                    obj.set('top', currentY + space + dy);
                    obj.setCoords();
                    currentY += space + b.height;
                }
            }
        }

        const sel = new ActiveSelection(objects, { canvas: canvas });
        canvas.setActiveObject(sel);
        canvas.requestRenderAll();
        saveState();
    };

    // Initialize custom canvas drawing tools hook
    useCanvasTools(fabricCanvas.current, currentTool, strokeColor, strokeWidth, fontColor, fontSize, blurCanvasRef.current, () => setCurrentTool('select'));

    useEffect(() => {
        if (!canvasEl.current) return;

        // Initialize canvas
        const canvas = new Canvas(canvasEl.current, {
            width: 800,
            height: 600,
            selection: true,
            preserveObjectStacking: true,
        });

        const checkSelection = (selectedObjs: any[]) => {
            if (!selectedObjs || selectedObjs.length === 0) {
                setHasSelection(false);
                setIsMultiSelection(false);
                setIsBubbleSelected(false);
                setIsLocked(false);
                setIsBold(false);
                setIsItalic(false);
                setTextBgColor('transparent');
                return;
            }

            setHasSelection(true);
            setIsMultiSelection(selectedObjs.length > 1);

            const isAnyLocked = selectedObjs.some((o: any) => o.lockMovementX || o.lockMovementY || o.lockScalingX || o.lockScalingY || o.lockRotation);
            setIsLocked(isAnyLocked);

            if (selectedObjs.length === 1) {
                const obj = selectedObjs[0];
                const bubbleId = obj.bubbleId || (typeof obj.get === 'function' && obj.get('bubbleId'));
                const isBubble = !!bubbleId;

                setIsBubbleSelected(isBubble);

                if (isBubble) {
                    let pathObj = null;
                    let textObj = null;

                    if (obj.type === 'group' || obj.type === 'Group') {
                        const objs = obj._objects || [];
                        pathObj = objs.find((o: any) => o.type === 'path' || o.type === 'Path');
                        textObj = objs.find((o: any) => o.type === 'textbox' || o.type === 'i-text' || o.type === 'text' || o.type === 'Textbox' || o.type === 'IText' || o.type === 'Text');
                    } else if (obj.type === 'textbox' || obj.type === 'i-text' || obj.type === 'text' || obj.type === 'Textbox' || obj.type === 'IText' || obj.type === 'Text') {
                        textObj = obj;
                    }

                    if (pathObj && pathObj.stroke) setStrokeColor(pathObj.stroke);
                    if (pathObj && pathObj.strokeWidth) setStrokeWidth(pathObj.strokeWidth);
                    if (textObj && textObj.fill) setFontColor(textObj.fill);
                    if (textObj && textObj.fontSize) setFontSize(textObj.fontSize);
                    if (textObj) {
                        setIsBold(textObj.fontWeight === 'bold');
                        setIsItalic(textObj.fontStyle === 'italic');
                        setTextBgColor(textObj.textBackgroundColor || 'transparent');
                    }
                } else if (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox' || obj.type === 'IText' || obj.type === 'Text' || obj.type === 'Textbox') {
                    if (obj.stroke) setStrokeColor(obj.stroke as string);
                    if (obj.fill) setFontColor(obj.fill as string);
                    if (obj.fontSize) setFontSize(obj.fontSize as number);
                    setIsBold(obj.fontWeight === 'bold');
                    setIsItalic(obj.fontStyle === 'italic');
                    setTextBgColor(obj.textBackgroundColor || 'transparent');
                } else {
                    setIsBold(false);
                    setIsItalic(false);
                    setTextBgColor('transparent');
                }
            } else {
                setIsBubbleSelected(false);
                setIsBold(false);
                setIsItalic(false);
                setTextBgColor('transparent');
            }
        };

        canvas.on('selection:created', (e) => {
            checkSelection(e.selected || []);
        });
        canvas.on('selection:updated', (e) => {
            checkSelection(e.selected || []);
        });
        canvas.on('selection:cleared', () => {
            checkSelection([]);
        });

        // Modern UI Customization for Controls (Canva / PowerPoint style)
        import('fabric').then(({ InteractiveFabricObject }) => {
            if (InteractiveFabricObject) {
                InteractiveFabricObject.ownDefaults = {
                    ...InteractiveFabricObject.ownDefaults,
                    transparentCorners: false,
                    cornerColor: '#ffffff',
                    cornerStrokeColor: '#0066ff',
                    borderColor: '#0066ff',
                    cornerSize: 10,
                    padding: 0,
                    cornerStyle: 'circle',
                    borderDashArray: [4, 4]
                };
            }

            // Set global canvas defaults for transparent target selection (smooth UX for hollow shapes)
            fabricCanvas.current!.getObjects().forEach(o => {
                o.set('perPixelTargetFind', true);
            });
        });

        fabricCanvas.current = canvas;

        // Initialize smart guides for better UX
        initSmartGuides(canvas);

        // Context Menu Handler
        canvas.on('mouse:down', (options: any) => {
            if (options.e.button === 2) { // Right click
                options.e.preventDefault();
                options.e.stopPropagation();

                // Select target if not already selected
                if (options.target) {
                    canvas.setActiveObject(options.target);
                    canvas.requestRenderAll();
                }

                const target = canvas.getActiveObject() || options.target;

                setContextMenu({
                    visible: true,
                    x: options.e.clientX,
                    y: options.e.clientY,
                    target: target
                });
            } else {
                setContextMenu(prev => prev.visible ? { ...prev, visible: false } : prev);
            }
        });

        // Hide Context Menu on canvas wheel
        canvas.on('mouse:wheel', () => {
            setContextMenu(prev => prev.visible ? { ...prev, visible: false } : prev);
        });

        // Auto-renumbering logic for step-numbers
        canvas.on('object:removed', (e) => {
            if (isHistoryProcessing.current) return; // Prevent loop during undo

            // Check if the removed object was a step number
            if (e.target && e.target.get('isStepNumber')) {
                const stepObjects = canvas.getObjects().filter((o: any) => o.get('isStepNumber'));
                stepObjects.sort((a: any, b: any) => a.get('stepValue') - b.get('stepValue'));

                stepObjects.forEach((obj: any, index) => {
                    const newValue = index + 1;
                    obj.set('stepValue', newValue);
                    const textObj = obj.getObjects().find((o: any) => o.type === 'i-text' || o.type === 'text');
                    if (textObj) {
                        textObj.set('text', newValue.toString());
                    }
                });
                canvas.requestRenderAll();
            }
            // Always save state after any removal
            saveState();
        });

        // Trigger save state after modify and add
        canvas.on('object:modified', () => saveState());
        canvas.on('object:added', (e) => {
            if (isHistoryProcessing.current) return;
            // Ignore system additions
            if (e.target && (e.target.get('isBackground') || e.target.get('isFrame'))) return;

            // Wait slightly for useCanvasTools dragging logic to settle (if any)
            saveState();
        });

        // Double Click to Edit Text for speech bubbles or stray texts
        canvas.on('mouse:dblclick', (e) => {
            if (currentTool !== 'select') return;

            let textObj: IText | null = null;
            // First check if the direct target is text
            if (e.target && (e.target.type === 'i-text' || e.target.type === 'text' || e.target.type === 'textbox')) {
                textObj = e.target as IText;
            }
            // If the target is a group (like speech bubble or active selection)
            else if (e.target && (e.target.type === 'group' || e.target.type === 'activeSelection')) {
                // If subTargets exist and one is text
                if (e.subTargets && e.subTargets.length > 0) {
                    const subTargetText = e.subTargets.find(t => t.type === 'i-text' || t.type === 'text' || t.type === 'textbox');
                    if (subTargetText) textObj = subTargetText as IText;
                }
                // Fallback: just find the first text object in the group
                if (!textObj) {
                    const groupText = (e.target as any)._objects?.find((o: any) => o.type === 'i-text' || o.type === 'text' || o.type === 'textbox');
                    if (groupText) textObj = groupText as IText;
                }
            }

            if (textObj) {
                // Set the text object as active for editing
                canvas.setActiveObject(textObj);

                // Explicitly fire selection event for React state (checkSelection)
                canvas.fire('selection:updated' as any, { selected: [textObj] });

                textObj.enterEditing();
                textObj.selectAll();
                canvas.requestRenderAll();
            }
        });

        // --- Custom Zoom with Ctrl + Wheel ---
        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                setZoomLevel(prev => {
                    let newZoom = prev * (0.999 ** e.deltaY);
                    if (newZoom > 5) newZoom = 5; // Max 500%
                    if (newZoom < 0.1) newZoom = 0.1; // Min 10%
                    return newZoom;
                });
            }
        };

        const wrapper = wrapperRef.current;
        if (wrapper) {
            wrapper.addEventListener('wheel', handleWheel, { passive: false });
        }

        // --- Load Image Data ---
        const params = new URLSearchParams(window.location.search);
        const mode = params.get('mode') || 'capture';



        if (mode === 'capture' || mode === 'crop') {
            setStatus("Loading image...");
            chrome.storage.local.get(["capturedImage", "cropRect"], (result) => {
                const dataUrl = result.capturedImage as string;
                const rect = result.cropRect as CropRect;

                if (dataUrl) {
                    if (mode === 'crop' && rect && rect.windowWidth) {
                        const img = new Image();
                        img.onload = () => {
                            const tempCanvas = document.createElement('canvas');

                            // Scale coordinates relatively to avoid DevicePixelRatio mismatch bugs
                            const actualScaleX = img.width / rect.windowWidth;
                            const actualScaleY = img.height / rect.windowHeight;

                            const sourceX = rect.left * actualScaleX;
                            const sourceY = rect.top * actualScaleY;
                            const sourceW = rect.width * actualScaleX;
                            const sourceH = rect.height * actualScaleY;

                            tempCanvas.width = sourceW;
                            tempCanvas.height = sourceH;
                            const ctx = tempCanvas.getContext('2d');
                            ctx?.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, sourceW, sourceH);
                            loadBackgroundToCanvas(tempCanvas.toDataURL());
                        };
                        img.src = dataUrl;
                    } else {
                        loadBackgroundToCanvas(dataUrl);
                    }
                } else {
                    setStatus("Error: No image found.");
                }
            });
        }

        return () => {
            if (wrapper) wrapper.removeEventListener('wheel', handleWheel);
            canvas.dispose();
        };
    }, []);

    // Effect to apply zoom changes
    useEffect(() => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;

        // Set dimensions to scaled size for the wrapper to scroll correctly
        const scaledWidth = originalSize.current.width * zoomLevel;
        const scaledHeight = originalSize.current.height * zoomLevel;

        canvas.setDimensions({ width: scaledWidth, height: scaledHeight });
        canvas.setZoom(zoomLevel);
        canvas.requestRenderAll();
    }, [zoomLevel]);

    const handleToggleLock = useCallback(() => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;
        const activeObjects = canvas.getActiveObjects();
        if (activeObjects.length === 0) return;

        const shouldLock = !isLocked;
        activeObjects.forEach(obj => {
            obj.set({
                lockMovementX: shouldLock,
                lockMovementY: shouldLock,
                lockScalingX: shouldLock,
                lockScalingY: shouldLock,
                lockRotation: shouldLock
            });
        });
        setIsLocked(shouldLock);
        canvas.requestRenderAll();
        saveState();
        setStatus(shouldLock ? "Object locked" : "Object unlocked");
        setTimeout(() => setStatus("Ready"), 2000);
    }, [isLocked, saveState]);

    const handleDelete = useCallback(() => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;
        const activeObjects = canvas.getActiveObjects();
        if (activeObjects.length) {
            activeObjects.forEach((obj: any) => {
                // Prevent deleting system objects
                if (obj.isBackground || obj.isFrame) return;
                canvas.remove(obj);
            });
            canvas.discardActiveObject();
            canvas.requestRenderAll();
            saveState();
        }
    }, [saveState]);

    const handleDuplicate = useCallback(() => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;
        const active = canvas.getActiveObject();
        if (active && !active.get('isBackground') && !active.get('isFrame')) {
            active.clone().then((cloned: any) => {
                canvas.discardActiveObject();
                cloned.set({
                    left: (cloned.left || 0) + 20,
                    top: (cloned.top || 0) + 20,
                    evented: true,
                });
                if (cloned.type === 'activeSelection') {
                    cloned.canvas = canvas;
                    cloned.forEachObject((obj: any) => {
                        canvas.add(obj);
                    });
                    cloned.setCoords();
                } else {
                    canvas.add(cloned);
                }
                canvas.setActiveObject(cloned);
                canvas.requestRenderAll();
                saveState();
            });
        }
    }, [saveState]);

    const handleBringForward = useCallback(() => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;
        const activeObject = canvas.getActiveObject();
        if (activeObject) {
            canvas.bringObjectForward(activeObject);
            canvas.requestRenderAll();
            saveState();
        }
    }, [saveState]);

    const handleSendBackward = useCallback(() => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;
        const activeObject = canvas.getActiveObject();
        if (activeObject) {
            // Check z-index to not go behind background
            const bgObject = canvas.getObjects().find((o: any) => o.isBackground);
            if (bgObject) {
                const bgIndex = canvas.getObjects().indexOf(bgObject);
                const activeIndex = canvas.getObjects().indexOf(activeObject);
                if (activeIndex > bgIndex + 1) {
                    canvas.sendObjectBackwards(activeObject);
                    canvas.requestRenderAll();
                    saveState();
                }
            } else {
                canvas.sendObjectBackwards(activeObject);
                canvas.requestRenderAll();
                saveState();
            }
        }
    }, [saveState]);

    // Handle Keyboard Shortcuts (Delete)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const canvas = fabricCanvas.current;
            if (!canvas) return;

            // Don't delete if we are actively editing text
            const activeObject = canvas.getActiveObject();
            if (activeObject && activeObject.type === 'i-text' && (activeObject as any).isEditing) {
                return;
            }

            // Add Undo/Redo shortcuts (Ctrl+Z, Ctrl+Y / Cmd+Shift+Z)
            if (e.metaKey || e.ctrlKey) {
                if (e.key.toLowerCase() === 'z') {
                    e.preventDefault();
                    if (e.shiftKey) {
                        handleRedo();
                    } else {
                        handleUndo();
                    }
                    return;
                } else if (e.key.toLowerCase() === 'y') {
                    e.preventDefault();
                    handleRedo();
                    return;
                } else if (e.key.toLowerCase() === 'c') {
                    // Copy selected object(s)
                    const active = canvas.getActiveObject();
                    if (active && !active.get('isBackground') && !active.get('isFrame')) {
                        active.clone().then((cloned: any) => {
                            clipboardRef.current = cloned;
                        });
                    }
                    return;
                } else if (e.key.toLowerCase() === 'v') {
                    // Paste cloned object(s)
                    if (!clipboardRef.current) return;
                    e.preventDefault();
                    clipboardRef.current.clone().then((cloned: any) => {
                        canvas.discardActiveObject();
                        cloned.set({
                            left: (cloned.left || 0) + 20,
                            top: (cloned.top || 0) + 20,
                            evented: true,
                        });
                        if (cloned.type === 'activeSelection') {
                            cloned.canvas = canvas;
                            cloned.forEachObject((obj: any) => {
                                canvas.add(obj);
                            });
                            cloned.setCoords();
                        } else {
                            canvas.add(cloned);
                        }
                        // Update clipboard offset for next paste
                        clipboardRef.current.set({
                            left: (clipboardRef.current.left || 0) + 20,
                            top: (clipboardRef.current.top || 0) + 20,
                        });
                        canvas.setActiveObject(cloned);
                        canvas.requestRenderAll();
                        saveState();
                    });
                    return;
                } else if (e.key.toLowerCase() === 'd') {
                    // Duplicate: copy + paste in one shot
                    const active = canvas.getActiveObject();
                    if (active && !active.get('isBackground') && !active.get('isFrame')) {
                        e.preventDefault();
                        active.clone().then((cloned: any) => {
                            canvas.discardActiveObject();
                            cloned.set({
                                left: (cloned.left || 0) + 20,
                                top: (cloned.top || 0) + 20,
                                evented: true,
                            });
                            if (cloned.type === 'activeSelection') {
                                cloned.canvas = canvas;
                                cloned.forEachObject((obj: any) => {
                                    canvas.add(obj);
                                });
                                cloned.setCoords();
                            } else {
                                canvas.add(cloned);
                            }
                            canvas.setActiveObject(cloned);
                            canvas.requestRenderAll();
                            saveState();
                        });
                    }
                    return;
                } else if (e.key.toLowerCase() === 'l') {
                    // Toggle Lock on selected object(s)
                    e.preventDefault();
                    handleToggleLock();
                    return;
                }
            }

            // Single key shortcuts for tools
            if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
                switch (e.key.toLowerCase()) {
                    case 'v': setCurrentTool('select'); break;
                    case 'r': setCurrentTool('rect'); setStrokeWidth(2); break;
                    case 'a': setCurrentTool('arrow'); setStrokeWidth(2); break;
                    case 't': setCurrentTool('text'); break;
                    case 'n': setCurrentTool('step-number'); setStrokeWidth(8); break;
                    case 'b': setCurrentTool('speech-bubble'); setStrokeWidth(2); break;
                    case 's': setCurrentTool('spotlight-rect'); break;
                    case 'u': setCurrentTool('blur-rect'); break;
                    case 'c': setIsCropping(true); setCropReady(false); break;
                    case 'h': setCurrentTool('highlighter'); setStrokeWidth(12); break;
                    case 'p': setCurrentTool('pen'); setStrokeWidth(2); break;
                    case 'm': setCurrentTool('click-icon'); break;
                }
            }

            if (e.key === 'Delete' || e.key === 'Backspace') {

                const activeObjects = canvas.getActiveObjects();
                if (activeObjects.length > 0) {
                    e.preventDefault();
                    activeObjects.forEach(obj => {
                        // Special handling if it's our arrow group
                        canvas.remove(obj);
                    });
                    canvas.discardActiveObject();
                    canvas.requestRenderAll();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);


    const loadBackgroundToCanvas = (dataUrl: string) => {
        FabricImage.fromURL(dataUrl).then((img: FabricImage) => {
            const canvas = fabricCanvas.current;
            if (!canvas || !wrapperRef.current) return;

            // Generate blurred offscreen canvas for the Blur tool
            const imgEl = img.getElement() as HTMLImageElement;
            const blurTarget = document.createElement('canvas');
            // use intrinsic dimensions
            blurTarget.width = imgEl.naturalWidth || img.width;
            blurTarget.height = imgEl.naturalHeight || img.height;
            const bCtx = blurTarget.getContext('2d');
            if (bCtx) {
                bCtx.filter = 'blur(15px)';
                bCtx.drawImage(imgEl, 0, 0);
            }
            blurCanvasRef.current = blurTarget;

            // Store original physical size
            originalSize.current = { width: img.width, height: img.height };
            baseImageSize.current = { width: img.width, height: img.height };

            // Fit to screen initial logic
            const wrapperW = wrapperRef.current.clientWidth - 80; // Subtract padding
            const wrapperH = wrapperRef.current.clientHeight - 80;

            const scaleX = wrapperW / img.width;
            const scaleY = wrapperH / img.height;
            const fitScale = Math.min(scaleX, scaleY, 1); // Max 100% initial zoom

            console.log("Image Original Size:", img.width, "x", img.height);
            console.log("Wrapper Size:", wrapperW, wrapperH);
            console.log("Calculated Fit Scale:", fitScale);

            // Add image as a normal object instead of background to guarantee zoom works perfectly
            img.set({
                left: 0,
                top: 0,
                originX: 'left',
                originY: 'top',
                selectable: false,
                evented: false,
                hoverCursor: 'default'
            });
            img.set('isBackground', true);
            canvas.add(img);
            canvas.sendObjectToBack(img);

            const finalWidth = img.width * fitScale;
            const finalHeight = img.height * fitScale;
            console.log("Setting Canvas Dimensions to:", finalWidth, "x", finalHeight);

            // Explicitly set dimensions and update here to avoid race conditions 
            // where zoomLevel state hasn't changed (e.g. if fitScale is exactly 1)
            canvas.setDimensions({
                width: finalWidth,
                height: finalHeight
            });
            canvas.setZoom(fitScale);
            canvas.requestRenderAll();

            // Store initial history state
            saveState();

            // Store for future zoom changes
            setZoomLevel(fitScale);
            setStatus("Ready");
        }).catch(err => {
            console.error("Failed to load fabric image:", err);
            setStatus("Error loading image.");
        });
    };

    // ─── Before / After Handlers ───────────────────────────────
    const startBAMode = () => {
        setIsBAMode(true);
        setShowBAModal(true);
    };

    const cancelBAModal = () => {
        setShowBAModal(false);
        if (!hasAfterImage) setIsBAMode(false);
    };

    const handleAfterImageProvided = (dataUrl: string) => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;

        FabricImage.fromURL(dataUrl).then((afterImg) => {
            afterImageDataUrl.current = dataUrl;
            beforeBAWidth.current = originalSize.current.width;

            // Header strip height: 12% of image height, no upper cap
            const hdrH = Math.max(60, Math.round(originalSize.current.height * 0.12));
            baHeaderHeight.current = hdrH;

            // Scale after image to the same height as before
            const scaleToBase = originalSize.current.height / afterImg.height!;
            afterImg.scaleX = scaleToBase;
            afterImg.scaleY = scaleToBase;
            const afterDisplayWidth = Math.round(afterImg.width! * scaleToBase);

            // Push all existing objects down by hdrH to make room for header
            canvas.getObjects().forEach((obj: any) => {
                obj.set({ top: (obj.top || 0) + hdrH });
                obj.setCoords();
            });

            // Place after image (to the right, below header)
            afterImg.set({
                left: beforeBAWidth.current,
                top: hdrH,
                originX: 'left',
                originY: 'top',
                selectable: false,
                evented: false,
                hoverCursor: 'default',
            });
            afterImg.set('isAfterImage', true);
            canvas.add(afterImg);
            canvas.sendObjectToBack(afterImg);
            canvas.bringObjectForward(afterImg); // just above background

            // Update canvas dimensions
            const newTotalWidth = beforeBAWidth.current + afterDisplayWidth;
            const newTotalHeight = originalSize.current.height + hdrH;
            originalSize.current = { width: newTotalWidth, height: newTotalHeight };
            canvas.setDimensions({ width: newTotalWidth * zoomLevel, height: newTotalHeight * zoomLevel });

            // Header: left = black (BEFORE), right = white (AFTER)
            const hdrLeft = new Rect({
                left: 0,
                top: 0,
                width: beforeBAWidth.current,
                height: hdrH,
                fill: '#ffffff',
                originX: 'left',
                originY: 'top',
                selectable: false,
                evented: false,
            });
            hdrLeft.set('isBALabel', true);
            const hdrRight = new Rect({
                left: beforeBAWidth.current,
                top: 0,
                width: afterDisplayWidth,
                height: hdrH,
                fill: '#ffffff',
                originX: 'left',
                originY: 'top',
                selectable: false,
                evented: false,
            });
            hdrRight.set('isBALabel', true);
            canvas.add(hdrLeft, hdrRight);
            canvas.sendObjectToBack(hdrRight);
            canvas.sendObjectToBack(hdrLeft);

            // Vertical divider (45px white, centered on the boundary)
            const divider = new Rect({
                left: beforeBAWidth.current - 22,
                top: 0,
                width: 45,
                height: newTotalHeight,
                fill: '#ffffff',
                originX: 'left',
                originY: 'top',
                selectable: false,
                evented: false,
            });
            divider.set('isBALabel', true);
            canvas.add(divider);

            // Horizontal separator between header band and images (45px white)
            const hdrSeparator = new Rect({
                left: 0,
                top: hdrH - 22,
                width: newTotalWidth,
                height: 45,
                fill: '#ffffff',
                originX: 'left',
                originY: 'top',
                selectable: false,
                evented: false,
            });
            hdrSeparator.set('isBALabel', true);
            canvas.add(hdrSeparator);

            // Labels: BEFORE=white text, AFTER=black text
            const labelFontSize = Math.max(40, Math.round(hdrH * 0.65));
            const beforeLabel = new IText('BEFORE', {
                left: beforeBAWidth.current / 2,
                top: hdrH / 2,
                fontSize: labelFontSize,
                fontWeight: 'bold' as const,
                fontFamily: 'system-ui, -apple-system, sans-serif',
                fill: '#111111',
                originX: 'center' as const,
                originY: 'center' as const,
                selectable: false,
                evented: false,
                hoverCursor: 'default',
            });
            beforeLabel.set('isBALabel', true);
            const afterLabel = new IText('AFTER', {
                left: beforeBAWidth.current + afterDisplayWidth / 2,
                top: hdrH / 2,
                fontSize: labelFontSize,
                fontWeight: 'bold' as const,
                fontFamily: 'system-ui, -apple-system, sans-serif',
                fill: '#111111',
                originX: 'center' as const,
                originY: 'center' as const,
                selectable: false,
                evented: false,
                hoverCursor: 'default',
            });
            afterLabel.set('isBALabel', true);
            canvas.add(beforeLabel, afterLabel);

            canvas.requestRenderAll();
            setHasAfterImage(true);
            setShowBAModal(false);
            saveState();
        });
    };

    const deleteAfterImage = () => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;

        const hdrH = baHeaderHeight.current;

        canvas.getObjects()
            .filter((o: any) => o.get('isAfterImage') || o.get('isBALabel'))
            .forEach(o => canvas.remove(o));

        // Shift remaining objects back up
        canvas.getObjects().forEach((obj: any) => {
            obj.set({ top: (obj.top || 0) - hdrH });
            obj.setCoords();
        });

        const restoredHeight = originalSize.current.height - hdrH;
        originalSize.current = { width: beforeBAWidth.current, height: restoredHeight };
        canvas.setDimensions({
            width: beforeBAWidth.current * zoomLevel,
            height: restoredHeight * zoomLevel,
        });
        canvas.requestRenderAll();
        setHasAfterImage(false);
        setIsBAMode(false);
        afterImageDataUrl.current = null;
        baHeaderHeight.current = 0;
        saveState();
    };

    const deleteBeforeImage = () => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;
        const dataUrl = afterImageDataUrl.current;
        if (!dataUrl) return;

        // Remove all objects and reload After image as the new background
        canvas.clear();
        setHasAfterImage(false);
        setIsBAMode(false);
        afterImageDataUrl.current = null;
        loadBackgroundToCanvas(dataUrl);
    };

    const handleZoomIn = () => setZoomLevel(prev => Math.min(prev * 1.2, 5));
    const handleZoomOut = () => setZoomLevel(prev => Math.max(prev / 1.2, 0.1));

    const frameOffsets = useRef({ x: 0, y: 0 });

    const toggleFrame = () => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;

        if (!hasFrame) {
            // Toggling ON
            const baseImg = canvas.getObjects().find((o: any) => o.get('isBackground'));
            if (!baseImg) return;

            // USE ABSOLUTE BASE IMAGE PIXELS to avoid Fabric scale/retina returning strange values
            const baseW = baseImageSize.current.width;
            const baseH = baseImageSize.current.height;

            // Dynamically scale frame elements based on the screenshot size
            // For a Retina screenshot (e.g. 3840px), we want a larger frame/padding.
            // For a standard screenshot (e.g. 1920px), we want standard size.
            const frameScale = Math.max(0.5, baseW / 1600);

            const SHADOW_MARGIN = 100 * frameScale;
            const PADDING_X = 40 * frameScale;
            const PADDING_TOP = 60 * frameScale;
            const PADDING_BOTTOM = 60 * frameScale;

            const shiftX = SHADOW_MARGIN + PADDING_X;
            const shiftY = SHADOW_MARGIN + PADDING_TOP;

            frameOffsets.current = { x: shiftX, y: shiftY };

            // Shift all user objects and base image
            canvas.getObjects().forEach(obj => {
                obj.set({
                    left: (obj.left || 0) + shiftX,
                    top: (obj.top || 0) + shiftY
                });
                obj.setCoords();
            });

            // Re-align blur patterns
            canvas.getObjects().forEach((o: any) => o.get('isBlur') && o.fire('moving'));

            // 1. Create Frame Background
            const frameWidth = baseW + PADDING_X * 2;
            const frameHeight = baseH + PADDING_TOP + PADDING_BOTTOM;

            const frameBg = new Rect({
                left: SHADOW_MARGIN,
                top: SHADOW_MARGIN,
                originX: 'left',
                originY: 'top',
                width: frameWidth,
                height: frameHeight,
                fill: '#ffffff',
                stroke: '#cecece',
                strokeWidth: Math.max(1, 1.5 * frameScale),
                rx: 12 * frameScale,
                ry: 12 * frameScale,
                selectable: false,
                evented: false,
                shadow: new Shadow({
                    color: 'rgba(0,0,0,0.22)',
                    blur: 50 * frameScale,
                    offsetX: 0,
                    offsetY: 20 * frameScale
                })
            });
            frameBg.set('isFrame', true);

            // 1.5 Create Header Divider Line
            const HEADER_HEIGHT = 46 * frameScale;
            const frameDivider = new Line(
                [SHADOW_MARGIN, SHADOW_MARGIN + HEADER_HEIGHT, SHADOW_MARGIN + frameWidth, SHADOW_MARGIN + HEADER_HEIGHT],
                {
                    originX: 'left',
                    originY: 'top',
                    stroke: '#e6e6e6',
                    strokeWidth: Math.max(1, 1 * frameScale),
                    selectable: false,
                    evented: false,
                }
            );
            frameDivider.set('isFrame', true);

            // 2. Create macOS Dots
            const dotRadius = 6.5 * frameScale;
            const dotSpacing = 8 * frameScale;
            const startX = SHADOW_MARGIN + (18 * frameScale);
            const startY = SHADOW_MARGIN + (HEADER_HEIGHT / 2) - dotRadius;

            const redDot = new FabricCircle({ left: startX, top: startY, originX: 'left', originY: 'top', radius: dotRadius, fill: '#ff5f56', stroke: '#e0443e', strokeWidth: 0.5 * frameScale, selectable: false, evented: false });
            redDot.set('isFrame', true);
            const yellowDot = new FabricCircle({ left: startX + dotRadius * 2 + dotSpacing, top: startY, originX: 'left', originY: 'top', radius: dotRadius, fill: '#ffbd2e', stroke: '#dea123', strokeWidth: 0.5 * frameScale, selectable: false, evented: false });
            yellowDot.set('isFrame', true);
            const greenDot = new FabricCircle({ left: startX + (dotRadius * 2 + dotSpacing) * 2, top: startY, originX: 'left', originY: 'top', radius: dotRadius, fill: '#27c93f', stroke: '#1aab29', strokeWidth: 0.5 * frameScale, selectable: false, evented: false });
            greenDot.set('isFrame', true);

            canvas.add(frameBg, frameDivider, redDot, yellowDot, greenDot);

            canvas.sendObjectToBack(greenDot);
            canvas.sendObjectToBack(yellowDot);
            canvas.sendObjectToBack(redDot);
            canvas.sendObjectToBack(frameDivider);
            canvas.sendObjectToBack(frameBg);

            // Update canvas dimensions to include the shadow margins!
            originalSize.current = {
                width: frameWidth + SHADOW_MARGIN * 2,
                height: frameHeight + SHADOW_MARGIN * 2
            };
            setHasFrame(true);

        } else {
            // Toggling OFF
            const frameObjects = canvas.getObjects().filter((o: any) => o.get('isFrame'));
            frameObjects.forEach(obj => canvas.remove(obj));

            // Shift everything back
            const { x: shiftX, y: shiftY } = frameOffsets.current;
            canvas.getObjects().forEach(obj => {
                obj.set({
                    left: (obj.left || 0) - shiftX,
                    top: (obj.top || 0) - shiftY
                });
                obj.setCoords();
            });

            // Re-align blur patterns
            canvas.getObjects().forEach((o: any) => o.get('isBlur') && o.fire('moving'));

            // Restore canvas size to original base image size
            originalSize.current = {
                width: baseImageSize.current.width,
                height: baseImageSize.current.height
            };

            setHasFrame(false);
        }

        // Update viewport perfectly
        const scaledWidth = originalSize.current.width * zoomLevel;
        const scaledHeight = originalSize.current.height * zoomLevel;
        canvas.setDimensions({ width: scaledWidth, height: scaledHeight });
        canvas.requestRenderAll();

        saveState(); // Save state after framing changes
    };

    const handleDownload = () => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;

        // Deselect everything so selection boxes aren't in the screenshot
        canvas.discardActiveObject();

        // 1. Save current viewport and dimensions
        const currentZoom = canvas.getZoom();
        const currentWidth = canvas.getWidth();
        const currentHeight = canvas.getHeight();
        const currentVpt = canvas.viewportTransform ? [...canvas.viewportTransform] : null;

        // 2. Temporarily set canvas to original unscaled resolution for perfect export
        // This guarantees `after:render` hooks like Spotlight are executed accurately on the exported image
        canvas.setZoom(1);
        canvas.setDimensions({
            width: originalSize.current.width,
            height: originalSize.current.height
        });
        if (canvas.viewportTransform) {
            canvas.viewportTransform = [1, 0, 0, 1, 0, 0] as any;
        }

        // 3. Force synchronous render to apply changes
        canvas.renderAll();

        // 4. Capture native data URL from the lower canvas (excluding upper UI layer)
        const dataURL = canvas.lowerCanvasEl.toDataURL('image/png', 1.0);

        // 5. Restore original UI viewport silently
        if (currentVpt) {
            canvas.viewportTransform = currentVpt as any;
        }
        canvas.setZoom(currentZoom);
        canvas.setDimensions({
            width: currentWidth,
            height: currentHeight
        });
        canvas.renderAll();

        // 6. Trigger download
        const link = document.createElement('a');
        link.download = `lumoshot_${new Date().getTime()}.png`;
        link.href = dataURL;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setStatus("Saved!");
        // Revert status message after 2s
        setTimeout(() => setStatus("Ready"), 2000);
    };

    const handleCopy = () => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;

        setStatus("Copying...");
        canvas.discardActiveObject();

        const currentZoom = canvas.getZoom();
        const currentWidth = canvas.getWidth();
        const currentHeight = canvas.getHeight();
        const currentVpt = canvas.viewportTransform ? [...canvas.viewportTransform] : null;

        canvas.setZoom(1);
        canvas.setDimensions({
            width: originalSize.current.width,
            height: originalSize.current.height
        });
        if (canvas.viewportTransform) {
            canvas.viewportTransform = [1, 0, 0, 1, 0, 0] as any;
        }

        canvas.renderAll();

        canvas.lowerCanvasEl.toBlob((blob) => {
            if (currentVpt) {
                canvas.viewportTransform = currentVpt as any;
            }
            canvas.setZoom(currentZoom);
            canvas.setDimensions({
                width: currentWidth,
                height: currentHeight
            });
            canvas.renderAll();

            if (blob) {
                try {
                    navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': blob })
                    ]).then(() => {
                        setStatus("Copied to clipboard!");
                        setTimeout(() => setStatus("Ready"), 2000);
                    }).catch(err => {
                        console.error("Clipboard API failed", err);
                        setStatus("Copy Failed");
                        setTimeout(() => setStatus("Ready"), 2000);
                    });
                } catch (err) {
                    console.error("Clipboard API error", err);
                    setStatus("Copy Failed");
                    setTimeout(() => setStatus("Ready"), 2000);
                }
            } else {
                setStatus("Copy Failed");
                setTimeout(() => setStatus("Ready"), 2000);
            }
        }, 'image/png', 1.0);
    };

    const addImageToCanvas = (dataUrl: string) => {
        FabricImage.fromURL(dataUrl, { crossOrigin: 'anonymous' }).then((img) => {
            const canvas = fabricCanvas.current;
            if (!canvas) return;

            // Scale down if too big
            const maxDim = 400;
            if (img.width! > maxDim || img.height! > maxDim) {
                const scale = Math.min(maxDim / img.width!, maxDim / img.height!);
                img.scale(scale);
            }

            const center = canvas.getCenterPoint();
            img.set({
                left: center.x,
                top: center.y,
                originX: 'center',
                originY: 'center',
                cornerStyle: 'circle',
                transparentCorners: false,
                borderColor: '#0066ff',
                cornerColor: '#ffffff',
                cornerStrokeColor: '#0066ff'
            });

            canvas.add(img);
            canvas.setActiveObject(img);
            canvas.requestRenderAll();
            saveState();
        }).catch(err => {
            console.error("Failed to load image", err);
        });
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (f) => {
            const data = f.target?.result as string;
            addImageToCanvas(data);
            if (fileInputRef.current) fileInputRef.current.value = '';
        };
        reader.readAsDataURL(file);
    };

    const [isDragOver, setIsDragOver] = useState(false);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (!file || !file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = (f) => {
            const data = f.target?.result as string;
            addImageToCanvas(data);
        };
        reader.readAsDataURL(file);
    };


    // ─── Resize Handler ────────────────────────────────────────
    const handleResize = (newWidth: number, newHeight: number) => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;

        saveState(); // For Undo

        const oldW = originalSize.current.width;
        const oldH = originalSize.current.height;
        const scaleX = newWidth / oldW;
        const scaleY = newHeight / oldH;

        // Scale all objects (background + annotations)
        canvas.forEachObject((obj: any) => {
            obj.set({
                left: (obj.left || 0) * scaleX,
                top: (obj.top || 0) * scaleY,
                scaleX: (obj.scaleX || 1) * scaleX,
                scaleY: (obj.scaleY || 1) * scaleY,
            });
            obj.setCoords();
        });

        // Update canvas dimensions
        originalSize.current = { width: newWidth, height: newHeight };
        const scaledW = newWidth * zoomLevel;
        const scaledH = newHeight * zoomLevel;
        canvas.setDimensions({ width: scaledW, height: scaledH });
        canvas.setZoom(zoomLevel);
        canvas.requestRenderAll();

        setShowResizeModal(false);
        saveState();
        setStatus('Resized!');
        setTimeout(() => setStatus('Ready'), 2000);
    };

    // ─── Crop Handlers ─────────────────────────────────────────
    const startCrop = () => {
        if (isCropping) {
            cancelCrop();
            return;
        }
        const canvas = fabricCanvas.current;
        if (!canvas) return;

        setIsCropping(true);
        setCropReady(false);
        setCurrentTool('select');
        canvas.discardActiveObject();

        // Disable all objects during crop
        canvas.forEachObject(obj => {
            obj.selectable = false;
            obj.evented = false;
        });
        canvas.selection = false;
        canvas.defaultCursor = 'crosshair';
        canvas.requestRenderAll();
    };

    // useEffect to manage crop-mode mouse events
    useEffect(() => {
        const canvas = fabricCanvas.current;
        if (!canvas || !isCropping) return;

        const onMouseDown = (opt: any) => {
            // If crop rect already exists (adjusting), don't create a new one
            if (cropRectRef.current) return;

            const pointer = canvas.getScenePoint(opt.e);
            cropDrawing.current = true;
            cropStartX.current = pointer.x;
            cropStartY.current = pointer.y;

            const rect = new Rect({
                left: pointer.x,
                top: pointer.y,
                width: 0,
                height: 0,
                fill: 'rgba(79, 70, 229, 0.08)',
                stroke: '#4f46e5',
                strokeWidth: 2,
                strokeDashArray: [6, 4],
                strokeUniform: true,
                selectable: false,
                evented: false,
                originX: 'left',
                originY: 'top',
            });
            rect.set('isCropRect', true);
            canvas.add(rect);
            cropRectRef.current = rect;
        };

        const onMouseMove = (opt: any) => {
            if (!cropDrawing.current || !cropRectRef.current) return;
            const pointer = canvas.getScenePoint(opt.e);
            const minX = Math.min(pointer.x, cropStartX.current);
            const minY = Math.min(pointer.y, cropStartY.current);
            cropRectRef.current.set({
                left: minX,
                top: minY,
                width: Math.abs(pointer.x - cropStartX.current),
                height: Math.abs(pointer.y - cropStartY.current),
            });
            cropRectRef.current.setCoords();
            canvas.requestRenderAll();
        };

        const onMouseUp = () => {
            if (!cropDrawing.current || !cropRectRef.current) return;
            cropDrawing.current = false;

            const rect = cropRectRef.current;
            const w = (rect.width || 0);
            const h = (rect.height || 0);

            // If too small, remove and let user redraw
            if (w < 5 || h < 5) {
                canvas.remove(rect);
                cropRectRef.current = null;
                return;
            }

            // Make the rect selectable so user can adjust
            rect.set({
                selectable: true,
                evented: true,
                cornerColor: '#4f46e5',
                cornerStrokeColor: '#fff',
                cornerSize: 10,
                cornerStyle: 'circle' as const,
                transparentCorners: false,
                borderColor: '#4f46e5',
                hasRotatingPoint: false,
                lockRotation: true,
            });
            canvas.setActiveObject(rect);
            canvas.requestRenderAll();
            setCropReady(true);
        };

        canvas.on('mouse:down', onMouseDown);
        canvas.on('mouse:move', onMouseMove);
        canvas.on('mouse:up', onMouseUp);

        return () => {
            canvas.off('mouse:down', onMouseDown);
            canvas.off('mouse:move', onMouseMove);
            canvas.off('mouse:up', onMouseUp);
        };
    }, [isCropping]);

    const confirmCrop = () => {
        const canvas = fabricCanvas.current;
        const rect = cropRectRef.current;
        if (!canvas || !rect) return;

        saveState(); // For Undo

        const cropLeft = rect.left || 0;
        const cropTop = rect.top || 0;
        const cropWidth = (rect.width || 0) * (rect.scaleX || 1);
        const cropHeight = (rect.height || 0) * (rect.scaleY || 1);

        // Remove the crop rectangle
        canvas.remove(rect);
        cropRectRef.current = null;

        // Offset all objects by the crop position
        canvas.forEachObject((obj: any) => {
            obj.set({
                left: (obj.left || 0) - cropLeft,
                top: (obj.top || 0) - cropTop,
            });
            obj.setCoords();
        });

        // Update canvas dimensions
        const newW = Math.max(1, Math.round(cropWidth));
        const newH = Math.max(1, Math.round(cropHeight));
        originalSize.current = { width: newW, height: newH };
        const scaledW = newW * zoomLevel;
        const scaledH = newH * zoomLevel;
        canvas.setDimensions({ width: scaledW, height: scaledH });
        canvas.setZoom(zoomLevel);

        // Re-enable all objects
        canvas.forEachObject(obj => {
            if (obj.get('isBackground') || obj.get('isFrame')) return;
            if (obj.get('hoverCursor') === 'default') return;
            obj.selectable = true;
            obj.evented = true;
        });
        canvas.selection = true;
        canvas.defaultCursor = 'default';
        canvas.requestRenderAll();

        setIsCropping(false);
        setCropReady(false);
        saveState();
        setStatus('Cropped!');
        setTimeout(() => setStatus('Ready'), 2000);
    };

    const cancelCrop = () => {
        const canvas = fabricCanvas.current;
        const rect = cropRectRef.current;
        if (canvas) {
            if (rect) {
                canvas.remove(rect);
            }
            // Re-enable all objects
            canvas.forEachObject(obj => {
                if (obj.get('isBackground') || obj.get('isFrame')) return;
                if (obj.get('hoverCursor') === 'default') return;
                obj.selectable = true;
                obj.evented = true;
            });
            canvas.selection = true;
            canvas.defaultCursor = 'default';
            canvas.requestRenderAll();
        }
        cropRectRef.current = null;
        setIsCropping(false);
        setCropReady(false);
    };

    const toggleDarkMode = () => {
        setIsDarkMode(prev => !prev);
    };

    return (
        <div className={`editor-container ${isDarkMode ? 'dark' : ''}`}>
            {/* Sidebar Tools */}
            <Sidebar
                currentTool={currentTool}
                setCurrentTool={setCurrentTool}
                strokeWidth={strokeWidth}
                setStrokeWidth={setStrokeWidth}
                fileInputRef={fileInputRef}
                onOpenResize={() => setShowResizeModal(true)}
                onStartCrop={startCrop}
                isCropping={isCropping}
                onStartBA={startBAMode}
                isBAMode={isBAMode}
            />

            {/* Main Area */}
            <div className="main-area">
                <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept="image/*"
                    onChange={handleImageUpload}
                />
                
                {/* Top Bars Container (Fixed layout to avoid canvas overlap) */}
                <div style={{
                    padding: '16px 16px 16px 0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    zIndex: 100,
                    flexShrink: 0
                }}>
                    <Header
                    status={status}
                    zoomLevel={zoomLevel}
                    handleZoomIn={handleZoomIn}
                    handleZoomOut={handleZoomOut}
                    hasFrame={hasFrame}
                    toggleFrame={toggleFrame}
                    handleUndo={handleUndo}
                    handleRedo={handleRedo}
                    handleCopy={handleCopy}
                    handleDownload={handleDownload}
                    isDarkMode={isDarkMode}
                    toggleDarkMode={toggleDarkMode}
                    onOpenHelp={() => window.open('guide.html', '_blank')}
                />

                {/* Sub-Header Toolbars */}
                <SubHeader
                    currentTool={currentTool}
                    isMultiSelection={isMultiSelection}
                    hasSelection={hasSelection}
                    isBubbleSelected={isBubbleSelected}
                    handleAlignment={handleAlignment}
                    strokeColor={strokeColor}
                    setStrokeColor={setStrokeColor}
                    strokeWidth={strokeWidth}
                    setStrokeWidth={setStrokeWidth}
                    fontColor={fontColor}
                    setFontColor={setFontColor}
                    fontSize={fontSize}
                    setFontSize={setFontSize}
                    isBold={isBold}
                    setIsBold={setIsBold}
                    isItalic={isItalic}
                    setIsItalic={setIsItalic}
                    textBgColor={textBgColor}
                    setTextBgColor={setTextBgColor}
                    fabricCanvas={fabricCanvas}
                    isLocked={isLocked}
                    handleToggleLock={handleToggleLock}
                    showRuler={showRuler}
                    handleToggleRuler={() => setShowRuler(!showRuler)}
                />
                </div>

                {/* Canvas Area with Ruler Support */}
                <div style={{ position: 'relative', flex: 1, display: 'flex', borderRadius: '16px', overflow: 'hidden' }}>
                    {showRuler && <Ruler fabricCanvas={fabricCanvas} zoomLevel={zoomLevel} wrapperRef={wrapperRef} />}

                    {/* Canvas overlays: position: absolute here means "relative to canvas area", safely below the header */}
                    {isCropping && !cropReady && (
                        <div className="crop-overlay-bar">
                            <span>ドラッグでクロップ範囲を指定</span>
                            <button className="crop-cancel-btn" onClick={cancelCrop} data-tooltip="キャンセル">
                                <X size={16} />
                            </button>
                        </div>
                    )}
                    {isCropping && cropReady && (
                        <div className="crop-overlay-bar active">
                            <button className="crop-confirm-btn" onClick={confirmCrop} data-tooltip="確定">
                                <Check size={16} />
                            </button>
                            <button className="crop-cancel-btn" onClick={cancelCrop} data-tooltip="キャンセル">
                                <X size={16} />
                            </button>
                        </div>
                    )}

                    {isBAMode && (
                        <div className="ba-overlay-bar">
                            <span className="ba-overlay-label">Before / After</span>
                            {hasAfterImage && (
                                <>
                                    <button className="ba-delete-btn" onClick={deleteBeforeImage} title="Delete Before image">
                                        <Trash2 size={14} /> Before
                                    </button>
                                    <button className="ba-delete-btn" onClick={deleteAfterImage} title="Delete After image">
                                        <Trash2 size={14} /> After
                                    </button>
                                </>
                            )}
                            {!hasAfterImage && (
                                <button className="ba-delete-btn" onClick={() => { setIsBAMode(false); setShowBAModal(false); }}>
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    )}

                    {/* Canvas Wrapper */}
                    <div
                        className={`canvas-wrapper ${isDragOver ? 'drag-over' : ''}`}
                        ref={wrapperRef}
                        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                        onDragLeave={() => setIsDragOver(false)}
                        onDrop={handleDrop}
                        onContextMenu={(e) => e.preventDefault()}
                    >
                        <canvas ref={canvasEl} />

                        {/* Context Menu */}
                        {contextMenu.visible && (
                            <div
                                className="context-menu"
                                style={{
                                    position: 'fixed',
                                    top: `${contextMenu.y}px`,
                                    left: `${contextMenu.x}px`,
                                    zIndex: 1000
                                }}
                                onClick={(e) => e.stopPropagation()}
                            >


                                {contextMenu.target && (
                                    <>
                                        <div className="context-menu-item" onClick={() => { handleDuplicate(); setContextMenu(prev => ({ ...prev, visible: false })); }}>
                                            {chrome.i18n.getMessage("contextMenuDuplicate")} <span className="shortcut">Ctrl+D</span>
                                        </div>
                                        <div className="context-menu-item" onClick={() => { handleToggleLock(); setContextMenu(prev => ({ ...prev, visible: false })); }}>
                                            {isLocked ? chrome.i18n.getMessage("toolUnlock").replace(' (Ctrl+L)', '') : chrome.i18n.getMessage("toolLock").replace(' (Ctrl+L)', '')} <span className="shortcut">Ctrl+L</span>
                                        </div>
                                        <div className="context-menu-divider" />
                                        <div className="context-menu-item" onClick={() => { handleBringForward(); setContextMenu(prev => ({ ...prev, visible: false })); }}>
                                            {chrome.i18n.getMessage("contextMenuBringForward")}
                                        </div>
                                        <div className="context-menu-item" onClick={() => { handleSendBackward(); setContextMenu(prev => ({ ...prev, visible: false })); }}>
                                            {chrome.i18n.getMessage("contextMenuSendBackward")}
                                        </div>
                                        <div className="context-menu-divider" />
                                        <div className="context-menu-item danger" onClick={() => { handleDelete(); setContextMenu(prev => ({ ...prev, visible: false })); }}>
                                            {chrome.i18n.getMessage("contextMenuDelete")} <span className="shortcut">Del</span>
                                        </div>
                                    </>
                                )}
                                {!contextMenu.target && (
                                    <div className="context-menu-item" onClick={() => {
                                        if (clipboardRef.current) {
                                            // Trigger paste slightly offset from click if possible, or just default paste
                                            const e = new KeyboardEvent('keydown', { key: 'v', ctrlKey: true });
                                            document.dispatchEvent(e);
                                        }
                                        setContextMenu(prev => ({ ...prev, visible: false }));
                                    }}>
                                        {chrome.i18n.getMessage("contextMenuPaste")} <span className="shortcut">Ctrl+V</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>


            </div>

            {/* Resize Modal */}
            <ResizeModal
                isOpen={showResizeModal}
                currentWidth={originalSize.current.width}
                currentHeight={originalSize.current.height}
                onApply={handleResize}
                onClose={() => setShowResizeModal(false)}
            />

            {/* Before / After Modal */}
            <BeforeAfterModal
                isOpen={showBAModal}
                onClose={cancelBAModal}
                onImageProvided={handleAfterImageProvided}
            />
        </div>
    );
};

export default Editor;
