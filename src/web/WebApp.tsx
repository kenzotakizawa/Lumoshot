import { useState, useCallback, useEffect, useRef, type MouseEvent, type KeyboardEvent } from 'react';
import { Monitor, Upload, ClipboardPaste, Trash2, Pencil, Check, X, PlayCircle, HelpCircle, ShieldCheck, Puzzle } from 'lucide-react';
import Editor from '../editor/Editor';
import '../editor/Editor.css';
import './web.css';
import { setWebInitialImage, setWebInitialState } from '../platform/platform.web';
import { getUILanguage } from '../lib/i18n';
import {
    listProjects,
    upsertProject,
    renameProject,
    deleteProject,
    clearAll,
    storageUsage,
    MAX_ITEMS,
    type Project,
} from './projectStore';

const isJa = getUILanguage().toLowerCase().startsWith('ja');
const tt = (ja: string, en: string) => (isJa ? ja : en);

const CHROME_EXT_URL = 'https://chromewebstore.google.com/detail/lumoshot-screenshot-captu/omcbegppcmmeamdcighjhpeoogljniha?hl=ja';

const fmtMB = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)}MB`;

function makeSampleImage(): string {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 760;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.fillStyle = '#f3f6fb';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(15, 23, 42, 0.12)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 12;
    ctx.fillRect(96, 72, 1088, 616);
    ctx.shadowColor = 'transparent';

    ctx.fillStyle = '#111827';
    ctx.font = '700 36px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
    ctx.fillText('Project dashboard', 152, 156);
    ctx.fillStyle = '#64748b';
    ctx.font = '20px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
    ctx.fillText('Use Lumoshot to point out the exact UI changes you want.', 152, 196);

    const cards = [
        ['Review queue', '#4f46e5', '24 items need triage'],
        ['Conversion', '#059669', '7.8% this week'],
        ['Alerts', '#dc2626', '3 blocking issues'],
    ];
    cards.forEach(([title, color, body], index) => {
        const x = 152 + index * 324;
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(x, 254, 284, 150);
        ctx.fillStyle = color;
        ctx.fillRect(x, 254, 8, 150);
        ctx.fillStyle = '#0f172a';
        ctx.font = '700 22px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
        ctx.fillText(title, x + 28, 310);
        ctx.fillStyle = '#64748b';
        ctx.font = '18px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
        ctx.fillText(body, x + 28, 348);
    });

    ctx.fillStyle = '#eef2ff';
    ctx.fillRect(152, 462, 902, 86);
    ctx.fillStyle = '#3730a3';
    ctx.font = '700 22px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
    ctx.fillText('Annotate this sample: add an arrow, blur a card, or spotlight the alert.', 184, 516);
    return canvas.toDataURL('image/png');
}

export default function WebApp() {
    const [started, setStarted] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [projects, setProjects] = useState<Project[]>([]);
    const [usage, setUsage] = useState<{ usage: number; quota: number }>({ usage: 0, quota: 0 });
    const [saveStatus, setSaveStatus] = useState<string | null>(null);
    const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
    const [editingName, setEditingName] = useState('');
    const [isUnsupportedDevice, setIsUnsupportedDevice] = useState(false);

    const currentProjectId = useRef<number | null>(null);
    const currentProjectName = useRef<string | null>(null);
    const saveTimer = useRef<number | null>(null);

    const refreshGallery = useCallback(async () => {
        setProjects(await listProjects());
        setUsage(await storageUsage());
    }, []);

    useEffect(() => {
        if (!started) refreshGallery();
    }, [started, refreshGallery]);

    // Ask the browser to keep our storage (avoid silent eviction)
    useEffect(() => {
        navigator.storage?.persist?.()?.catch(() => {});
    }, []);

    useEffect(() => {
        const media = window.matchMedia('(pointer: coarse), (max-width: 820px)');
        const update = () => setIsUnsupportedDevice(media.matches);
        update();
        media.addEventListener?.('change', update);
        return () => media.removeEventListener?.('change', update);
    }, []);

    useEffect(() => {
        if (!started) return;
        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
        };
        const onPopState = () => {
            setStarted(false);
            refreshGallery();
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        window.addEventListener('popstate', onPopState);
        return () => {
            window.removeEventListener('beforeunload', onBeforeUnload);
            window.removeEventListener('popstate', onPopState);
        };
    }, [started, refreshGallery]);

    useEffect(() => {
        return () => {
            if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
        };
    }, []);

    const enterEditor = useCallback(() => {
        window.history.pushState({ lumoshot: 'editor' }, '', window.location.href);
        setStarted(true);
    }, []);

    // Cancel any pending autosave so a stale debounced write can't clobber the
    // next project we open.
    const cancelPendingSave = useCallback(() => {
        if (saveTimer.current !== null) {
            window.clearTimeout(saveTimer.current);
            saveTimer.current = null;
        }
    }, []);

    const begin = useCallback((dataUrl: string) => {
        cancelPendingSave();
        currentProjectId.current = null; // new edit
        currentProjectName.current = null;
        setSaveStatus(null);
        setWebInitialImage(dataUrl);
        enterEditor();
    }, [enterEditor, cancelPendingSave]);

    const reopen = useCallback((p: Project) => {
        cancelPendingSave();
        currentProjectId.current = p.id ?? null;
        currentProjectName.current = p.name;
        setSaveStatus(tt('保存済み', 'Saved'));
        setWebInitialState(p.state);
        enterEditor();
    }, [enterEditor, cancelPendingSave]);

    const handleFile = useCallback((file: File | null | undefined) => {
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (e) => begin(e.target?.result as string);
        reader.readAsDataURL(file);
    }, [begin]);

    // Paste image from clipboard while on the landing screen
    useEffect(() => {
        if (started) return;
        const onPaste = (e: ClipboardEvent) => {
            const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
            if (item) handleFile(item.getAsFile());
        };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
    }, [started, handleFile]);

    const captureScreen = useCallback(async () => {
        setError(null);
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const track = stream.getVideoTracks()[0];
            const video = document.createElement('video');
            video.srcObject = stream;
            await video.play();
            await new Promise((r) => setTimeout(r, 250));
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d')?.drawImage(video, 0, 0);
            const dataUrl = canvas.toDataURL('image/png');
            track.stop();
            video.srcObject = null;
            begin(dataUrl);
        } catch (err) {
            console.error('getDisplayMedia failed', err);
            setError(tt('画面のキャプチャがキャンセル/失敗しました。', 'Screen capture was cancelled or failed.'));
        }
    }, [begin]);

    const startSample = useCallback(() => {
        begin(makeSampleImage());
    }, [begin]);

    // Debounced autosave of the editor snapshot
    const handleSnapshot = useCallback((state: string, thumbnail: string) => {
        if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
        setSaveStatus(tt('保存中...', 'Saving...'));
        saveTimer.current = window.setTimeout(async () => {
            try {
                const id = await upsertProject(currentProjectId.current, state, thumbnail);
                currentProjectId.current = id;
                setSaveStatus(tt('保存済み', 'Saved'));
            } catch (err) {
                console.warn('autosave failed', err);
                setSaveStatus(tt('自動保存に失敗しました', 'Autosave failed'));
            }
        }, 800);
    }, []);

    const goHome = useCallback(() => {
        setStarted(false);
        refreshGallery();
    }, [refreshGallery]);

    const onDelete = useCallback(async (e: MouseEvent, id: number) => {
        e.stopPropagation();
        await deleteProject(id);
        refreshGallery();
    }, [refreshGallery]);

    const startRename = useCallback((e: MouseEvent, p: Project) => {
        e.stopPropagation();
        setEditingProjectId(p.id ?? null);
        setEditingName(p.name);
    }, []);

    const cancelRename = useCallback((e?: MouseEvent) => {
        e?.stopPropagation();
        setEditingProjectId(null);
        setEditingName('');
    }, []);

    const commitRename = useCallback(async (e?: MouseEvent | KeyboardEvent) => {
        e?.stopPropagation();
        if (editingProjectId == null) return;
        const name = editingName.trim();
        if (!name) return;
        await renameProject(editingProjectId, name);
        if (currentProjectId.current === editingProjectId) currentProjectName.current = name;
        setEditingProjectId(null);
        setEditingName('');
        refreshGallery();
    }, [editingName, editingProjectId, refreshGallery]);

    const onClearAll = useCallback(async () => {
        if (!window.confirm(tt('保存した編集をすべて削除しますか？', 'Delete all saved edits?'))) return;
        await clearAll();
        refreshGallery();
    }, [refreshGallery]);

    if (started) {
        return (
            <Editor
                onSnapshot={handleSnapshot}
                onGoHome={goHome}
                saveStatusLabel={saveStatus}
            />
        );
    }

    return (
        <div
            className={`web-landing ${isDragOver ? 'drag-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                handleFile(e.dataTransfer.files?.[0]);
            }}
        >
            <main className="web-landing-card">
                <h1 className="web-landing-title">Lumoshot</h1>
                <p className="web-landing-sub">
                    {tt('スクリーンショットに注釈をつけて、きれいに書き出す。',
                        'Annotate screenshots and export them cleanly.')}
                </p>

                {isUnsupportedDevice && (
                    <div className="web-desktop-only" role="status">
                        {tt('Lumoshot Web版はデスクトップブラウザ向けです。PCで開いてください。',
                            'Lumoshot for web is designed for desktop browsers. Please open it on a computer.')}
                    </div>
                )}

                <div className="web-landing-actions">
                    <button className="web-btn web-btn-primary" onClick={captureScreen}>
                        <Monitor size={18} /> {tt('画面をキャプチャ', 'Capture screen')}
                    </button>

                    <label className="web-btn">
                        <Upload size={18} /> {tt('画像をアップロード', 'Upload image')}
                        <input
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={(e) => handleFile(e.target.files?.[0])}
                        />
                    </label>
                    <button className="web-btn" onClick={startSample}>
                        <PlayCircle size={18} /> {tt('サンプルで試す', 'Try sample')}
                    </button>
                </div>

                <p className="web-landing-hint">
                    <ClipboardPaste size={14} />
                    {tt(' 画像を貼り付け（Ctrl/⌘+V）、またはここにドラッグ&ドロップ',
                        ' Paste an image (Ctrl/⌘+V) or drag & drop it here')}
                </p>

                {error && <p className="web-landing-error">{error}</p>}

                {projects.length > 0 && (
                    <div className="web-recent">
                        <div className="web-recent-head">
                            <span>{tt(`最近の編集（最大${MAX_ITEMS}件）`, `Recent edits (up to ${MAX_ITEMS})`)}</span>
                            <button className="web-recent-clear" onClick={onClearAll}>
                                {tt('すべて消去', 'Clear all')}
                            </button>
                        </div>
                        <div className="web-recent-grid">
                            {projects.map((p) => (
                                <div key={p.id} className="web-recent-item" onClick={() => reopen(p)} title={p.name} role="button" tabIndex={0}>
                                    <img src={p.thumbnail} alt={p.name} loading="lazy" />
                                    {editingProjectId === p.id ? (
                                        <span className="web-recent-rename" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                value={editingName}
                                                autoFocus
                                                onChange={(e) => setEditingName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') commitRename(e);
                                                    if (e.key === 'Escape') cancelRename();
                                                }}
                                            />
                                            <button onClick={commitRename} aria-label={tt('名前を保存', 'Save name')}><Check size={12} /></button>
                                            <button onClick={cancelRename} aria-label={tt('キャンセル', 'Cancel')}><X size={12} /></button>
                                        </span>
                                    ) : (
                                        <span className="web-recent-name">{p.name}</span>
                                    )}
                                    <span className="web-recent-actions">
                                        <button onClick={(e) => startRename(e, p)} aria-label={tt('名前を変更', 'Rename')}>
                                            <Pencil size={13} />
                                        </button>
                                        <button className="danger" onClick={(e) => onDelete(e, p.id!)} aria-label={tt('削除', 'Delete')}>
                                            <Trash2 size={13} />
                                        </button>
                                    </span>
                                </div>
                            ))}
                        </div>
                        {usage.usage > 0 && (
                            <p className="web-recent-usage">
                                {tt('保存容量', 'Storage')}: {fmtMB(usage.usage)}
                                {usage.quota ? ` / ${fmtMB(usage.quota)}` : ''}
                            </p>
                        )}
                    </div>
                )}

                <a className="web-landing-ext" href={CHROME_EXT_URL} target="_blank" rel="noreferrer">
                    <Puzzle size={18} />
                    <span>
                        {tt('Chrome拡張機能版なら、開いているページをワンクリックで直接キャプチャ',
                            'Get the Chrome extension to capture any page in one click')}
                    </span>
                </a>

                <p className="web-landing-privacy">
                    {tt('画像はあなたのブラウザ内だけで処理され、サーバーに送信されません。',
                        'Images are processed entirely in your browser — never uploaded.')}
                </p>
                <div className="web-landing-links">
                    <a href="guide.html" target="_blank" rel="noreferrer"><HelpCircle size={14} />{tt('使い方', 'Guide')}</a>
                    <a href="privacy.html" target="_blank" rel="noreferrer"><ShieldCheck size={14} />{tt('プライバシー', 'Privacy')}</a>
                    <a href={CHROME_EXT_URL} target="_blank" rel="noreferrer"><Puzzle size={14} />{tt('Chrome拡張機能', 'Chrome extension')}</a>
                    <a href="https://github.com/kenzotakizawa/Lumoshot" target="_blank" rel="noreferrer">{tt('GitHub', 'GitHub')}</a>
                </div>
            </main>
        </div>
    );
}
