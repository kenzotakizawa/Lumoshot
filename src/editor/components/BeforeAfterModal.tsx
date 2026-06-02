import React, { useEffect, useRef, useState } from 'react';
import { Upload, Clipboard, Copy, X } from 'lucide-react';

interface BeforeAfterModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImageProvided: (dataUrl: string) => void;
    currentImageDataUrl?: string;
}

const BeforeAfterModal: React.FC<BeforeAfterModalProps> = ({
    isOpen, onClose, onImageProvided, currentImageDataUrl
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [clipboardError, setClipboardError] = useState(false);

    const processFile = (file: File) => {
        if (!file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            if (dataUrl) onImageProvided(dataUrl);
        };
        reader.readAsDataURL(file);
    };

    const handleClipboard = async () => {
        setClipboardError(false);
        try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
                for (const type of item.types) {
                    if (type.startsWith('image/')) {
                        const blob = await item.getType(type);
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            const dataUrl = e.target?.result as string;
                            if (dataUrl) onImageProvided(dataUrl);
                        };
                        reader.readAsDataURL(blob);
                        return;
                    }
                }
            }
            setClipboardError(true);
        } catch {
            setClipboardError(true);
        }
    };

    useEffect(() => {
        if (!isOpen) return;
        const handlePaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const item of Array.from(items)) {
                if (item.type.startsWith('image/')) {
                    const blob = item.getAsFile();
                    if (blob) { processFile(blob); return; }
                }
            }
        };
        document.addEventListener('paste', handlePaste);
        return () => document.removeEventListener('paste', handlePaste);
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="ba-modal-overlay">
            <div className="ba-modal">
                <div className="ba-modal-header">
                    <h3>Add After Image</h3>
                    <button className="ba-modal-close" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                {/* Duplicate current image */}
                {currentImageDataUrl && (
                    <button
                        className="ba-duplicate-btn"
                        onClick={() => onImageProvided(currentImageDataUrl)}
                    >
                        <Copy size={16} />
                        現在の画像を複製して並べる
                    </button>
                )}

                <div className="ba-divider">
                    <span>または別の画像を追加</span>
                </div>

                <div
                    className={`ba-drop-zone ${isDragOver ? 'drag-over' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setIsDragOver(false);
                        const file = e.dataTransfer.files[0];
                        if (file) processFile(file);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <Upload size={28} />
                    <p>Click or drag &amp; drop</p>
                    <span>PNG / JPEG</span>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png, image/jpeg"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) processFile(file);
                            e.target.value = '';
                        }}
                    />
                </div>

                <button className="ba-clipboard-btn" onClick={handleClipboard}>
                    <Clipboard size={15} />
                    Paste from clipboard
                </button>
                {clipboardError && (
                    <p className="ba-clipboard-error">No image found in clipboard.</p>
                )}
                <p className="ba-hint">You can also press Ctrl+V / ⌘+V to paste</p>
            </div>
        </div>
    );
};

export default BeforeAfterModal;
