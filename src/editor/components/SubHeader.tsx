import React from 'react';
import { AlignLeft, AlignCenter, AlignRight, Lock, Unlock, Bold, Italic, X, Ruler } from 'lucide-react';
import { Canvas } from 'fabric';
import type { ToolType } from '../hooks/useCanvasTools';
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
    isBold?: boolean;
    setIsBold?: (bold: boolean) => void;
    isItalic?: boolean;
    setIsItalic?: (italic: boolean) => void;
    textBgColor?: string;
    setTextBgColor?: (color: string) => void;
    fabricCanvas: React.RefObject<Canvas | null>;
    isLocked?: boolean;
    handleToggleLock?: () => void;
    showRuler?: boolean;
    handleToggleRuler?: () => void;
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
    isBold,
    setIsBold,
    isItalic,
    setIsItalic,
    textBgColor,
    setTextBgColor,
    fabricCanvas,
    isLocked = false,
    handleToggleLock,
    showRuler = false,
    handleToggleRuler
}) => {
    return (
        <div style={{ position: 'absolute', top: '80px', left: '88px', right: '16px', zIndex: 100, display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
            {(currentTool !== 'select' || hasSelection) && currentTool !== 'spotlight-rect' && currentTool !== 'spotlight-ellipse' && currentTool !== 'blur-rect' && (
                <div className="sub-header" style={{
                    height: '48px', background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255, 255, 255, 0.4)', borderRadius: '12px', boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)',
                    display: 'flex', alignItems: 'center', padding: '0 20px', gap: '20px', fontSize: '13px', color: '#555'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                                            const clickType = obj.get('clickType');
                                            const parts = obj.getObjects();
                                            // parts[1] is LeftButton, parts[2] is RightButton
                                            if (clickType === 'left') {
                                                parts[1].set({ fill: val });
                                            } else {
                                                parts[2].set({ fill: val });
                                            }
                                        } else if (obj.type === 'group') {
                                            const objs = obj._objects;
                                            console.log('[SpeechBubble Color] Group selected:', obj);
                                            console.log('[SpeechBubble Color] Objects inside group:', objs.map((o: any) => o.type));

                                            // Flexible check instead of strict order
                                            const pathObj = objs?.find((o: any) => o.type === 'path');
                                            const textObj = objs?.find((o: any) => o.type === 'textbox' || o.type === 'i-text' || o.type === 'text');

                                            if (pathObj && textObj && obj.get('bubbleId')) {
                                                const isWhite = val === '#ffffff';
                                                pathObj.set('stroke', val);
                                                pathObj.set('fill', isWhite ? '#000000' : '#ffffff');
                                            } else {
                                                objs.forEach((o: any) => {
                                                    if (o.type === 'line') o.set('stroke', val);
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
                    </div>

                    {/* Click Icon L/R Toggle */}
                    {(currentTool === 'click-icon' || (fabricCanvas.current?.getActiveObject()?.get('isClickIcon'))) && (
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

                                                const color = obj.get('clickColor') || strokeColor;
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
                                                const newGroup = buildClickCursorGroup(oldLeft, oldTop, type, color, ctrlCfg);
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
                        </>
                    )}

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

                    {/* Text Customizer conditionally rendered when a speech bubble is engaged */}
                    {(currentTool === 'speech-bubble' || isBubbleSelected) && (
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
                                <label>Bg Color:</label>
                                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                    <input
                                        type="color"
                                        value={textBgColor === 'transparent' ? '#ffffff' : textBgColor}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (setTextBgColor) setTextBgColor(val);
                                            const activeObject = fabricCanvas.current?.getActiveObject();
                                            if (activeObject) {
                                                const applyBgColor = (obj: any) => {
                                                    if (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox' || obj.type === 'IText' || obj.type === 'Text' || obj.type === 'Textbox') {
                                                        obj.set('textBackgroundColor', val);
                                                    } else if (obj.type === 'group' || obj.type === 'Group') {
                                                        const textObj = obj._objects?.find((o: any) => o.type === 'textbox' || o.type === 'i-text' || o.type === 'text' || o.type === 'Textbox' || o.type === 'IText' || o.type === 'Text');
                                                        if (textObj) textObj.set('textBackgroundColor', val);
                                                    }
                                                }
                                                applyBgColor(activeObject);
                                                fabricCanvas.current?.requestRenderAll();
                                            }
                                        }}
                                        style={{ border: 'none', padding: 0, width: '24px', height: '24px', cursor: 'pointer', background: 'transparent' }}
                                    />
                                    <button
                                        className="tool-btn"
                                        style={{ position: 'absolute', right: '-24px', padding: '2px', width: '20px', height: '20px', marginLeft: '4px' }}
                                        onClick={() => {
                                            if (setTextBgColor) setTextBgColor('transparent');
                                            const activeObject = fabricCanvas.current?.getActiveObject();
                                            if (activeObject) {
                                                const applyBgColor = (obj: any) => {
                                                    if (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox' || obj.type === 'IText' || obj.type === 'Text' || obj.type === 'Textbox') {
                                                        obj.set('textBackgroundColor', '');
                                                    } else if (obj.type === 'group' || obj.type === 'Group') {
                                                        const textObj = obj._objects?.find((o: any) => o.type === 'textbox' || o.type === 'i-text' || o.type === 'text' || o.type === 'Textbox' || o.type === 'IText' || o.type === 'Text');
                                                        if (textObj) textObj.set('textBackgroundColor', '');
                                                    }
                                                }
                                                applyBgColor(activeObject);
                                                fabricCanvas.current?.requestRenderAll();
                                            }
                                        }}
                                        title="Clear Background"
                                    >
                                        <X size={12} color="#888" />
                                    </button>
                                </div>
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
