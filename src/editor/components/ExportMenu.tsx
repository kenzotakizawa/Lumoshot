import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download } from 'lucide-react';
import {
    EXPORT_FORMATS,
    EXPORT_SCALES,
    exportPixelSize,
    type ExportFormat,
    type ExportOptions,
} from '../utils/exportImage';

interface ExportMenuProps {
    options: ExportOptions;
    onChange: (next: ExportOptions) => void;
    onSave: () => void;
    // Read when the menu opens, so it reflects resizes/crops since last render.
    getBaseSize: () => { width: number; height: number };
    t: (ja: string, en: string) => string;
    isJapanese: boolean;
}

const FORMAT_ORDER: ExportFormat[] = ['png', 'jpeg', 'webp'];
const MOD_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

// The primary "Save" button plus a ▾ that opens the export settings.
const ExportMenu: React.FC<ExportMenuProps> = ({ options, onChange, onSave, getBaseSize, t, isJapanese }) => {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: PointerEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    const { label, lossy } = EXPORT_FORMATS[options.format];
    const saveLabel = isJapanese ? `${label}保存` : `Save ${label}`;
    const px = open ? exportPixelSize(getBaseSize(), options.scale) : null;
    const scaleLabel = (scale: number) => (scale === 1 ? t('等倍', '100%') : `${scale * 100}%`);

    return (
        <div className="export-menu" ref={rootRef}>
            <button
                className="action-btn primary export-save-btn"
                onClick={onSave}
                data-tooltip={t(`${label}画像として保存（${MOD_KEY}S）`, `Save as a ${label} image (${MOD_KEY}S)`)}
            >
                <Download size={16} /> <span className="action-label">{saveLabel}</span>
            </button>
            <button
                className="action-btn primary export-toggle-btn"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label={t('書き出し設定', 'Export settings')}
                data-tooltip={t('書き出し設定', 'Export settings')}
            >
                <ChevronDown size={16} />
            </button>

            {open && (
                <div className="export-panel" role="dialog" aria-label={t('書き出し設定', 'Export settings')}>
                    <div className="export-panel-title">{t('書き出し設定', 'Export settings')}</div>

                    <div className="export-row">
                        <span className="export-row-label">{t('形式', 'Format')}</span>
                        <div className="export-segment" role="radiogroup" aria-label={t('形式', 'Format')}>
                            {FORMAT_ORDER.map((f) => (
                                <button
                                    key={f}
                                    role="radio"
                                    aria-checked={options.format === f}
                                    className={options.format === f ? 'active' : ''}
                                    onClick={() => onChange({ ...options, format: f })}
                                >
                                    {EXPORT_FORMATS[f].label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {lossy && (
                        <div className="export-row">
                            <span className="export-row-label">{t('品質', 'Quality')}</span>
                            <div className="export-quality">
                                <input
                                    type="range"
                                    min={50}
                                    max={100}
                                    step={5}
                                    value={Math.round(options.quality * 100)}
                                    onChange={(e) => onChange({ ...options, quality: Number(e.target.value) / 100 })}
                                    aria-label={t('品質', 'Quality')}
                                />
                                <span>{Math.round(options.quality * 100)}%</span>
                            </div>
                        </div>
                    )}

                    <div className="export-row">
                        <span className="export-row-label">{t('サイズ', 'Size')}</span>
                        <div className="export-segment" role="radiogroup" aria-label={t('サイズ', 'Size')}>
                            {EXPORT_SCALES.map((s) => (
                                <button
                                    key={s}
                                    role="radio"
                                    aria-checked={options.scale === s}
                                    className={options.scale === s ? 'active' : ''}
                                    onClick={() => onChange({ ...options, scale: s })}
                                >
                                    {scaleLabel(s)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {px && <div className="export-size-hint">{px.width} × {px.height} px</div>}
                    <p className="export-note">
                        {t('コピーは常にPNGです（サイズは反映されます）。',
                            'Copy always uses PNG (the size setting applies).')}
                    </p>
                </div>
            )}
        </div>
    );
};

export default ExportMenu;
