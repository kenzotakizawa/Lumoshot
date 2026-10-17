import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Canvas, FabricObject } from 'fabric';
import { GripVertical, Loader2, X } from 'lucide-react';
import Editor, { type EditorController, type EditorGifMode } from '../editor/Editor';
import type { InitialImage } from '../platform/types';
import { refreshRedactions } from '../editor/utils/redaction';
import { downloadBlob } from '../editor/utils/exportImage';
import { getRecording, updateRecording, type Recording } from './gifStore';
import { FrameCache } from './frameCache';
import {
    annotationObjects,
    applyFrameVisibility,
    rangeOf,
    restoreFrameInState,
    setBackgroundFrame,
    setRange,
    stripFrameFromState,
    withRelated,
    type FrameRange,
} from './annotations';
import { buildOutputFrames, normalizeEdit, totalDuration, formatTime, type GifEdit, type OutputFrame } from './timeline';
import { loadGifSettings, saveGifSettings, formatBytes, LARGE_GIF_BYTES, PAUSE_LIMIT_MS, type GifSettings } from './gifSettings';
import { GifFrameRenderer } from './gifRenderer';
import { estimateGifBytes, exportGif, ExportCancelled, gifFileName } from './gifExport';
import GifTimeline, { type TimelineAnnotation } from './GifTimeline';
import GifExportMenu from './GifExportMenu';
import { tt } from './gifI18n';

const SAVE_DELAY_MS = 600;
const ESTIMATE_DELAY_MS = 700;

function annotationLabel(o: FabricObject): string {
    if (o.get('isStepNumber')) return tt(`順序バッジ ${o.get('stepValue') ?? ''}`, `Step ${o.get('stepValue') ?? ''}`);
    if (o.get('isBlur')) return tt('塗りつぶし', 'Redaction');
    if (o.get('isSpotlight')) return tt('スポットライト', 'Spotlight');
    if (o.get('isZoomPanel')) return tt('部分ズーム', 'Zoom');
    if (o.get('isArrow')) return tt('矢印', 'Arrow');
    if (o.get('bubbleId')) return tt('吹き出し', 'Speech bubble');
    const type = (o.type || '').toLowerCase();
    if (type === 'i-text' || type === 'textbox' || type === 'text') {
        const text = String((o as unknown as { text?: string }).text ?? '').trim();
        return text ? `「${text.slice(0, 16)}」` : tt('テキスト', 'Text');
    }
    if (type === 'rect') return tt('四角形', 'Rectangle');
    if (type === 'ellipse' || type === 'circle') return tt('楕円', 'Ellipse');
    if (type === 'path') return tt('ペン', 'Pen');
    if (type === 'image') return tt('画像', 'Image');
    return tt('注釈', 'Annotation');
}

function annotationColor(o: FabricObject): string {
    const pick = (v: unknown) => (typeof v === 'string' && v !== 'transparent' && v !== '' ? v : null);
    const children = (o as unknown as { _objects?: FabricObject[] })._objects ?? [];
    return pick(o.stroke) ?? pick(o.fill) ?? children.map((c) => pick(c.stroke) ?? pick(c.fill)).find(Boolean) ?? '#6366f1';
}

interface ExportState {
    done: number;
    total: number;
    phase: 'palette' | 'frames';
}

interface ExportResult {
    url: string;
    name: string;
    size: number;
}

