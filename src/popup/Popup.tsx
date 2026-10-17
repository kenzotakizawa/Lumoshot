import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
    Monitor,
    AppWindow,
    Crop,
    ClipboardPaste,
    FolderOpen,
    ScrollText,
    HelpCircle,
    Globe,
} from 'lucide-react';
import './Popup.css';
import { assetsForProject, importedProjectName, isLumoshotFileName, lumoshotFileErrorMessage, readLumoshotFile } from '../lib/lumoshotFile';
import { createProjectFromFile, listProjects } from '../lib/projectStore';
import { listRecordings, recordingName } from '../gif/gifStore';

type CaptureMode = 'visible' | 'selected' | 'fullpage' | 'desktop';

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

interface RecentItem {
    key: string;
    url: string;
    name: string;
    thumbnail: string;
    updatedAt: number;
    isGif: boolean;
}
const isJa = () => chrome.i18n.getUILanguage().toLowerCase().startsWith('ja');

const Popup: React.FC = () => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [overrideMessages, setOverrideMessages] = useState<Record<string, { message: string }> | null>(null);
    // The newest saved edits and GIF recordings (the extension has no home
    // screen to list them).
    const [recent, setRecent] = useState<RecentItem[]>([]);

    useEffect(() => {
        Promise.all([listProjects().catch(() => []), listRecordings().catch(() => [])]).then(([projects, recordings]) => {
            const items: RecentItem[] = [
                ...projects.map((p) => ({ key: `p${p.id}`, url: `editor.html?project=${p.id}`, name: p.name, thumbnail: p.thumbnail, updatedAt: p.updatedAt, isGif: false })),
                ...recordings.map((r) => ({ key: `g${r.id}`, url: `gif.html?recording=${r.id}`, name: recordingName(r), thumbnail: r.thumbnail, updatedAt: r.updatedAt, isGif: true })),
            ];
            setRecent(items.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3));
        });
    }, []);

    const openUrl = useCallback((url: string) => {
        chrome.tabs.create({ url });
        window.close();
    }, []);
    const openProject = useCallback((id: number) => openUrl(`editor.html?project=${id}`), [openUrl]);

    // GIF: the stream id must be requested here, while the popup (the user's
    // click on the extension) is still open; the background does the rest.
    const startGif = useCallback(async () => {
        setErrorMsg(null);
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) throw new Error('No active tab');
            const streamId = await new Promise<string>((resolve, reject) => {
                chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (id) => {
                    if (chrome.runtime.lastError || !id) reject(new Error(chrome.runtime.lastError?.message || 'No stream id'));
                    else resolve(id);
                });
            });
            const res = await chrome.runtime.sendMessage({ type: 'GIF_START', streamId, tabId: tab.id });
            if (!res?.ok) throw new Error(res?.error || 'Could not start');
            window.close();
        } catch (err) {
            console.error('GIF recording failed to start', err);
            setErrorMsg(isJa()
                ? 'このページは録画できません（Chrome の設定ページやウェブストアなど）。別のページで試してください。'
                : "This page can't be recorded (e.g. Chrome settings or the Web Store). Try another page.");
        }
    }, []);

    useEffect(() => {
        // Allow forcing English UI via URL parameter like ?lang=en
        const params = new URLSearchParams(window.location.search);
        const forceLang = params.get('lang');
        if (forceLang) {
            fetch(`/_locales/${forceLang}/messages.json`)
                .then(res => res.json())
                .then(data => setOverrideMessages(data))
                .catch(err => console.error("Failed to load forced locale:", err));
        }
    }, []);

    const t = (key: string) => {
        if (overrideMessages && overrideMessages[key]) {
            return overrideMessages[key].message;
        }
        return chrome.i18n.getMessage(key) || key;
    };

    const handleAction = useCallback(async (mode: CaptureMode) => {
        try {
            await chrome.runtime.sendMessage({ type: "START_CAPTURE", captureMode: mode });
        } catch (e) {
            console.error(e);
        } finally {
            window.close();
        }
    }, []);

    // Hand an image to the editor (same path the capture modes use).
    const openImage = useCallback((blob: Blob) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            chrome.storage.local.set({ "capturedImage": e.target?.result as string }, async () => {
                try {
                    await chrome.runtime.sendMessage({ type: "OPEN_EDITOR", mode: "capture" });
                } catch (err) {
                    console.error(err);
                } finally {
                    window.close();
                }
            });
        };
        reader.readAsDataURL(blob);
    }, []);

    // Every project in a .lumoshot file goes into the recent edits; the editor
    // opens the first one (the others are in its projects panel).
    const openProjectFile = useCallback(async (file: File) => {
        setErrorMsg(null);
        try {
            const data = await readLumoshotFile(file);
            const ids: number[] = [];
            for (const project of data.projects) {
                ids.push(await createProjectFromFile(importedProjectName(data, project, file.name), project.state, project.thumbnail, assetsForProject(data, project)));
            }
            openProject(ids[0]);
        } catch (err) {
            console.error(err);
            setErrorMsg(lumoshotFileErrorMessage(err, isJa()));
        }
    }, [openProject]);

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (isLumoshotFileName(file.name)) {
            openProjectFile(file);
            return;
        }
        if (!file.type.startsWith('image/')) {
            setErrorMsg(isJa() ? '画像ファイルか .lumoshot ファイルを選んでください。' : 'Choose an image or a .lumoshot file.');
            return;
        }
        openImage(file);
    };

    const noImageMessage = () => (isJa()
        ? 'クリップボードに画像がありません。画像をコピーしてから貼り付けてください。'
        : 'There’s no image on the clipboard. Copy an image first, then paste.');

    const handleClipboardPaste = useCallback(async () => {
        setErrorMsg(null);
        try {
            for (const item of await navigator.clipboard.read()) {
                const type = item.types.find(tp => tp.startsWith('image/'));
                if (type) {
                    openImage(await item.getType(type));
                    return;
                }
            }
            setErrorMsg(noImageMessage());
        } catch (err) {
            console.error("Failed to read clipboard:", err);
            setErrorMsg(isJa() ? 'クリップボードを読み取れませんでした。' : 'Could not read the clipboard.');
        }
    }, [openImage]);

    // Keyboard: V / S / P / D capture, O opens a file, ⌘V / Ctrl+V pastes.
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            const map: Record<string, CaptureMode> = { v: 'visible', s: 'selected', p: 'fullpage', d: 'desktop' };
            const key = e.key.toLowerCase();
            if (map[key]) {
                e.preventDefault();
                handleAction(map[key]);
            } else if (key === 'g') {
                e.preventDefault();
                startGif();
            } else if (key === 'o') {
                e.preventDefault();
                fileInputRef.current?.click();
            }
        };
        // Pasting with the keyboard needs no clipboard permission prompt.
        const onPaste = (e: ClipboardEvent) => {
            const item = Array.from(e.clipboardData?.items ?? []).find(i => i.type.startsWith('image/'));
            const file = item?.getAsFile();
            e.preventDefault();
            if (file) openImage(file);
            else setErrorMsg(noImageMessage());
        };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('paste', onPaste);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('paste', onPaste);
        };
    }, [handleAction, openImage, startGif]);

    const tiles: Array<{ mode: CaptureMode; icon: React.ReactNode; label: string; desc: string; key: string }> = [
        { mode: 'selected', icon: <Crop size={20} />, label: t('popupSelectedArea'), desc: t('popupSelectedAreaDesc'), key: 'S' },
        { mode: 'fullpage', icon: <ScrollText size={20} />, label: t('popupFullPage'), desc: t('popupFullPageDesc'), key: 'P' },
        { mode: 'desktop', icon: <Monitor size={20} />, label: t('popupEntireScreen'), desc: t('popupEntireScreenDesc'), key: 'D' },
    ];

    return (
        <div className="popup">
            <header className="popup-header">
                <img src="/icons/icon48.png" alt="" className="popup-logo" />
                <h1>Lumoshot</h1>
                <a className="popup-icon-link" href="guide.html" target="_blank" rel="noreferrer" title={t('popupGuide')} aria-label={t('popupGuide')}>
                    <HelpCircle size={17} />
                </a>
            </header>

            <button className="popup-primary" onClick={() => handleAction('visible')}>
                <AppWindow size={22} className="popup-primary-icon" />
                <span className="popup-primary-text">
                    <span className="popup-primary-title">{t('popupVisiblePart')}</span>
                    <span className="popup-primary-desc">{t('popupVisiblePartDesc')}</span>
                </span>
                <kbd>V</kbd>
            </button>

            <div className="popup-tiles" role="group" aria-label={t('popupSectionMoreCapture')}>
                {tiles.map(tile => (
                    <button key={tile.mode} className="popup-tile" onClick={() => handleAction(tile.mode)} title={tile.desc}>
                        <span className="popup-tile-icon">{tile.icon}</span>
                        <span className="popup-tile-label">{tile.label}</span>
                        <span className="popup-tile-desc">{tile.desc}</span>
                        <kbd>{tile.key}</kbd>
                    </button>
                ))}
            </div>

            <button className="popup-gif" onClick={startGif} title={t('popupRecordGifDesc')}>
                <span className="popup-gif-icon" aria-hidden="true"><span /></span>
                <span className="popup-gif-text">
                    <span className="popup-gif-title">{t('popupRecordGif')}</span>
                    <span className="popup-gif-desc">{t('popupRecordGifDesc')}</span>
                </span>
                <kbd>G</kbd>
            </button>

            <div className="popup-section-label">{t('popupSectionLocalImage')}</div>
            <div className="popup-open-row">
                <button className="popup-open-btn" onClick={() => fileInputRef.current?.click()} title={t('popupUploadFileDesc')}>
                    <FolderOpen size={17} />
                    <span>{t('popupUploadFile')}</span>
                    <kbd>O</kbd>
                </button>
                <button className="popup-open-btn" onClick={handleClipboardPaste} title={t('popupPasteClipboardDesc')}>
                    <ClipboardPaste size={17} />
                    <span>{t('popupPasteClipboard')}</span>
                    <kbd>{isMac ? '⌘V' : 'Ctrl+V'}</kbd>
                </button>
                <input
                    type="file"
                    accept="image/*,.lumoshot"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                />
            </div>

            {recent.length > 0 && (
                <>
                    <div className="popup-section-label">{t('popupSectionRecent')}</div>
                    <div className="popup-recent">
                        {recent.map((item) => (
                            <button key={item.key} className="popup-recent-item" onClick={() => openUrl(item.url)} title={item.name}>
                                <span className="popup-recent-thumb">
                                    <img src={item.thumbnail} alt="" />
                                    {item.isGif && <span className="popup-recent-badge">GIF</span>}
                                </span>
                                <span className="popup-recent-name">{item.name}</span>
                            </button>
                        ))}
                    </div>
                </>
            )}

            {errorMsg && <div className="popup-error" role="alert">{errorMsg}</div>}

            <footer className="popup-footer">
                <a href="guide.html" target="_blank" rel="noreferrer"><HelpCircle size={13} />{t('popupGuide')}</a>
                <a href="https://lumoshot.takizawadetox-lab.com/" target="_blank" rel="noreferrer"><Globe size={13} />{t('popupWebApp')}</a>
            </footer>
        </div>
    );
};

export default Popup;
