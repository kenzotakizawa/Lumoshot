import React from 'react';
import { Monitor, Undo, Redo, Copy, Download, ZoomIn, ZoomOut, Moon, Sun, HelpCircle, Scaling, Home } from 'lucide-react';
import { t as msg, getUILanguage } from '../../lib/i18n';

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
    onGoHome?: () => void;
    saveStatusLabel?: string | null;
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
    onGoHome,
    saveStatusLabel,
}) => {
    const isJapanese = getUILanguage().startsWith('ja');
    const t = (ja: string, en: string) => isJapanese ? ja : en;

    return (
        <div className="header">
            <span className="header-title">
                <img className="header-app-icon" src="/icons/icon48.png" alt="" />
                <span className="header-title-text">Lumoshot</span>
                <span className="header-status" style={{ color: 'var(--text-muted)', fontWeight: 'normal', marginLeft: '8px' }}>{status}</span>
                {saveStatusLabel && <span className="header-save-status">{saveStatusLabel}</span>}
            </span>

            {/* Zoom Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px', flexShrink: 0 }}>
                <button className="tool-btn" style={{ width: '28px', height: '28px' }} onClick={handleZoomOut} data-tooltip={t('縮小', 'Zoom out')}><ZoomOut size={16} /></button>
                <span className="zoom-label">{Math.round(zoomLevel * 100)}%</span>
                <button className="tool-btn" style={{ width: '28px', height: '28px' }} onClick={handleZoomIn} data-tooltip={t('拡大', 'Zoom in')}><ZoomIn size={16} /></button>
            </div>

            <div className="header-actions">
                {onGoHome && (
                    <button className="action-btn" onClick={onGoHome} data-tooltip={t('ホームへ戻る', 'Back to home')} aria-label={t('ホームへ戻る', 'Back to home')}>
                        <Home size={16} />
                    </button>
                )}
                <button
                    className={`action-btn ${hasFrame ? 'primary' : ''}`}
                    style={hasFrame ? {} : { border: '1px solid var(--border-color)' }}
                    onClick={toggleFrame}
                >
                    <Monitor size={16} /> <span className="action-label">{msg("actionFrame")}</span>
                </button>
                <button className="action-btn" onClick={onOpenResize} data-tooltip={t('リサイズ', 'Resize')}>
                    <Scaling size={16} /> <span className="action-label">{t('リサイズ', 'Resize')}</span>
                </button>
                <div className="header-divider" />
                <button className="action-btn" onClick={toggleDarkMode} data-tooltip={isDarkMode ? t('ライトモード', 'Light Mode') : t('ダークモード', 'Dark Mode')} aria-label={isDarkMode ? t('ライトモード', 'Light Mode') : t('ダークモード', 'Dark Mode')}>
                    {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
                </button>
                <button className="action-btn" onClick={onOpenHelp} data-tooltip={msg("helpTitle")} aria-label={msg("helpTitle")}>
                    <HelpCircle size={16} />
                </button>
                <div className="header-divider" />
                <button className="action-btn" onClick={handleUndo} data-tooltip={msg("actionUndo")}><Undo size={16} /></button>
                <button className="action-btn" onClick={handleRedo} data-tooltip={msg("actionRedo")}><Redo size={16} /></button>
                <button className="action-btn" onClick={handleCopy}><Copy size={16} /> <span className="action-label">{msg("actionCopy")}</span></button>
                <button className="action-btn primary" onClick={handleDownload} data-tooltip={t('PNG画像として保存', 'Save as a PNG image')}>
                    <Download size={16} /> <span className="action-label">{msg("actionSave")}</span>
                </button>
            </div>
        </div>
    );
};

export default Header;
