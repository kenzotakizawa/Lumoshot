import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, EyeOff, Eye, Pause, Play, Scissors } from 'lucide-react';
import type { FrameCache } from './frameCache';
import type { FrameRange } from './annotations';
import { formatTime, frameAt, type GifEdit } from './timeline';
import { tt } from './gifI18n';

export interface TimelineAnnotation {
    key: number;
    label: string;
    color: string;
    range: FrameRange;
    selected: boolean;
}

interface GifTimelineProps {
    times: number[];
    totalMs: number;
    frameAspect: number;
    frames: FrameCache;
    edit: GifEdit;
    current: number;
    playing: boolean;
    summary: string;
    summaryWarning: string | null;
    annotations: TimelineAnnotation[];
    selectedRange: FrameRange | null;
    onSeek: (index: number) => void;
    onTogglePlay: () => void;
    onStep: (delta: number) => void;
    onChangeEdit: (edit: GifEdit) => void;
    onSelectAnnotation: (key: number) => void;
    onSetRange: (kind: 'start' | 'end' | 'all') => void;
}

const STRIP_HEIGHT = 48;
const MIN_TRIM_MS = 100;

// Under the canvas: playback, a filmstrip with trim handles, frames left out,
// and one bar per annotation showing the frames it appears on.
const GifTimeline: React.FC<GifTimelineProps> = ({
    times, totalMs, frameAspect, frames, edit, current, playing, summary, summaryWarning,
    annotations, selectedRange, onSeek, onTogglePlay, onStep, onChangeEdit, onSelectAnnotation, onSetRange,
}) => {
    const rootRef = useRef<HTMLDivElement>(null);
    const stripRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [width, setWidth] = useState(0);
    // Trim-handle drags read the latest edit between renders.
    const editRef = useRef(edit);
    useEffect(() => {
        editRef.current = edit;
    }, [edit]);

    const frameEnd = (i: number) => (i + 1 < times.length ? times[i + 1] : totalMs);
    const x = (t: number) => (totalMs > 0 ? (t / totalMs) * width : 0);
    const timeAtClientX = (clientX: number) => {
        const rect = stripRef.current!.getBoundingClientRect();
        return Math.min(totalMs, Math.max(0, ((clientX - rect.left) / rect.width) * totalMs));
    };

    useEffect(() => {
        const el = stripRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setWidth(el.clientWidth));
        ro.observe(el);
        setWidth(el.clientWidth);
        return () => ro.disconnect();
    }, []);

    // Lets the editor's floating toggles sit above the timeline.
    useEffect(() => {
        const el = rootRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--gif-timeline-h', `${el.offsetHeight}px`));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Filmstrip thumbnails: one tile per slot across the full recording.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || width <= 0 || times.length === 0) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(STRIP_HEIGHT * dpr);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.scale(dpr, dpr);
        const tileW = Math.max(24, STRIP_HEIGHT * frameAspect);
        const tiles = Math.ceil(width / tileW);
        let cancelled = false;
        for (let k = 0; k < tiles; k++) {
            const left = k * tileW;
            const index = frameAt(times, ((left + tileW / 2) / width) * totalMs);
            frames.thumbnail(index, Math.round(STRIP_HEIGHT * dpr)).then((bmp) => {
                if (cancelled) return;
                // Cover the tile, centered.
                const scale = Math.max(tileW / bmp.width, STRIP_HEIGHT / bmp.height);
                const w = bmp.width * scale, h = bmp.height * scale;
                ctx.save();
                ctx.beginPath();
                ctx.rect(left, 0, tileW, STRIP_HEIGHT);
                ctx.clip();
                ctx.drawImage(bmp, left + (tileW - w) / 2, (STRIP_HEIGHT - h) / 2, w, h);
                ctx.restore();
            }).catch(() => {});
        }
        return () => {
            cancelled = true;
        };
    }, [width, times, totalMs, frameAspect, frames]);

    // Click / drag on the strip seeks.
    const onStripPointerDown = (e: React.PointerEvent) => {
        if ((e.target as HTMLElement).closest('.gif-trim-handle')) return;
        const el = e.currentTarget as HTMLElement;
        el.setPointerCapture(e.pointerId);
        onSeek(frameAt(times, timeAtClientX(e.clientX)));
        const move = (ev: PointerEvent) => onSeek(frameAt(times, timeAtClientX(ev.clientX)));
        const up = () => {
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerup', up);
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
    };

    const onHandlePointerDown = (which: 'start' | 'end') => (e: React.PointerEvent) => {
        e.stopPropagation();
        const el = e.currentTarget as HTMLElement;
        el.setPointerCapture(e.pointerId);
        const move = (ev: PointerEvent) => {
            const t = timeAtClientX(ev.clientX);
            const cur = editRef.current;
            // The preview follows the handle being dragged.
            if (which === 'start') {
                const trimStart = Math.max(0, Math.min(t, cur.trimEnd - MIN_TRIM_MS));
                onChangeEdit({ ...cur, trimStart });
                onSeek(frameAt(times, trimStart));
            } else {
                const trimEnd = Math.min(totalMs, Math.max(t, cur.trimStart + MIN_TRIM_MS));
                onChangeEdit({ ...cur, trimEnd });
                onSeek(frameAt(times, trimEnd - 1));
            }
        };
        const up = () => {
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerup', up);
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
    };

    const currentTime = times[current] ?? 0;
    const isDeleted = edit.deleted.includes(current);
    const toggleDeleted = () => {
        const deleted = isDeleted ? edit.deleted.filter((i) => i !== current) : [...edit.deleted, current].sort((a, b) => a - b);
        onChangeEdit({ ...edit, deleted });
    };
    const trimTo = (which: 'start' | 'end') => {
        if (which === 'start') onChangeEdit({ ...edit, trimStart: Math.min(currentTime, edit.trimEnd - MIN_TRIM_MS) });
        else onChangeEdit({ ...edit, trimEnd: Math.max(frameEnd(current), edit.trimStart + MIN_TRIM_MS) });
    };
    const trimmed = edit.trimStart > 0 || edit.trimEnd < totalMs;

    const rangeLabel = (r: FrameRange) => {
        if (r.from === undefined && r.to === undefined) return tt('すべてのフレーム', 'All frames');
        const from = r.from !== undefined ? formatTime(times[r.from] ?? 0) : formatTime(0);
        const to = r.to !== undefined ? formatTime(frameEnd(r.to)) : formatTime(totalMs);
        return `${from} 〜 ${to}`;
    };

    return (
        <div className="gif-timeline" ref={rootRef}>
            <div className="gif-timeline-controls">
                <button className="gif-tl-btn primary" onClick={onTogglePlay} aria-label={playing ? tt('一時停止', 'Pause') : tt('再生', 'Play')} title={playing ? tt('一時停止', 'Pause') : tt('再生（カット・除外を反映）', 'Play (with cuts applied)')}>
                    {playing ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <button className="gif-tl-btn" onClick={() => onStep(-1)} aria-label={tt('前のフレーム', 'Previous frame')} title={tt('前のフレーム（←）', 'Previous frame (←)')}>
                    <ChevronLeft size={16} />
                </button>
                <button className="gif-tl-btn" onClick={() => onStep(1)} aria-label={tt('次のフレーム', 'Next frame')} title={tt('次のフレーム（→）', 'Next frame (→)')}>
                    <ChevronRight size={16} />
                </button>
                <span className="gif-tl-time">
                    {formatTime(currentTime)} <span className="gif-tl-muted">/ {formatTime(totalMs)}</span>
                </span>
                <span className="gif-tl-muted gif-tl-frame">{tt(`フレーム ${current + 1} / ${times.length}`, `Frame ${current + 1} / ${times.length}`)}</span>

                <div className="gif-tl-group">
                    <button className="gif-tl-btn text" onClick={() => trimTo('start')} title={tt('ここより前をカット', 'Cut everything before this frame')}>
                        <Scissors size={14} /> {tt('ここから使う', 'Start here')}
                    </button>
                    <button className="gif-tl-btn text" onClick={() => trimTo('end')} title={tt('ここより後をカット', 'Cut everything after this frame')}>
                        {tt('ここまで使う', 'End here')} <Scissors size={14} />
                    </button>
                    {trimmed && (
                        <button className="gif-tl-link" onClick={() => onChangeEdit({ ...edit, trimStart: 0, trimEnd: totalMs })}>
                            {tt('カットを戻す', 'Undo cut')}
                        </button>
                    )}
                    <button className={`gif-tl-btn text ${isDeleted ? 'active' : ''}`} onClick={toggleDeleted} title={tt('このフレームを GIF に入れない／戻す', 'Leave this frame out of the GIF / put it back')}>
                        {isDeleted ? <Eye size={14} /> : <EyeOff size={14} />} {isDeleted ? tt('このフレームを戻す', 'Put frame back') : tt('このフレームを外す', 'Leave frame out')}
                    </button>
                </div>

                <span className={`gif-tl-summary ${summaryWarning ? 'warn' : ''}`} title={summaryWarning ?? undefined}>{summary}</span>
            </div>

            <div className="gif-strip" ref={stripRef} onPointerDown={onStripPointerDown} style={{ height: STRIP_HEIGHT }}>
                <canvas ref={canvasRef} className="gif-strip-canvas" style={{ width: '100%', height: STRIP_HEIGHT }} />
                {edit.deleted.map((i) => (
                    <div key={i} className="gif-strip-deleted" style={{ left: x(times[i]), width: Math.max(2, x(frameEnd(i)) - x(times[i])) }} />
                ))}
                <div className="gif-strip-cut" style={{ left: 0, width: x(edit.trimStart) }} />
                <div className="gif-strip-cut" style={{ left: x(edit.trimEnd), right: 0 }} />
                <div className="gif-strip-kept" style={{ left: x(edit.trimStart), width: Math.max(0, x(edit.trimEnd) - x(edit.trimStart)) }} />
                <div className="gif-trim-handle start" style={{ left: x(edit.trimStart) }} onPointerDown={onHandlePointerDown('start')} title={tt('始まり', 'Start')} />
                <div className="gif-trim-handle end" style={{ left: x(edit.trimEnd) }} onPointerDown={onHandlePointerDown('end')} title={tt('終わり', 'End')} />
                <div className="gif-playhead" style={{ left: x(currentTime) }} />
            </div>

            {annotations.length > 0 && (
                <div className="gif-tracks">
                    {annotations.map((a) => {
                        const from = a.range.from !== undefined ? times[a.range.from] ?? 0 : 0;
                        const to = a.range.to !== undefined ? frameEnd(a.range.to) : totalMs;
                        return (
                            <button
                                key={a.key}
                                className={`gif-track ${a.selected ? 'selected' : ''}`}
                                onClick={() => onSelectAnnotation(a.key)}
                                title={`${a.label}：${rangeLabel(a.range)}`}
                            >
                                <span className="gif-track-bar" style={{ left: x(from), width: Math.max(4, x(to) - x(from)), background: a.color }} />
                            </button>
                        );
                    })}
                    <div className="gif-tracks-playhead" style={{ left: x(currentTime) }} />
                </div>
            )}

            <div className="gif-range-row">
                {selectedRange ? (
                    <>
                        <span className="gif-range-label">{tt('選んだ注釈を表示：', 'Selected annotation shows:')} <strong>{rangeLabel(selectedRange)}</strong></span>
                        <button className="gif-tl-btn text" onClick={() => onSetRange('start')}>{tt('このフレームから表示', 'Show from this frame')}</button>
                        <button className="gif-tl-btn text" onClick={() => onSetRange('end')}>{tt('このフレームまで表示', 'Show until this frame')}</button>
                        <button className="gif-tl-link" onClick={() => onSetRange('all')}>{tt('すべてのフレームに表示', 'Show on all frames')}</button>
                    </>
                ) : (
                    <span className="gif-tl-muted">
                        {tt('注釈を選ぶと、表示するフレームの範囲を決められます（新しい注釈はすべてのフレームに表示）。',
                            'Select an annotation to choose which frames it appears on (new annotations show on all frames).')}
                    </span>
                )}
            </div>
        </div>
    );
};

export default GifTimeline;
