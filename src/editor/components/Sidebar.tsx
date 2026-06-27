import React from 'react';
import {
    MousePointer2, Square, ArrowUpRight, Type,
    Focus, Circle, Droplet, ListOrdered, PenTool, Highlighter, MessageSquare, Mouse,
    Image as ImageIcon, Scaling, Crop, Columns2, ZoomIn, ScanSearch
} from 'lucide-react';
import type { ToolType } from '../hooks/useCanvasTools';
import { t } from '../../lib/i18n';

interface SidebarProps {
    currentTool: ToolType;
    setCurrentTool: (tool: ToolType) => void;
    strokeWidth: number;
    setStrokeWidth: (width: number) => void;
    setStrokeColor: (color: string) => void;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    onOpenResize: () => void;
    onStartCrop: () => void;
    isCropping: boolean;
    onStartBA: () => void;
    isBAMode: boolean;
}

/* ─── Tool definitions grouped by functional similarity ─── */
interface ToolDef {
    id: ToolType | 'resize' | 'crop' | 'insert-image' | 'click-icon' | 'before-after';
    icon: React.ReactNode;
    i18nKey: string;
    action?: 'tool' | 'resize' | 'crop' | 'image' | 'ba';
    setStrokeWidth?: number;
    setStrokeColor?: string;
    resetStrokeIfThick?: boolean;
}

const TOOL_GROUPS: ToolDef[][] = [
    [
        { id: 'select', icon: <MousePointer2 size={20} />, i18nKey: 'toolSelect' },
    ],
    [
        { id: 'rect', icon: <Square size={20} />, i18nKey: 'toolRect', resetStrokeIfThick: true },
        { id: 'rounded-rect', icon: <Square size={20} style={{ rx: 4, ry: 4 }} />, i18nKey: 'toolRoundedRect', resetStrokeIfThick: true },
        { id: 'arrow', icon: <ArrowUpRight size={20} />, i18nKey: 'toolArrow', resetStrokeIfThick: true },
        { id: 'speech-bubble', icon: <MessageSquare size={20} />, i18nKey: 'toolSpeechBubble', resetStrokeIfThick: true },
    ],
    [
        { id: 'text', icon: <Type size={20} />, i18nKey: 'toolText', resetStrokeIfThick: true },
        { id: 'step-number', icon: <ListOrdered size={20} />, i18nKey: 'toolStepNumber', setStrokeWidth: 8 },
        { id: 'click-icon', icon: <Mouse size={20} />, i18nKey: 'toolClickIcon' },
    ],
    [
        { id: 'pen', icon: <PenTool size={20} />, i18nKey: 'toolPen', resetStrokeIfThick: true },
        { id: 'highlighter', icon: <Highlighter size={20} />, i18nKey: 'toolHighlighter', setStrokeWidth: 12 },
    ],
    [
        { id: 'spotlight-rect', icon: <Focus size={20} />, i18nKey: 'toolSpotlightRect' },
        { id: 'spotlight-ellipse', icon: <Circle size={20} />, i18nKey: 'toolSpotlightEllipse' },
        { id: 'blur-rect', icon: <Droplet size={20} />, i18nKey: 'toolBlurRect', setStrokeColor: '#000000' },
        { id: 'zoom-rect', icon: <ZoomIn size={20} />, i18nKey: 'toolZoomRect' },
        { id: 'zoom-ellipse', icon: <ScanSearch size={20} />, i18nKey: 'toolZoomEllipse' },
    ],
    [
        { id: 'insert-image', icon: <ImageIcon size={20} />, i18nKey: 'toolInsertImage', action: 'image' },
        { id: 'resize', icon: <Scaling size={20} />, i18nKey: 'toolResize', action: 'resize' },
        { id: 'crop', icon: <Crop size={20} />, i18nKey: 'toolCrop', action: 'crop' },
        { id: 'before-after', icon: <Columns2 size={20} />, i18nKey: 'toolBeforeAfter', action: 'ba' },
    ],
];

const Sidebar: React.FC<SidebarProps> = ({
    currentTool, setCurrentTool, strokeWidth, setStrokeWidth, setStrokeColor,
    fileInputRef, onOpenResize, onStartCrop, isCropping, onStartBA, isBAMode
}) => {
    const handleClick = (def: ToolDef) => {
        switch (def.action) {
            case 'resize': onOpenResize(); return;
            case 'crop': onStartCrop(); return;
            case 'image': fileInputRef.current?.click(); return;
            case 'ba': onStartBA(); return;
        }
        const toolId = def.id as ToolType;
        setCurrentTool(toolId);
        if (def.setStrokeWidth !== undefined) {
            setStrokeWidth(def.setStrokeWidth);
        } else if (def.resetStrokeIfThick && strokeWidth === 8) {
            setStrokeWidth(2);
        }
        if (def.setStrokeColor !== undefined) {
            setStrokeColor(def.setStrokeColor);
        }
    };

    const isActive = (def: ToolDef): boolean => {
        if (def.id === 'crop') return isCropping;
        if (def.id === 'before-after') return isBAMode;
        return currentTool === def.id;
    };

    return (
        <div className="sidebar">
            <div className="sidebar-inner">
                {TOOL_GROUPS.map((group, gi) => (
                    <React.Fragment key={gi}>
                        {gi > 0 && <div className="sidebar-divider" />}
                        {group.map(def => (
                            <button
                                key={def.id}
                                className={`tool-btn ${isActive(def) ? 'active' : ''}`}
                                onClick={() => handleClick(def)}
                                data-tooltip={t(def.i18nKey)}
                            >
                                {def.icon}
                            </button>
                        ))}
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
};

export default Sidebar;
