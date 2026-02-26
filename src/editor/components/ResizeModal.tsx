import React, { useState, useEffect } from 'react';
import {
    Monitor, Smartphone, Square as SquareIcon, RectangleVertical,
    Laptop, Camera, Chrome, Link, Unlink, X
} from 'lucide-react';

interface ResizeModalProps {
    isOpen: boolean;
    currentWidth: number;
    currentHeight: number;
    onApply: (width: number, height: number) => void;
    onClose: () => void;
}

interface SizeTemplate {
    label: string;
    width: number;
    height: number;
    description: string;
}

interface TemplateCategory {
    name: string;
    ratio: string;
    icon: React.ReactNode;
    templates: SizeTemplate[];
}

const TEMPLATE_CATEGORIES: TemplateCategory[] = [
    {
        name: '16:9 ワイド',
        ratio: '16:9',
        icon: <Monitor size={14} />,
        templates: [
            { label: 'Full HD', width: 1920, height: 1080, description: '動画・テレビ・PCの標準' },
            { label: 'HD', width: 1280, height: 720, description: '軽量な動画向け' },
            { label: '4K', width: 3840, height: 2160, description: '高精細ディスプレイ' },
        ]
    },
    {
        name: '9:16 縦長',
        ratio: '9:16',
        icon: <Smartphone size={14} />,
        templates: [
            { label: 'Story / Reel', width: 1080, height: 1920, description: 'Instagram Reel, YouTube Shorts, TikTok' },
            { label: 'スマホ縦', width: 720, height: 1280, description: 'スマホ縦画面向け' },
        ]
    },
    {
        name: '1:1 スクエア',
        ratio: '1:1',
        icon: <SquareIcon size={14} />,
        templates: [
            { label: 'Instagram', width: 1080, height: 1080, description: 'Instagram投稿向け' },
            { label: 'X / Twitter', width: 1200, height: 1200, description: 'X(Twitter)投稿向け' },
        ]
    },
    {
        name: '4:5 縦長',
        ratio: '4:5',
        icon: <RectangleVertical size={14} />,
        templates: [
            { label: 'Instagram Feed', width: 1080, height: 1350, description: 'インスタで最も見えやすい比率' },
        ]
    },
    {
        name: '16:10 ノートPC',
        ratio: '16:10',
        icon: <Laptop size={14} />,
        templates: [
            { label: 'WUXGA', width: 1920, height: 1200, description: 'PCディスプレイ標準' },
            { label: 'WXGA', width: 1280, height: 800, description: '軽量ノートPC' },
        ]
    },
    {
        name: '3:2 写真',
        ratio: '3:2',
        icon: <Camera size={14} />,
        templates: [
            { label: 'カメラ', width: 1080, height: 720, description: 'デジタルカメラ標準比率' },
        ]
    },
    {
        name: 'Chrome拡張',
        ratio: '1:1',
        icon: <Chrome size={14} />,
        templates: [
            { label: 'Icon 16', width: 16, height: 16, description: 'ファビコン・ツールバー' },
            { label: 'Icon 48', width: 48, height: 48, description: '拡張機能管理画面' },
            { label: 'Icon 128', width: 128, height: 128, description: 'Chrome Web Store' },
        ]
    },
];

const ResizeModal: React.FC<ResizeModalProps> = ({ isOpen, currentWidth, currentHeight, onApply, onClose }) => {
    const [width, setWidth] = useState(currentWidth);
    const [height, setHeight] = useState(currentHeight);
    const [lockAspect, setLockAspect] = useState(true);
    const [aspectRatio, setAspectRatio] = useState(currentWidth / currentHeight);
    const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setWidth(currentWidth);
            setHeight(currentHeight);
            setAspectRatio(currentWidth / currentHeight);
        }
    }, [isOpen, currentWidth, currentHeight]);

    const handleWidthChange = (newWidth: number) => {
        if (isNaN(newWidth) || newWidth < 1) return;
        setWidth(newWidth);
        if (lockAspect) {
            setHeight(Math.round(newWidth / aspectRatio));
        }
    };

    const handleHeightChange = (newHeight: number) => {
        if (isNaN(newHeight) || newHeight < 1) return;
        setHeight(newHeight);
        if (lockAspect) {
            setWidth(Math.round(newHeight * aspectRatio));
        }
    };

    const handleTemplateClick = (tw: number, th: number) => {
        setWidth(tw);
        setHeight(th);
        setAspectRatio(tw / th);
    };

    const handleApply = () => {
        if (width > 0 && height > 0) {
            onApply(width, height);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="resize-modal-overlay" onClick={onClose}>
            <div className="resize-modal" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="resize-modal-header">
                    <h3>リサイズ</h3>
                    <button className="resize-modal-close" onClick={onClose}>
                        <X size={16} />
                    </button>
                </div>

                {/* Size Inputs */}
                <div className="resize-inputs">
                    <div className="resize-input-group">
                        <label>W</label>
                        <input
                            type="number"
                            value={width}
                            onChange={e => handleWidthChange(parseInt(e.target.value))}
                            min={1}
                        />
                        <span className="resize-unit">px</span>
                    </div>

                    <button
                        className={`resize-lock-btn ${lockAspect ? 'active' : ''}`}
                        onClick={() => {
                            setLockAspect(!lockAspect);
                            if (!lockAspect) {
                                // Re-lock: recalculate aspect ratio from current values
                                setAspectRatio(width / height);
                            }
                        }}
                        data-tooltip={lockAspect ? 'アスペクト比固定中' : 'アスペクト比フリー'}
                    >
                        {lockAspect ? <Link size={14} /> : <Unlink size={14} />}
                    </button>

                    <div className="resize-input-group">
                        <label>H</label>
                        <input
                            type="number"
                            value={height}
                            onChange={e => handleHeightChange(parseInt(e.target.value))}
                            min={1}
                        />
                        <span className="resize-unit">px</span>
                    </div>
                </div>

                {/* Current size info */}
                <div className="resize-current-info">
                    現在: {currentWidth} × {currentHeight} px
                </div>

                {/* Templates */}
                <div className="resize-templates">
                    {TEMPLATE_CATEGORIES.map(cat => (
                        <div key={cat.name} className="resize-category">
                            <button
                                className={`resize-category-header ${expandedCategory === cat.name ? 'expanded' : ''}`}
                                onClick={() => setExpandedCategory(expandedCategory === cat.name ? null : cat.name)}
                            >
                                <span className="resize-category-icon">{cat.icon}</span>
                                <span className="resize-category-name">{cat.name}</span>
                                <span className="resize-category-ratio">{cat.ratio}</span>
                            </button>
                            {expandedCategory === cat.name && (
                                <div className="resize-category-items">
                                    {cat.templates.map(t => (
                                        <button
                                            key={t.label}
                                            className={`resize-template-btn ${width === t.width && height === t.height ? 'selected' : ''}`}
                                            onClick={() => handleTemplateClick(t.width, t.height)}
                                        >
                                            <div className="resize-template-info">
                                                <span className="resize-template-label">{t.label}</span>
                                                <span className="resize-template-desc">{t.description}</span>
                                            </div>
                                            <span className="resize-template-size">{t.width}×{t.height}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Actions */}
                <div className="resize-actions">
                    <button className="resize-cancel-btn" onClick={onClose}>キャンセル</button>
                    <button className="resize-apply-btn" onClick={handleApply}>適用</button>
                </div>
            </div>
        </div>
    );
};

export default ResizeModal;
