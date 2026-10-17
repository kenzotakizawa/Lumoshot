import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download } from 'lucide-react';
import { GIF_COLOR_OPTIONS } from './gifEncode';
import { GIF_SCALE_RANGE, PAUSE_LIMIT_MS, type GifSettings } from './gifSettings';
import { GIF_FPS_OPTIONS } from './timeline';
import { tt } from './gifI18n';

interface GifExportMenuProps {
    settings: GifSettings;
    onChange: (next: GifSettings) => void;
    onSave: () => void;
    disabled: boolean;
    // Recording size in pixels (before scaling).
    baseSize: { width: number; height: number };
    // "約 2.4 MB · 12.3 秒 · 87 フレーム" or "計算中…"
    summary: string;
    warning: string | null;
}

const MOD_KEY = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

// "Save GIF" plus a ▾ with the GIF settings and the size estimate.
const GifExportMenu: React.FC<GifExportMenuProps> = ({ settings, onChange, onSave, disabled, baseSize, summary, warning }) => {
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

    const px = { width: Math.round(baseSize.width * settings.scale), height: Math.round(baseSize.height * settings.scale) };
    const set = (patch: Partial<GifSettings>) => onChange({ ...settings, ...patch });

    return (
        <div className="export-menu" ref={rootRef}>
            <button
                className="action-btn primary export-save-btn"
                onClick={onSave}
                disabled={disabled}
                data-tooltip={tt(`GIF を保存（${MOD_KEY}S）`, `Save GIF (${MOD_KEY}S)`)}
            >
                <Download size={16} /> <span className="action-label">{tt('GIF保存', 'Save GIF')}</span>
            </button>
            <button
                className="action-btn primary export-toggle-btn"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label={tt('GIF の設定', 'GIF settings')}
                data-tooltip={tt('GIF の設定', 'GIF settings')}
            >
                <ChevronDown size={16} />
            </button>

            {open && (
                <div className="export-panel gif-export-panel" role="dialog" aria-label={tt('GIF の設定', 'GIF settings')}>
                    <div className="export-panel-title">{tt('GIF の設定', 'GIF settings')}</div>

                    <div className="export-row">
                        <span className="export-row-label">{tt('なめらかさ', 'Frame rate')}</span>
                        <div className="export-segment" role="radiogroup" aria-label={tt('フレームレート', 'Frame rate')}>
                            {GIF_FPS_OPTIONS.map((fps) => (
                                <button key={fps} role="radio" aria-checked={settings.fps === fps} className={settings.fps === fps ? 'active' : ''} onClick={() => set({ fps })}>
                                    {fps} fps
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="export-row">
                        <span className="export-row-label">{tt('サイズ', 'Size')}</span>
                        <div className="export-quality">
                            <input
                                type="range"
                                min={GIF_SCALE_RANGE.min * 100}
                                max={GIF_SCALE_RANGE.max * 100}
                                step={GIF_SCALE_RANGE.step * 100}
                                value={Math.round(settings.scale * 100)}
                                onChange={(e) => set({ scale: Number(e.target.value) / 100 })}
                                aria-label={tt('サイズ', 'Size')}
                            />
                            <span>{Math.round(settings.scale * 100)}%</span>
                        </div>
                    </div>
                    <div className="export-size-hint">{px.width} × {px.height} px</div>

                    <div className="export-row">
                        <span className="export-row-label">{tt('色数', 'Colors')}</span>
                        <div className="export-segment" role="radiogroup" aria-label={tt('色数', 'Colors')}>
                            {GIF_COLOR_OPTIONS.map((c) => (
                                <button key={c} role="radio" aria-checked={settings.colors === c} className={settings.colors === c ? 'active' : ''} onClick={() => set({ colors: c })}>
                                    {c}
                                </button>
                            ))}
                        </div>
                    </div>

                    <label className="gif-check">
                        <input type="checkbox" checked={settings.dither} onChange={(e) => set({ dither: e.target.checked })} />
                        <span>
                            {tt('ディザリング', 'Dithering')}
                            <small>{tt('写真やグラデーションがなめらかに（サイズは増えます）', 'Smoother photos and gradients (larger file)')}</small>
                        </span>
                    </label>
                    <label className="gif-check">
                        <input type="checkbox" checked={settings.loop} onChange={(e) => set({ loop: e.target.checked })} />
                        <span>{tt('くり返し再生', 'Loop')}</span>
                    </label>
                    <label className="gif-check">
                        <input type="checkbox" checked={settings.shortenPauses} onChange={(e) => set({ shortenPauses: e.target.checked })} />
                        <span>
                            {tt(`止まっている時間を最大 ${PAUSE_LIMIT_MS / 1000} 秒に縮める`, `Shorten still moments to ${PAUSE_LIMIT_MS / 1000} s`)}
                        </span>
                    </label>

                    <div className={`gif-estimate ${warning ? 'warn' : ''}`}>
                        <div className="gif-estimate-label">{tt('仕上がりの目安', 'Estimated result')}</div>
                        <div className="gif-estimate-value">{summary}</div>
                        {warning && <p className="gif-estimate-warning">{warning}</p>}
                    </div>
                </div>
            )}
        </div>
    );
};

export default GifExportMenu;
