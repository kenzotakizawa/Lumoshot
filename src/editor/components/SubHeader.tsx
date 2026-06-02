import React from 'react';
import { AlignLeft, AlignCenter, AlignRight, Lock, Unlock, Bold, Italic, Ruler, ArrowUpRight, CornerDownRight, Spline } from 'lucide-react';
import { Canvas } from 'fabric';
import type { ToolType } from '../hooks/useCanvasTools';
import type { ArrowStyle } from '../utils/drawTools/arrow';
import { buildClickCursorGroup } from '../utils/drawTools/clickIcon';

interface SubHeaderProps {
    currentTool: ToolType;
    isMultiSelection: boolean;
    hasSelection: boolean;
    isBubbleSelected: boolean;
    handleAlignment: (action: string) => void;
    strokeColor: string;
    setStrokeColor: (color: string) => void;
    strokeWidth: number;
    setStrokeWidth: (width: number) => void;
    fontColor: string;
    setFontColor: (color: string) => void;
    fontSize: number;
    setFontSize: (size: number) => void;
    arrowStyle: ArrowStyle;
    setArrowStyle: (style: ArrowStyle) => void;
    isBold?: boolean;
    setIsBold?: (bold: boolean) => void;
    isItalic?: boolean;
    setIsItalic?: (italic: boolean) => void;
    bubbleFillColor?: string;
    setBubbleFillColor?: (color: string) => void;
    fabricCanvas: React.RefObject<Canvas | null>;
    isLocked?: boolean;
    handleToggleLock?: () => void;
    showRuler?: boolean;
    handleToggleRuler?: () => void;
    clickIconScheme?: 'dark' | 'light';
    setClickIconScheme?: (scheme: 'dark' | 'light') => void;
}

