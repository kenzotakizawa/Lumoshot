import { useState, useCallback, useEffect, useRef, lazy, Suspense, type MouseEvent, type KeyboardEvent } from 'react';
import { Monitor, Upload, ClipboardPaste, Trash2, Pencil, Check, X, PlayCircle, HelpCircle, ShieldCheck, Puzzle, ScrollText } from 'lucide-react';
import '../editor/Editor.css';
import './web.css';

// Loaded on demand: the editor pulls in fabric.js (~200KB gz), which the
// landing screen never needs. Deferring it keeps the initial page light.
const EditorHost = lazy(() => import('../editor/EditorHost'));
import type { EditorStart } from '../editor/EditorHost';
import { getUILanguage } from '../lib/i18n';
import { assetsForProject, importedProjectName, isLumoshotFileName, lumoshotFileErrorMessage, readLumoshotFile } from '../lib/lumoshotFile';
import {
    listProjects,
    getProject,
    createProjectFromFile,
    renameProject,
    deleteProject,
    clearAll,
    storageUsage,
    MAX_ITEMS,
    type Project,
} from '../lib/projectStore';

const isJa = getUILanguage().toLowerCase().startsWith('ja');
const tt = (ja: string, en: string) => (isJa ? ja : en);

const CHROME_EXT_URL = 'https://chromewebstore.google.com/detail/lumoshot-screenshot-captu/omcbegppcmmeamdcighjhpeoogljniha?hl=ja';

const fmtBytes = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)}GB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

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
    // What the editor opens; the key remounts the host for each new start.
    const [editorStart, setEditorStart] = useState<{ key: number; start: EditorStart } | null>(null);
    const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
    const [editingName, setEditingName] = useState('');
    const [isUnsupportedDevice, setIsUnsupportedDevice] = useState(false);

    const startKey = useRef(0);

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

    // Back button / goHome: leave the editor (EditorHost saves what's pending
    // and warns before closing the tab with unsaved changes).
    useEffect(() => {
        if (!started) return;
        const onPopState = () => {
            setStarted(false);
            refreshGallery();
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, [started, refreshGallery]);

    const enterEditor = useCallback(() => {
        window.history.pushState({ lumoshot: 'editor' }, '', window.location.href);
        setStarted(true);
    }, []);

    const openEditor = useCallback((start: EditorStart) => {
        startKey.current += 1;
        setEditorStart({ key: startKey.current, start });
        enterEditor();
    }, [enterEditor]);

    const begin = useCallback((dataUrl: string) => {
        openEditor({ kind: 'image', init: { dataUrl, cropRect: null, mode: 'web' } });
    }, [openEditor]);

    const reopen = useCallback(async (p: Project) => {
        if (p.id != null) openEditor({ kind: 'project', id: p.id });
    }, [openEditor]);

    // Imports every project in a .lumoshot file into the gallery; a file with a
    // single project opens straight away.
    const importProjectFile = useCallback(async (file: File) => {
        setError(null);
        try {
            const data = await readLumoshotFile(file);
            const ids: number[] = [];
            for (const project of data.projects) {
                ids.push(await createProjectFromFile(importedProjectName(data, project, file.name), project.state, project.thumbnail, assetsForProject(data, project)));
            }
            await refreshGallery();
            if (ids.length === 1) {
                const project = await getProject(ids[0]);
                if (project) await reopen(project);
            }
        } catch (err) {
            console.warn('Failed to open project file', err);
            setError(lumoshotFileErrorMessage(err, isJa));
        }
    }, [refreshGallery, reopen]);

    const handleFile = useCallback((file: File | null | undefined) => {
        if (!file) return;
        if (isLumoshotFileName(file.name)) {
            importProjectFile(file);
            return;
        }
        if (!file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (e) => begin(e.target?.result as string);
        reader.readAsDataURL(file);
    }, [begin, importProjectFile]);

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

    const goHome = useCallback(() => {
        // Route through the same path as the browser Back button so the
        // history entry pushed by enterEditor() is consumed either way,
        // instead of leaving a stale "editor" entry that Back would later
        // land on with nothing left to do.
        window.history.back();
    }, []);

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
        setEditingProjectId(null);
        setEditingName('');
        refreshGallery();
    }, [editingName, editingProjectId, refreshGallery]);

    const onClearAll = useCallback(async () => {
        if (!window.confirm(tt('保存した編集をすべて削除しますか？', 'Delete all saved edits?'))) return;
        await clearAll();
        refreshGallery();
    }, [refreshGallery]);

    if (started && editorStart) {
        return (
            <Suspense fallback={<div className="web-editor-loading">{tt('読み込み中…', 'Loading…')}</div>}>
                <EditorHost key={editorStart.key} start={editorStart.start} onGoHome={goHome} />
            </Suspense>
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
                            accept="image/*,.lumoshot"
                            style={{ display: 'none' }}
                            onChange={(e) => handleFile(e.target.files?.[0])}
                        />
                    </label>
                    <button className="web-btn" onClick={startSample}>
                        <PlayCircle size={18} /> {tt('サンプルで試す', 'Try sample')}
                    </button>
                </div>

                <a className="web-landing-fullpage" href={CHROME_EXT_URL} target="_blank" rel="noreferrer">
                    <ScrollText size={14} />
                    {tt('縦に長いページを丸ごと撮る・操作を GIF で録画するなら、Chrome 拡張機能版を使えます →',
                        'Need a whole long page in one shot, or a GIF of your steps? Use the Chrome extension →')}
                </a>

                <p className="web-landing-hint">
                    <ClipboardPaste size={14} />
                    {tt(' 画像を貼り付け（Ctrl/⌘+V）、または画像や .lumoshot ファイルをここにドラッグ&ドロップ',
                        ' Paste an image (Ctrl/⌘+V), or drag & drop an image or a .lumoshot file here')}
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
                                {tt('保存容量', 'Storage')}: {fmtBytes(usage.usage)}
                                {usage.quota ? ` / ${fmtBytes(usage.quota)}` : ''}
                            </p>
                        )}
                    </div>
                )}

                <a className="web-landing-ext" href={CHROME_EXT_URL} target="_blank" rel="noreferrer">
                    <Puzzle size={20} className="web-landing-ext-icon" />
                    <span className="web-landing-ext-body">
                        <span className="web-landing-ext-title">
                            {tt('撮影機能つきの Chrome 拡張機能版もあります',
                                'A Chrome extension with screen capture is also available')}
                        </span>
                        <span className="web-landing-ext-desc">
                            {tt('このWeb版は「貼り付け・アップロード・画面共有」で画像を取り込んで編集します。Chrome拡張機能版なら、表示中のページ・縦に長いページ全体（スクロール）・全画面・範囲指定をワンクリックで直接スクリーンショット撮影でき、そのまま編集に進めます。',
                                'This web app edits images you paste, upload, or share via screen capture. The Chrome extension can take screenshots directly — the visible page, an entire scrolling page, the full screen, or a selected region — in one click, then jump straight to editing.')}
                        </span>
                        <span className="web-landing-ext-cta">
                            {tt('Chrome ウェブストアで見る →', 'View on the Chrome Web Store →')}
                        </span>
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
