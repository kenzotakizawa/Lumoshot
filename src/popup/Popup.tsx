import React, { useRef, useState, useEffect } from 'react';
import {
    Monitor,
    AppWindow,
    Crop,
    Image as ImageIcon,
    ClipboardPaste,
    Upload
} from 'lucide-react';
import './Popup.css';

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

    const handleAction = (actionType: string) => {
        chrome.runtime.sendMessage({ type: "START_CAPTURE", captureMode: actionType });
        window.close();
    };

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const dataUrl = e.target?.result as string;
                chrome.storage.local.set({ "capturedImage": dataUrl }, () => {
                    chrome.runtime.sendMessage({ type: "OPEN_EDITOR", mode: "capture" });
                    window.close();
                });
            };
            reader.readAsDataURL(file);
        }
    };

    const handleClipboardPaste = async () => {
        setErrorMsg(null);
        try {
            const clipboardItems = await navigator.clipboard.read();
            let foundImage = false;
            for (const item of clipboardItems) {
                const imageTypes = item.types.filter(type => type.startsWith('image/'));
                if (imageTypes.length > 0) {
                    foundImage = true;
                    try {
                        const blob = await item.getType(imageTypes[0]);
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            const dataUrl = e.target?.result as string;
                            chrome.storage.local.set({ "capturedImage": dataUrl }, () => {
                                chrome.runtime.sendMessage({ type: "OPEN_EDITOR", mode: "capture" });
                                window.close();
                            });
                        };
                        reader.readAsDataURL(blob);
                    } catch (blobErr: any) {
                        setErrorMsg("Failed to read image blob: " + blobErr.message);
                    }
                    return;
                }
            }
            if (!foundImage) {
                const allTypes = clipboardItems.flatMap(i => i.types).join(', ');
                setErrorMsg(`No image found. Clipboard contains: ${allTypes || 'Nothing'}`);
            }
        } catch (err: any) {
            console.error("Failed to read clipboard:", err);
            setErrorMsg(`Error: ${err.message || String(err)}`);
        }
    };

    const t = (key: string) => {
        if (overrideMessages && overrideMessages[key]) {
            return overrideMessages[key].message;
        }
        return chrome.i18n.getMessage(key) || key;
    };

    return (
        <div className="popup-container">
            <header className="popup-header">
                <img src="/icons/icon48.png" alt="Lumoshot Logo" className="logo" />
                <h1>Lumoshot</h1>
            </header>

            {errorMsg && (
                <div style={{ color: 'red', fontSize: '12px', marginBottom: '10px', padding: '8px', backgroundColor: '#ffe6e6', borderRadius: '4px' }}>
                    {errorMsg}
                </div>
            )}

            <div className="menu-group">
                <div className="menu-section">
                    <h2><AppWindow size={16} /> {t('popupSectionWindowCapture')}</h2>
                    <button className="menu-btn" onClick={() => handleAction('visible')}>
                        <AppWindow size={18} />
                        <div className="btn-text">
                            <span className="title">{t('popupVisiblePart')}</span>
                            <span className="desc">{t('popupVisiblePartDesc')}</span>
                        </div>
                    </button>
                    <button className="menu-btn" onClick={() => handleAction('selected')}>
                        <Crop size={18} />
                        <div className="btn-text">
                            <span className="title">{t('popupSelectedArea')}</span>
                            <span className="desc">{t('popupSelectedAreaDesc')}</span>
                        </div>
                    </button>
                </div>

                <div className="menu-section">
                    <h2><Monitor size={16} /> {t('popupSectionSystemCapture')}</h2>
                    <button className="menu-btn" onClick={() => handleAction('desktop')}>
                        <Monitor size={18} />
                        <div className="btn-text">
                            <span className="title">{t('popupEntireScreen')}</span>
                            <span className="desc">{t('popupEntireScreenDesc')}</span>
                        </div>
                    </button>
                </div>

                <div className="menu-section">
                    <h2><ImageIcon size={16} /> {t('popupSectionLocalImage')}</h2>
                    <button className="menu-btn" onClick={() => fileInputRef.current?.click()}>
                        <Upload size={18} />
                        <div className="btn-text">
                            <span className="title">{t('popupUploadFile')}</span>
                            <span className="desc">{t('popupUploadFileDesc')}</span>
                        </div>
                    </button>
                    <input
                        type="file"
                        accept="image/*"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        style={{ display: 'none' }}
                    />
                    <button className="menu-btn" onClick={handleClipboardPaste}>
                        <ClipboardPaste size={18} />
                        <div className="btn-text">
                            <span className="title">{t('popupPasteClipboard')}</span>
                            <span className="desc">{t('popupPasteClipboardDesc')}</span>
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Popup;
