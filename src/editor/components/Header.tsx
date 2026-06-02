import React from 'react';
import { Monitor, Undo, Redo, Copy, Download, ZoomIn, ZoomOut, Moon, Sun, HelpCircle, Scaling } from 'lucide-react';

interface HeaderProps {
    status: string;
    zoomLevel: number;
    handleZoomIn: () => void;
    handleZoomOut: () => void;
    hasFrame: boolean;
    toggleFrame: () => void;
    handleUndo: () => void;
    handleRedo: () => void;
    handleCopy: () => void;
    handleDownload: () => void;
    isDarkMode: boolean;
    toggleDarkMode: () => void;
    onOpenHelp: () => void;
    onOpenResize: () => void;
}

const Header: React.FC<HeaderProps> = ({
    status,
    zoomLevel,
    handleZoomIn,
    handleZoomOut,
    hasFrame,
    toggleFrame,
    handleUndo,
    handleRedo,
    handleCopy,
    handleDownload,
    isDarkMode,
    toggleDarkMode,
    onOpenHelp,
    onOpenResize,
}) => {
    const isJapanese = chrome.i18n.getUILanguage().startsWith('ja');
    const t = (ja: string, en: string) => isJapanese ? ja : en;

    return (
        <div className="header">
            <span className="header-title">
                <span className="header-title-text">Lumoshot</span>
                <span className="header-status" style={{ color: 'var(--text-muted)', fontWeight: 'normal', marginLeft: '8px' }}>{status}</span>
            </span>

            {/* Zoom Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px', flexShrink: 0 }}>
                <button className="tool-btn" style={{ width: '28px', height: '28px' }} onClick={handleZoomOut} data-tooltip={t('縮小', 'Zoom out')}><ZoomOut size={16} /></button>
                <span className="zoom-label">{Math.round(zoomLevel * 100)}%</span>
                <button className="tool-btn" style={{ width: '28px', height: '28px' }} onClick={handleZoomIn} data-tooltip={t('拡大', 'Zoom in')}><ZoomIn size={16} /></button>
            </div>

            <div className="header-actions">
                <button
                    className={`action-btn ${hasFrame ? 'primary' : ''}`}
                    style={hasFrame ? {} : { border: '1px solid var(--border-color)' }}
                    onClick={toggleFrame}
                >
                    <Monitor size={16} /> <span className="action-label">{chrome.i18n.getMessage("actionFrame")}</span>
                </button>
                <button className="action-btn" onClick={onOpenResize} data-tooltip={t('リサイズ', 'Resize')}>
                    <Scaling size={16} /> <span className="action-label">{t('リサイズ', 'Resize')}</span>
                </button>
                <div className="header-divider" />
                <button className="action-btn" onClick={toggleDarkMode} data-tooltip={isDarkMode ? t('ライトモード', 'Light Mode') : t('ダークモード', 'Dark Mode')}>
                    {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
                </button>
                <button className="action-btn" onClick={onOpenHelp} data-tooltip={chrome.i18n.getMessage("helpTitle")}>
                    <HelpCircle size={16} />
                </button>

                <div className="header-divider" />
                <button className="action-btn" onClick={handleUndo} data-tooltip={chrome.i18n.getMessage("actionUndo")}><Undo size={16} /></button>
                <button className="action-btn" onClick={handleRedo} data-tooltip={chrome.i18n.getMessage("actionRedo")}><Redo size={16} /></button>
                <button className="action-btn" onClick={handleCopy}><Copy size={16} /> <span className="action-label">{chrome.i18n.getMessage("actionCopy")}</span></button>
                <button className="action-btn primary" onClick={handleDownload}><Download size={16} /> <span className="action-label">{chrome.i18n.getMessage("actionSave")}</span></button>
            </div>
        </div>
    );
};

export default Header;