const SubHeader: React.FC<SubHeaderProps> = ({
    currentTool,
    isMultiSelection,
    hasSelection,
    isBubbleSelected,
    handleAlignment,
    strokeColor,
    setStrokeColor,
    strokeWidth,
    setStrokeWidth,
    fontColor,
    setFontColor,
    fontSize,
    setFontSize,
    arrowStyle,
    setArrowStyle,
    isBold,
    setIsBold,
    isItalic,
    setIsItalic,
    bubbleFillColor,
    setBubbleFillColor,
    fabricCanvas,
    isLocked = false,
    handleToggleLock,
    showRuler = false,
    handleToggleRuler,
    clickIconScheme = 'dark',
    setClickIconScheme,
}) => {
    const isArrowContext = currentTool === 'arrow';
    const isBubbleContext = currentTool === 'speech-bubble' || isBubbleSelected;
    const isClickIconContext = currentTool === 'click-icon' || !!fabricCanvas.current?.getActiveObject()?.get('isClickIcon');
    const getReadableTextColor = (color: string) => {
        const hex = color.replace('#', '');
        if (hex.length !== 6) return '#111827';
        const r = parseInt(hex.slice(0, 2), 16) / 255;
        const g = parseInt(hex.slice(2, 4), 16) / 255;
        const b = parseInt(hex.slice(4, 6), 16) / 255;
        const toLinear = (channel: number) => channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
        const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
        return luminance < 0.42 ? '#ffffff' : '#111827';
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Sub-Header Toolbar (Alignment) */}
            {currentTool === 'select' && isMultiSelection && (
                <div className="sub-header" style={{
                    height: '48px', background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255, 255, 255, 0.4)', borderRadius: '12px', boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)',
                    display: 'flex', alignItems: 'center', padding: '0 20px', gap: '20px', fontSize: '13px', color: '#555'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', borderRight: '1px solid #ddd', paddingRight: '20px' }}>
                        <span style={{ marginRight: 8, fontWeight: 'bold' }}>Align:</span>
                        <button className="tool-btn" onClick={() => handleAlignment('left')} data-tooltip={chrome.i18n.getMessage("alignLeft")}><AlignLeft size={16} /></button>
                        <button className="tool-btn" onClick={() => handleAlignment('center')} data-tooltip={chrome.i18n.getMessage("alignCenter")}><AlignCenter size={16} /></button>
                        <button className="tool-btn" onClick={() => handleAlignment('right')} data-tooltip={chrome.i18n.getMessage("alignRight")}><AlignRight size={16} /></button>
                        <div style={{ width: 8 }} />
                        <button className="tool-btn" onClick={() => handleAlignment('top')} data-tooltip={chrome.i18n.getMessage("alignTop")} style={{ transform: 'rotate(90deg)' }}><AlignLeft size={16} /></button>
                        <button className="tool-btn" onClick={() => handleAlignment('middle')} data-tooltip={chrome.i18n.getMessage("alignMiddle")} style={{ transform: 'rotate(90deg)' }}><AlignCenter size={16} /></button>
                        <button className="tool-btn" onClick={() => handleAlignment('bottom')} data-tooltip={chrome.i18n.getMessage("alignBottom")} style={{ transform: 'rotate(90deg)' }}><AlignRight size={16} /></button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ marginRight: 8, fontWeight: 'bold' }}>Distribute:</span>
                        <button className="action-btn" style={{ padding: '4px 8px' }} onClick={() => handleAlignment('distribute-horizontal')}>
                            ↔ {chrome.i18n.getMessage("distributeHorizontal")}
                        </button>
                        <button className="action-btn" style={{ padding: '4px 8px' }} onClick={() => handleAlignment('distribute-vertical')}>
                            ↕ {chrome.i18n.getMessage("distributeVertical")}
                        </button>
                    </div>
                </div>
            )}

            {/* Sub-Header Toolbar (Properties) */}
            {(currentTool !== 'select' || hasSelection) && currentTool !== 'spotlight-rect' && currentTool !== 'spotlight-ellipse' && (
                <div className="sub-header" style={{
                    height: '48px', background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255, 255, 255, 0.4)', borderRadius: '12px', boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)',
                    display: 'flex', alignItems: 'center', padding: '0 20px', gap: '20px', fontSize: '13px', color: '#555'
                }}>
                    {!isClickIconContext && <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label>Color:</label>
                        <input
                            type="color"
                            value={strokeColor}
                            onChange={(e) => {
                                const val = e.target.value;
                                setStrokeColor(val);

                                // Live update active object(s)
                                const activeObject = fabricCanvas.current?.getActiveObject();
                                if (activeObject) {
                                    // Helper to apply color to a single object based on our rules
                                    const applyColor = (obj: any) => {
                                        if (obj.type === 'i-text' || obj.type === 'text') {
                                            obj.set('fill', val);
                                        } else if (obj.type === 'path' || obj.type === 'line' || obj.type === 'rect' || obj.type === 'polygon') {
                                            if (obj.get?.('isBlur')) {
                                                obj.set({ fill: val, stroke: val });
                                                return;
                                            }
                                            // If it's the invisible cover for speech bubble, skip
                                            if (obj.stroke === 'white' && obj.fill === 'white') return;

                                            if (obj.type === 'path') {
                                                obj.set('stroke', val);
                                            } else {
                                                // Handle speech bubble tail specifically (polygon)
                                                if (obj.type === 'polygon' && obj.bubbleId) {
                                                    obj.set('stroke', val);
                                                } else {
                                                    obj.set('stroke', val);
                                                    if (activeObject.get('fill') !== 'transparent' && obj.type === 'polygon' && !obj.bubbleId) {
                                                        activeObject.set('fill', val);
                                                    }
                                                }
                                            }
                                        } else if (obj.get('isStepNumber')) {
                                            const circle = obj._objects?.find((o: any) => o.type === 'ellipse');
                                            if (circle) circle.set('fill', val);
                                        } else if (obj.get('isClickIcon')) {
                                            obj.set('clickColor', val);
                                            const parts = obj.getObjects();
                                            parts.forEach((part: any) => {
                                                if (part.type === 'line') part.set('stroke', val);
                                            });
                                        } else if (obj.type === 'group') {
                                            const objs = obj._objects;
                                            console.log('[SpeechBubble Color] Group selected:', obj);
                                            console.log('[SpeechBubble Color] Objects inside group:', objs.map((o: any) => o.type));

                                            // Flexible check instead of strict order
                                            const pathObj = objs?.find((o: any) => o.type === 'path');
                                            const textObj = objs?.find((o: any) => o.type === 'textbox' || o.type === 'i-text' || o.type === 'text');

                                            if (pathObj && textObj && obj.get('bubbleId')) {
                                                pathObj.set('stroke', val);
                                            } else if (obj.get('isArrow')) {
                                                objs.forEach((o: any) => {
                                                    if (o.type === 'line' || o.type === 'path') o.set('stroke', val);
                                                    if (o.type === 'polygon') o.set('fill', val);
                                                });
                                            } else {
                                                objs.forEach((o: any) => {
                                                    if (o.type === 'line') o.set('stroke', val);
                                                    if (o.type === 'path') o.set('stroke', val);
                                                    if (o.type === 'polygon') o.set('fill', val);
                                                });
                                            }
                                        }
                                    };

                                    // Apply to single object or active selection
                                    if (activeObject.type === 'activeSelection') {
                                        (activeObject as any)._objects.forEach(applyColor);
                                    } else {
                                        applyColor(activeObject);
                                    }
                                    fabricCanvas.current?.requestRenderAll();
                                }
                            }}
                            style={{ border: 'none', padding: 0, width: '24px', height: '24px', cursor: 'pointer', background: 'transparent' }}
                        />
                    </div>}

                    {/* Arrow Style */}
                    {isArrowContext && (
                        <>
                            <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--border-color, #ccc)', margin: '0 8px' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {([
                                    { id: 'straight', icon: <ArrowUpRight size={16} />, label: '直線矢印' },
                                    { id: 'curved', icon: <Spline size={16} />, label: '曲線矢印\nクリックで頂点追加\nダブルクリックで確定' },
                                    { id: 'elbow', icon: <CornerDownRight size={16} />, label: '折れ線矢印\nクリックで曲がり角追加\nダブルクリックで確定' },
                                ] as const).map(option => {
                                    const isActive = arrowStyle === option.id;
                                    return (
                                        <button
                                            key={option.id}
                                            className={`tool-btn ${isActive ? 'active' : ''}`}
                                            onClick={() => {
                                                setArrowStyle(option.id);
                                            }}
                                            data-tooltip={option.label}
                                            style={{
                                                background: isActive ? 'rgba(79, 70, 229, 0.1)' : 'transparent',
                                                color: isActive ? '#4f46e5' : 'inherit'
                                            }}
                                        >
                                            {option.icon}
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {/* Click Icon L/R Toggle + B/W Scheme */}
                    {isClickIconContext && (
                        <>
                            <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--border-color, #ccc)', margin: '0 8px' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ marginRight: 8, fontWeight: 'bold', color: 'var(--text-primary)' }}>Click:</span>
                                {(['left', 'right'] as const).map(type => {
                                    const activeObj = fabricCanvas.current?.getActiveObject();
                                    const isActive = activeObj ? activeObj.get('clickType') === type : type === 'left';

                                    return (
                                        <button
                                            key={type}
                                            className="action-btn"
                                            style={{
                                                padding: '4px 12px',
                                                background: isActive ? 'var(--primary, #4f46e5)' : 'var(--action-bg)',
                                                color: isActive ? '#ffffff' : 'var(--action-text)',
                                                border: isActive ? '1px solid transparent' : '1px solid var(--action-border)',
                                                fontWeight: isActive ? '600' : '500',
                                            }}
                                            onClick={() => {
                                                const canvas = fabricCanvas.current;
                                                const obj = canvas?.getActiveObject() as any;
                                                if (!obj || !obj.get('isClickIcon') || !canvas) return;

                                                const scheme = obj.get('clickScheme') || clickIconScheme;
                                                const oldLeft = obj.left ?? 0;
                                                const oldTop = obj.top ?? 0;
                                                const oldScaleX = obj.scaleX ?? 1;
                                                const oldScaleY = obj.scaleY ?? 1;
                                                const oldAngle = obj.angle ?? 0;
                                                const ctrlCfg = {
                                                    transparentCorners: false,
                                                    cornerColor: '#4f46e5',
                                                    cornerStyle: 'circle' as const,
                                                    borderColor: '#4f46e5',
                                                    cornerSize: 10,
                                                };

                                                canvas.remove(obj);
                                                const newGroup = buildClickCursorGroup(oldLeft, oldTop, type, scheme, ctrlCfg);
                                                newGroup.set({ scaleX: oldScaleX, scaleY: oldScaleY, angle: oldAngle });
                                                canvas.add(newGroup);
                                                canvas.setActiveObject(newGroup);
                                                canvas.requestRenderAll();
                                            }}
                                        >
                                            {type === 'left' ? 'LEFT' : 'RIGHT'}
                                        </button>
                                    );
                                })}
                            </div>
                            <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--border-color, #ccc)', margin: '0 8px' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ marginRight: 8, fontWeight: 'bold', color: 'var(--text-primary)' }}>Color:</span>
                                {(['dark', 'light'] as const).map(scheme => {
                                    const activeObj = fabricCanvas.current?.getActiveObject();
                                    const currentScheme = activeObj?.get('isClickIcon')
                                        ? (activeObj.get('clickScheme') || clickIconScheme)
                                        : clickIconScheme;
                                    const isActive = currentScheme === scheme;

                                    return (
                                        <button
                                            key={scheme}
                                            className="action-btn"
                                            style={{
                                                padding: '4px 10px',
                                                background: scheme === 'dark' ? '#1a1a2e' : '#ffffff',
                                                color: scheme === 'dark' ? '#ffffff' : '#1a1a2e',
                                                border: isActive ? '2px solid #4f46e5' : '1px solid var(--action-border)',
                                                fontWeight: isActive ? '600' : '500',
                                            }}
                                            onClick={() => {
                                                setClickIconScheme?.(scheme);
                                                const canvas = fabricCanvas.current;
                                                const obj = canvas?.getActiveObject() as any;
                                                if (!obj?.get('isClickIcon') || !canvas) return;

                                                const clickType = obj.get('clickType') || 'left';
                                                const oldLeft = obj.left ?? 0;
                                                const oldTop = obj.top ?? 0;
                                                const oldScaleX = obj.scaleX ?? 1;
                                                const oldScaleY = obj.scaleY ?? 1;
                                                const oldAngle = obj.angle ?? 0;
                                                const ctrlCfg = {
                                                    transparentCorners: false,
                                                    cornerColor: '#4f46e5',
                                                    cornerStyle: 'circle' as const,
                                                    borderColor: '#4f46e5',
                                                    cornerSize: 10,
                                                };

                                                canvas.remove(obj);
                                                const newGroup = buildClickCursorGroup(oldLeft, oldTop, clickType, scheme, ctrlCfg);
                                                newGroup.set({ scaleX: oldScaleX, scaleY: oldScaleY, angle: oldAngle });
                                                canvas.add(newGroup);
                                                canvas.setActiveObject(newGroup);
                                                canvas.requestRenderAll();
                                            }}
                                        >
                                            {scheme === 'dark' ? 'Black' : 'White'}
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {!isBubbleContext && !isClickIconContext && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <label>Width/Size: {strokeWidth}px</label>
                            <input
                                type="range"
                                min="1" max={currentTool === 'step-number' || currentTool === 'text' ? "40" : "20"}
                                value={strokeWidth}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    setStrokeWidth(val);

                                    // Live update active object
                                    const activeObject = fabricCanvas.current?.getActiveObject();
                                    if (activeObject) {
                                        const applySize = (obj: any) => {
                                            if (obj.type === 'i-text' || obj.type === 'text') {
                                                obj.set('fontSize', Math.max(16, val * 4));
                                            } else if (obj.type === 'path' || obj.type === 'line' || obj.type === 'rect') {
                                                // Don't change cover polygon stroke width
                                                if (obj.stroke !== 'white' || obj.fill !== 'white') {
                                                    obj.set('strokeWidth', val);
                                                }
                                            } else if (obj.get('isStepNumber')) {
                                                const scale = val / 8;
                                                obj.scale(scale);
                                            } else if (obj.type === 'group') {
                                                const objs = obj._objects;
                                                console.log('[SpeechBubble Size] Group selected:', obj);
                                                const pathObj = objs?.find((o: any) => o.type === 'path');
                                                const textObj = objs?.find((o: any) => o.type === 'textbox' || o.type === 'i-text' || o.type === 'text');

                                                if (pathObj && textObj && obj.get('bubbleId')) {
                                                    pathObj.set('strokeWidth', val);
                                                    if (typeof obj._calcBounds === 'function') obj._calcBounds();
                                                } else if (obj.get('isArrow')) {
                                                    objs.forEach((o: any) => {
                                                        if (o.type === 'line' || o.type === 'path') o.set('strokeWidth', val);
                                                    });
                                                } else {
                                                    const scale = val / 4;
                                                    obj.scale(scale);
                                                }
                                            }
                                        };

                                        if (activeObject.type === 'activeSelection') {
                                            (activeObject as any)._objects.forEach(applySize);
                                        } else {
                                            applySize(activeObject);
                                        }

                                        fabricCanvas.current?.requestRenderAll();
                                    }
                                }}
                                style={{ width: '100px', cursor: 'pointer' }}
                            />
                        </div>
                    )}

                    {/* Text Customizer conditionally rendered when a speech bubble is engaged */}
                    {isBubbleContext && (
                        <>
                            <div style={{ width: '1px', height: '24px', backgroundColor: '#ccc', margin: '0 8px' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <label>Text Color:</label>
                                <input
                                    type="color"
                                    value={fontColor}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setFontColor(val);
                                        const activeObject = fabricCanvas.current?.getActiveObject();
                                        if (activeObject) {
                                            const bubbleId = (activeObject as any).bubbleId || (typeof activeObject.get === 'function' && activeObject.get('bubbleId'));
                                            if (bubbleId) {
                                                let textObj = null;
                                                if (activeObject.type === 'group' || activeObject.type === 'Group') {
                                                    textObj = (activeObject as any)._objects?.find((o: any) => o.type === 'textbox' || o.type === 'i-text' || o.type === 'text' || o.type === 'Textbox' || o.type === 'IText' || o.type === 'Text');
                                                } else {
                                                    textObj = activeObject;
                                                }
                                                if (textObj) {
                                                    textObj.set('fill', val);
                                                    fabricCanvas.current?.requestRenderAll();
                                                }
                                            }
                                        }
                                    }}
                                    style={{ border: 'none', padding: 0, width: '24px', height: '24px', cursor: 'pointer', background: 'transparent' }}
                                />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <label>Text Size: {fontSize}px</label>
                                <input
                                    type="range"
                                    min="12" max="64"
                                    value={fontSize}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value);
                                        setFontSize(val);
                                        const activeObject = fabricCanvas.current?.getActiveObject();
                                        if (activeObject) {
                                            const bubbleId = (activeObject as any).bubbleId || (typeof activeObject.get === 'function' && activeObject.get('bubbleId'));
                                            if (bubbleId) {
                                                let textObj = null;
                                                if (activeObject.type === 'group' || activeObject.type === 'Group') {
                                                    textObj = (activeObject as any)._objects?.find((o: any) => o.type === 'textbox' || o.type === 'i-text' || o.type === 'text' || o.type === 'Textbox' || o.type === 'IText' || o.type === 'Text');
                                                } else {
                                                    textObj = activeObject;
                                                }
                                                if (textObj) {
                                                    textObj.set('fontSize', val);
                                                    textObj.fire('changed');
                                                    if (activeObject.type === 'group' || activeObject.type === 'Group') {
                                                        if (typeof (activeObject as any)._calcBounds === 'function') (activeObject as any)._calcBounds();
                                                    }
                                                    fabricCanvas.current?.requestRenderAll();
                                                }
                                            }
                                        }
                                    }}
                                    style={{ width: '100px', cursor: 'pointer' }}
                                />
                            </div>

                            {/* Text Formatting Toolbar */}
                            <div style={{ width: '1px', height: '24px', backgroundColor: '#ccc', margin: '0 8px' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <button
                                    className={`tool-btn ${isBold ? 'active' : ''}`}
                                    onClick={() => {
                                        const newVal = !isBold;
                                        if (setIsBold) setIsBold(newVal);
                                        const activeObject = fabricCanvas.current?.getActiveObject();
                                        if (activeObject) {
                                            const applyBold = (obj: any) => {
                                                if (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox' || obj.type === 'IText' || obj.type === 'Text' || obj.type === 'Textbox') {
                                                    obj.set('fontWeight', newVal ? 'bold' : 'normal');
                                                } else if (obj.type === 'group' || obj.type === 'Group') {
                                                    const textObj = obj._objects?.find((o: any) => o.type === 'textbox' || o.type === 'i-text' || o.type === 'text' || o.type === 'Textbox' || o.type === 'IText' || o.type === 'Text');
                                                    if (textObj) textObj.set('fontWeight', newVal ? 'bold' : 'normal');
                                                }
                                            }
                                            applyBold(activeObject);
                                            fabricCanvas.current?.requestRenderAll();
                                        }
                                    }}
                                    data-tooltip="Bold"
                                    style={{ background: isBold ? 'rgba(79, 70, 229, 0.1)' : 'transparent', color: isBold ? '#4f46e5' : 'inherit' }}
                                >
                                    <Bold size={16} />
                                </button>
                                <button
                                    className={`tool-btn ${isItalic ? 'active' : ''}`}
                                    onClick={() => {
                                        const newVal = !isItalic;
                                        if (setIsItalic) setIsItalic(newVal);
                                        const activeObject = fabricCanvas.current?.getActiveObject();
                                        if (activeObject) {
                                            const applyItalic = (obj: any) => {
                                                if (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox' || obj.type === 'IText' || obj.type === 'Text' || obj.type === 'Textbox') {
                                                    obj.set('fontStyle', newVal ? 'italic' : 'normal');
                                                } else if (obj.type === 'group' || obj.type === 'Group') {
                                                    const textObj = obj._objects?.find((o: any) => o.type === 'textbox' || o.type === 'i-text' || o.type === 'text' || o.type === 'Textbox' || o.type === 'IText' || o.type === 'Text');
                                                    if (textObj) textObj.set('fontStyle', newVal ? 'italic' : 'normal');
                                                }
                                            }
                                            applyItalic(activeObject);
                                            fabricCanvas.current?.requestRenderAll();
                                        }
                                    }}
                                    data-tooltip="Italic"
                                    style={{ background: isItalic ? 'rgba(79, 70, 229, 0.1)' : 'transparent', color: isItalic ? '#4f46e5' : 'inherit' }}
                                >
                                    <Italic size={16} />
                                </button>
                            </div>

                            <div style={{ width: '1px', height: '24px', backgroundColor: '#ccc', margin: '0 8px' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <label>Fill:</label>
                                <input
                                    type="color"
                                    value={bubbleFillColor || '#ffffff'}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (setBubbleFillColor) setBubbleFillColor(val);
                                        const readableTextColor = getReadableTextColor(val);
                                        setFontColor(readableTextColor);
                                        const canvas = fabricCanvas.current;
                                        const activeObject = canvas?.getActiveObject();
                                        if (!canvas || !activeObject) return;

                                        const bubbleId = (activeObject as any).bubbleId || (typeof activeObject.get === 'function' && activeObject.get('bubbleId'));
                                        const bubbleGroup = activeObject.type === 'group' || activeObject.type === 'Group'
                                            ? activeObject
                                            : canvas.getObjects().find((obj: any) => obj.get?.('bubbleId') === bubbleId && (obj.type === 'group' || obj.type === 'Group'));
                                        const pathObj = (bubbleGroup as any)?._objects?.find((obj: any) => obj.type === 'path' || obj.type === 'Path');
                                        const textObj = (bubbleGroup as any)?._objects?.find((obj: any) => obj.type === 'textbox' || obj.type === 'i-text' || obj.type === 'text' || obj.type === 'Textbox' || obj.type === 'IText' || obj.type === 'Text');

                                        if (pathObj) {
                                            pathObj.set('fill', val);
                                        }
                                        if (textObj) textObj.set('fill', readableTextColor);
                                        canvas.requestRenderAll();
                                    }}
                                    style={{ border: 'none', padding: 0, width: '24px', height: '24px', cursor: 'pointer', background: 'transparent' }}
                                />
                            </div>
                        </>
                    )}

                    {/* Lock Button */}
                    <div style={{ width: '1px', height: '24px', backgroundColor: '#ccc', margin: '0 8px' }} />
                    <button
                        className={`tool-btn ${isLocked ? 'active' : ''}`}
                        onClick={() => handleToggleLock && handleToggleLock()}
                        data-tooltip={isLocked ? chrome.i18n.getMessage("toolUnlock") : chrome.i18n.getMessage("toolLock")}
                        style={{ background: isLocked ? 'rgba(79, 70, 229, 0.1)' : 'transparent', color: isLocked ? '#4f46e5' : 'inherit' }}
                    >
                        {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
                    </button>
                </div>
            )}

            {/* Global Settings (e.g. Ruler) */}
            <div style={{
                position: 'fixed',
                bottom: '16px',
                right: '16px',
                background: '#fff',
                padding: '8px',
                borderRadius: '8px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                display: 'flex',
                gap: '8px',
                zIndex: 100
            }}>
                <button
                    className={`tool-btn ${showRuler ? 'active' : ''}`}
                    onClick={() => handleToggleRuler && handleToggleRuler()}
                    data-tooltip={chrome.i18n.getMessage("tooltipDimensions")} /* Will rename to tooltipRuler later */
                    style={{ background: showRuler ? 'rgba(79, 70, 229, 0.1)' : 'transparent', color: showRuler ? '#4f46e5' : 'inherit' }}
                >
                    <Ruler size={16} />
                </button>
            </div>
        </div>
    );
};

export default SubHeader;
