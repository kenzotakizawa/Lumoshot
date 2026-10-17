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

type CaptureMode = 'visible' | 'selected' | 'fullpage' | 'desktop';

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const isJa = () => chrome.i18n.getUILanguage().toLowerCase().startsWith('ja');

const Popup: React.FC = () => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [overrideMessages, setOverrideMessages] = useState<Record<string, { message: string }> | null>(null);

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

    // A .lumoshot project file opens in the editor as an editable project (the
    // first one, if the file holds several).
    const openProjectFile = useCallback(async (file: File) => {
        setErrorMsg(null);
        try {
            const data = await readLumoshotFile(file);
            const project = data.projects[0];
            await chrome.storage.local.set({
                restoreProject: { state: project.state, assets: assetsForProject(data, project), name: importedProjectName(data, project, file.name) },
            });
            await chrome.runtime.sendMessage({ type: "OPEN_EDITOR", mode: "restore" });
            window.close();
        } catch (err) {
            console.error(err);
            setErrorMsg(lumoshotFileErrorMessage(err, isJa()));
        }
    }, []);

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
    }, [handleAction, openImage]);

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

            {errorMsg && <div className="popup-error" role="alert">{errorMsg}</div>}

            <footer className="popup-footer">
                <a href="guide.html" target="_blank" rel="noreferrer"><HelpCircle size={13} />{t('popupGuide')}</a>
                <a href="https://lumoshot.takizawadetox-lab.com/" target="_blank" rel="noreferrer"><Globe size={13} />{t('popupWebApp')}</a>
            </footer>
        </div>
    );
};

export default Popup;