const GifApp: React.FC = () => {
    const recordingId = Number(new URLSearchParams(window.location.search).get('recording'));
    const [rec, setRec] = useState<Recording | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [initial, setInitial] = useState<InitialImage | null>(null);
    const framesRef = useRef<FrameCache | null>(null);
    const [edit, setEdit] = useState<GifEdit | null>(null);
    const [current, setCurrent] = useState(0);
    const currentRef = useRef(0);
    currentRef.current = current;
    const [playing, setPlaying] = useState(false);
    const [settings, setSettings] = useState<GifSettings>(loadGifSettings);
    const canvasRef = useRef<Canvas | null>(null);
    const listened = useRef(new WeakSet<Canvas>());
    // Bumped when annotations change (timeline, size estimate) and when the
    // selection changes (timeline only).
    const [docVersion, setDocVersion] = useState(0);
    const [selectionVersion, setSelectionVersion] = useState(0);
    const controllerRef = useRef<EditorController | null>(null);
    const [estimate, setEstimate] = useState<number | null>(null);
    const [estimating, setEstimating] = useState(false);
    const [exporting, setExporting] = useState<ExportState | null>(null);
    const exportAbort = useRef<AbortController | null>(null);
    const [result, setResult] = useState<ExportResult | null>(null);

    // ─── Load ───
    useEffect(() => {
        (async () => {
            if (!Number.isInteger(recordingId) || recordingId <= 0) throw new Error('missing');
            const r = await getRecording(recordingId);
            if (!r || r.status !== 'done' || r.times.length === 0) throw new Error('missing');
            const frames = new FrameCache(recordingId);
            framesRef.current = frames;
            const firstFrame = await frames.dataUrl(0);
            setEdit(normalizeEdit(r.edit, r.durationMs));
            setRec(r);
            setInitial(r.annotations
                ? { dataUrl: '', cropRect: null, mode: 'restore', restoreState: restoreFrameInState(r.annotations, firstFrame), restoreAssets: r.annotationAssets }
                : { dataUrl: firstFrame, cropRect: null, mode: 'capture' });
            document.title = tt('Lumoshot GIF エディタ', 'Lumoshot GIF editor');
        })().catch((err) => {
            console.error('Failed to open recording', err);
            setError(tt('録画が見つかりません。新しい録画に押し出されて削除された可能性があります（録画は新しい順に3件まで残ります）。',
                "This recording couldn't be found. It may have been removed to make room for newer ones (the 3 newest are kept)."));
        });
    }, [recordingId]);

    // ─── Saving edits (debounced) ───
    const pendingSave = useRef<Partial<Recording>>({});
    const saveTimer = useRef<number | null>(null);
    const flushSave = useCallback(() => {
        if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
        const patch = pendingSave.current;
        pendingSave.current = {};
        if (Object.keys(patch).length) updateRecording(recordingId, { ...patch, updatedAt: Date.now() }).catch((err) => console.warn('Saving the GIF edit failed', err));
    }, [recordingId]);
    const queueSave = useCallback((patch: Partial<Recording>) => {
        pendingSave.current = { ...pendingSave.current, ...patch };
        if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(flushSave, SAVE_DELAY_MS);
    }, [flushSave]);
    useEffect(() => {
        const onHide = () => flushSave();
        const onVisibility = () => document.visibilityState === 'hidden' && flushSave();
        window.addEventListener('pagehide', onHide);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            window.removeEventListener('pagehide', onHide);
            document.removeEventListener('visibilitychange', onVisibility);
            flushSave();
        };
    }, [flushSave]);

    const changeEdit = useCallback((next: GifEdit) => {
        setEdit(next);
        queueSave({ edit: next });
    }, [queueSave]);

    const handleSnapshot = useCallback((state: string, _thumbnail: string, assets: Record<string, string>) => {
        const stripped = stripFrameFromState(state, assets);
        queueSave({ annotations: stripped.state, annotationAssets: stripped.assets });
    }, [queueSave]);

    const changeSettings = (next: GifSettings) => {
        setSettings(next);
        saveGifSettings(next);
    };

    // ─── Showing a frame ───
    const frameToken = useRef(0);
    const showFrame = useCallback(async (index: number) => {
        const canvas = canvasRef.current;
        const frames = framesRef.current;
        if (!canvas || !frames) return;
        const token = ++frameToken.current;
        const bitmap = await frames.get(index).catch(() => null);
        if (!bitmap || token !== frameToken.current) return;
        setBackgroundFrame(canvas, bitmap);
        applyFrameVisibility(canvas, index);
        if (canvas.getActiveObjects().some((o) => !o.visible)) canvas.discardActiveObject();
        refreshRedactions(canvas);
        canvas.requestRenderAll();
    }, []);

    useEffect(() => {
        showFrame(current);
    }, [current, showFrame]);

    const onCanvasChange = useCallback((canvas: Canvas) => {
        canvasRef.current = canvas;
        if (!listened.current.has(canvas)) {
            listened.current.add(canvas);
            const bumpDoc = () => setDocVersion((v) => v + 1);
            const bumpSelection = () => setSelectionVersion((v) => v + 1);
            ['object:added', 'object:removed', 'object:modified'].forEach((ev) => canvas.on(ev as 'object:added', bumpDoc));
            ['selection:created', 'selection:updated', 'selection:cleared'].forEach((ev) => canvas.on(ev as 'selection:created', bumpSelection));
        }
        showFrame(currentRef.current);
        setDocVersion((v) => v + 1);
    }, [showFrame]);

    // ─── Output (what the GIF will contain) ───
    const output: OutputFrame[] = useMemo(() => {
        if (!rec || !edit) return [];
        return buildOutputFrames(rec.times, rec.durationMs, edit, { fps: settings.fps, maxPauseMs: settings.shortenPauses ? PAUSE_LIMIT_MS : null });
    }, [rec, edit, settings.fps, settings.shortenPauses]);

    // ─── Playback (plays the GIF as it will come out) ───
    useEffect(() => {
        if (!playing) return;
        if (output.length === 0) {
            setPlaying(false);
            return;
        }
        let pos = output.findIndex((f) => f.index >= currentRef.current);
        if (pos < 0 || pos === output.length - 1) pos = 0;
        let timer = 0;
        let cancelled = false;
        const step = () => {
            if (cancelled) return;
            const f = output[pos];
            setCurrent(f.index);
            framesRef.current?.prefetch(output.slice(pos + 1, pos + 4).map((o) => o.index));
            timer = window.setTimeout(() => {
                pos++;
                if (pos >= output.length) setPlaying(false);
                else step();
            }, f.duration);
        };
        step();
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
        // Edits made while playing take effect on the next play.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playing]);

    const seek = useCallback((index: number) => {
        if (!rec) return;
        setPlaying(false);
        setCurrent(Math.max(0, Math.min(rec.times.length - 1, index)));
    }, [rec]);

    const step = useCallback((delta: number) => seek(currentRef.current + delta), [seek]);

    // ←/→ step through frames (Shift: 10 at a time).
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            const target = e.target as HTMLElement | null;
            if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
            const active = canvasRef.current?.getActiveObject() as (FabricObject & { isEditing?: boolean }) | undefined;
            if (active?.isEditing) return;
            e.preventDefault();
            step((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 1));
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [step]);

    // ─── Annotations and their frame ranges ───
    const { annotations, selectedRange } = useMemo(() => {
        void docVersion;
        void selectionVersion;
        const canvas = canvasRef.current;
        if (!canvas) return { annotations: [] as TimelineAnnotation[], selectedRange: null as FrameRange | null };
        const active = new Set(canvas.getActiveObjects());
        const objs = annotationObjects(canvas);
        const list = objs.map((o, i) => ({ key: i, label: annotationLabel(o), color: annotationColor(o), range: rangeOf(o), selected: active.has(o) }));
        const selected = objs.filter((o) => active.has(o));
        return { annotations: list, selectedRange: selected.length ? rangeOf(selected[0]) : null };
    }, [docVersion, selectionVersion]);

    const selectAnnotation = (key: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const obj = annotationObjects(canvas)[key];
        if (!obj) return;
        const range = rangeOf(obj);
        const cur = currentRef.current;
        const inRange = (range.from === undefined || cur >= range.from) && (range.to === undefined || cur <= range.to);
        const select = () => {
            canvas.setActiveObject(obj);
            canvas.requestRenderAll();
            setSelectionVersion((v) => v + 1);
        };
        if (inRange) select();
        else {
            // Jump to its first frame, then select once it's shown.
            seek(range.from ?? 0);
            window.setTimeout(select, 60);
        }
    };

    const changeRange = (kind: 'start' | 'end' | 'all') => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const selected = canvas.getActiveObjects();
        if (selected.length === 0) return;
        const cur = currentRef.current;
        const prev = rangeOf(selected[0]);
        let next: FrameRange;
        if (kind === 'all') next = {};
        else if (kind === 'start') next = { from: cur, to: prev.to !== undefined && prev.to >= cur ? prev.to : undefined };
        else next = { from: prev.from !== undefined && prev.from <= cur ? prev.from : undefined, to: cur };
        setRange(withRelated(canvas, selected), next);
        // Through object:modified so it becomes an undo step and is saved.
        canvas.fire('object:modified', { target: selected[0] } as never);
        applyFrameVisibility(canvas, cur);
        canvas.requestRenderAll();
        setDocVersion((v) => v + 1);
    };

    // ─── Size estimate (debounced) ───
    useEffect(() => {
        if (!rec || output.length === 0 || exporting) return;
        const abort = new AbortController();
        setEstimating(true);
        const timer = window.setTimeout(async () => {
            const snap = controllerRef.current?.snapshotNow();
            const frames = framesRef.current;
            if (!snap || !frames) return;
            let renderer: GifFrameRenderer | null = null;
            try {
                renderer = await GifFrameRenderer.create(snap.state, snap.assets);
                const bytes = await estimateGifBytes({ renderer, frames, output, settings, signal: abort.signal });
                if (!abort.signal.aborted) setEstimate(bytes);
            } catch (err) {
                if (!(err instanceof ExportCancelled)) console.warn('GIF estimate failed', err);
            } finally {
                renderer?.dispose();
                if (!abort.signal.aborted) setEstimating(false);
            }
        }, ESTIMATE_DELAY_MS);
        return () => {
            abort.abort();
            window.clearTimeout(timer);
        };
    }, [rec, output, settings, docVersion, exporting]);

    const outDuration = totalDuration(output);
    const sizeText = estimating && estimate === null ? tt('計算中…', 'Calculating…') : estimate !== null ? tt(`約 ${formatBytes(estimate)}`, `~${formatBytes(estimate)}`) : '—';
    const summary = output.length
        ? `${sizeText} · ${formatTime(outDuration)} · ${tt(`${output.length} フレーム`, `${output.length} frames`)}`
        : tt('フレームがありません', 'No frames');
    const warning = estimate !== null && estimate > LARGE_GIF_BYTES
        ? tt('大きめです（10MB 前後でアップロードできないサービスがあります）。前後をカットする・なめらかさを 5fps にする・サイズを小さくすると軽くなります。',
            'This is large (some sites reject files over ~10 MB). Trim it, use 5 fps or a smaller size to make it lighter.')
        : null;

    // ─── Export ───
    const runExport = useCallback(async () => {
        if (!rec || output.length === 0 || exporting) return;
        const snap = controllerRef.current?.snapshotNow();
        const frames = framesRef.current;
        if (!snap || !frames) return;
        setPlaying(false);
        const abort = new AbortController();
        exportAbort.current = abort;
        setExporting({ done: 0, total: output.length, phase: 'palette' });
        let renderer: GifFrameRenderer | null = null;
        try {
            renderer = await GifFrameRenderer.create(snap.state, snap.assets);
            const canvas = canvasRef.current;
            const starts = canvas ? annotationObjects(canvas).map((o) => rangeOf(o).from ?? 0) : [];
            const blob = await exportGif({
                renderer,
                frames,
                output,
                settings,
                annotationStarts: starts,
                signal: abort.signal,
                onProgress: (done, total) => setExporting({ done, total, phase: 'frames' }),
            });
            const name = gifFileName();
            downloadBlob(blob, name);
            setResult((prev) => {
                if (prev) URL.revokeObjectURL(prev.url);
                return { url: URL.createObjectURL(blob), name, size: blob.size };
            });
        } catch (err) {
            if (!(err instanceof ExportCancelled)) {
                console.error('GIF export failed', err);
                window.alert(tt('GIF を作れませんでした。サイズを小さくして試してください。', "Couldn't make the GIF. Try a smaller size."));
            }
        } finally {
            renderer?.dispose();
            exportAbort.current = null;
            setExporting(null);
        }
    }, [rec, output, settings, exporting]);

    // Header button and ⌘S always run the latest export function.
    const runExportRef = useRef(runExport);
    runExportRef.current = runExport;

    const gifMode: EditorGifMode | null = useMemo(() => {
        if (!rec || !edit || !framesRef.current) return null;
        return {
            onCanvasChange,
            onSave: () => runExportRef.current(),
            exportControls: (
                <GifExportMenu
                    settings={settings}
                    onChange={changeSettings}
                    onSave={() => runExportRef.current()}
                    disabled={!!exporting || output.length === 0}
                    baseSize={{ width: rec.width, height: rec.height }}
                    summary={summary}
                    warning={warning}
                />
            ),
            timeline: (
                <GifTimeline
                    times={rec.times}
                    totalMs={rec.durationMs}
                    frameAspect={rec.width / rec.height}
                    frames={framesRef.current}
                    edit={edit}
                    current={current}
                    playing={playing}
                    summary={tt(`GIF：${summary}`, `GIF: ${summary}`)}
                    summaryWarning={warning}
                    annotations={annotations}
                    selectedRange={selectedRange}
                    onSeek={seek}
                    onTogglePlay={() => setPlaying((p) => !p)}
                    onStep={step}
                    onChangeEdit={changeEdit}
                    onSelectAnnotation={selectAnnotation}
                    onSetRange={changeRange}
                />
            ),
        };
        // The handlers read refs; rebuild when what's displayed changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rec, edit, current, playing, settings, summary, warning, annotations, selectedRange, exporting, output.length, onCanvasChange, seek, step, changeEdit]);

    if (error) {
        return (
            <div className="gif-message">
                <p>{error}</p>
                <a href="popup.html" onClick={(e) => { e.preventDefault(); window.close(); }}>{tt('閉じる', 'Close')}</a>
            </div>
        );
    }
    if (!initial || !gifMode) {
        return (
            <div className="gif-message">
                <Loader2 className="gif-spin" size={22} />
                <p>{tt('録画を読み込んでいます…', 'Loading the recording…')}</p>
            </div>
        );
    }

    return (
        <>
            <Editor initial={initial} controllerRef={controllerRef} onSnapshot={handleSnapshot} gif={gifMode} />

            {exporting && (
                <div className="gif-overlay" role="dialog" aria-label={tt('GIF を作成中', 'Making the GIF')}>
                    <div className="gif-progress">
                        <div className="gif-progress-title">
                            <Loader2 className="gif-spin" size={18} /> {tt('GIF を作成中…', 'Making the GIF…')}
                        </div>
                        <div className="gif-progress-bar">
                            <span style={{ width: `${exporting.phase === 'palette' ? 2 : Math.round((exporting.done / exporting.total) * 100)}%` }} />
                        </div>
                        <div className="gif-progress-meta">
                            {exporting.phase === 'palette'
                                ? tt('色を選んでいます…', 'Choosing colors…')
                                : tt(`${exporting.done} / ${exporting.total} フレーム`, `${exporting.done} / ${exporting.total} frames`)}
                        </div>
                        <button className="gif-progress-cancel" onClick={() => exportAbort.current?.abort()}>{tt('キャンセル', 'Cancel')}</button>
                    </div>
                </div>
            )}

            {result && (
                <div className="gif-result" role="status">
                    <a
                        className="gif-result-drag"
                        href={result.url}
                        download={result.name}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData('DownloadURL', `image/gif:${result.name}:${result.url}`)}
                        title={tt('ドラッグしてチャットやフォルダに持っていけます', 'Drag into a chat or folder')}
                    >
                        <GripVertical size={16} />
                        <img src={result.url} alt="" />
                        <span>
                            <strong>{tt('GIF を保存しました', 'GIF saved')}</strong>
                            <small>{result.name} · {formatBytes(result.size)}</small>
                            <small className="gif-result-hint">{tt('ここからドラッグしてファイルとして持ち出せます', 'Drag from here to use it as a file')}</small>
                        </span>
                    </a>
                    <button
                        className="gif-result-close"
                        onClick={() => {
                            URL.revokeObjectURL(result.url);
                            setResult(null);
                        }}
                        aria-label={tt('閉じる', 'Close')}
                    >
                        <X size={14} />
                    </button>
                </div>
            )}
        </>
    );
};

export default GifApp;
