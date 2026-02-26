import React, { useEffect } from 'react';
import { X, MousePointer2, Square, ArrowUpRight, Minus, Type, MessageCircle, Scaling } from 'lucide-react';

interface HelpModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose} style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999
        }}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{
                backgroundColor: 'var(--bg-glass)',
                border: '1px solid var(--bg-glass-border)',
                borderRadius: '16px',
                padding: '24px',
                width: '560px',
                maxWidth: '90vw',
                maxHeight: '80vh',
                overflowY: 'auto',
                boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
                color: 'var(--text-primary)',
                position: 'relative'
            }}>
                <button
                    onClick={onClose}
                    className="tool-btn"
                    style={{
                        position: 'absolute',
                        top: '16px', right: '16px'
                    }}
                >
                    <X size={20} />
                </button>

                <h2 style={{ marginTop: 0, marginBottom: '24px', fontSize: '20px', fontWeight: 600 }}>
                    {chrome.i18n.getMessage("helpTitle")}
                </h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {/* General Section */}
                    <section>
                        <h3 style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {chrome.i18n.getMessage("helpGeneral")}
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'x 24px', columnGap: '24px', rowGap: '12px', fontSize: '14px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>{chrome.i18n.getMessage("actionUndo")}</span>
                                <kbd className="shortcut-key">Ctrl+Z</kbd>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>{chrome.i18n.getMessage("actionRedo")}</span>
                                <kbd className="shortcut-key">Ctrl+Y</kbd>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>{chrome.i18n.getMessage("actionCopy")} / {chrome.i18n.getMessage("actionPaste")}</span>
                                <div><kbd className="shortcut-key">Ctrl+C</kbd> / <kbd className="shortcut-key">Ctrl+V</kbd></div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>{chrome.i18n.getMessage("helpActionDuplicate")}</span>
                                <kbd className="shortcut-key">Ctrl+D</kbd>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>{chrome.i18n.getMessage("actionDelete")}</span>
                                <div><kbd className="shortcut-key">Del</kbd> / <kbd className="shortcut-key">Backspace</kbd></div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>{chrome.i18n.getMessage("helpActionZoom")}</span>
                                <div style={{ textAlign: 'right' }}><kbd className="shortcut-key" style={{ marginBottom: '4px' }}>{chrome.i18n.getMessage("helpActionZoomKey")}</kbd></div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gridColumn: '1 / -1' }}>
                                <span>{chrome.i18n.getMessage("helpActionPan")}</span>
                                <kbd className="shortcut-key">{chrome.i18n.getMessage("helpActionPanKey")}</kbd>
                            </div>
                        </div>
                    </section>

                    {/* Divider */}
                    <div style={{ height: '1px', backgroundColor: 'var(--border-color)' }} />

                    {/* Tools Section */}
                    <section>
                        <h3 style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {chrome.i18n.getMessage("helpTools")}
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'x 24px', columnGap: '24px', rowGap: '12px', fontSize: '14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <MousePointer2 size={16} color="var(--text-secondary)" />
                                <span style={{ flex: 1 }}>{chrome.i18n.getMessage("helpActionSelect")}</span>
                                <kbd className="shortcut-key">V</kbd>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Square size={16} color="var(--text-secondary)" />
                                <span style={{ flex: 1 }}>{chrome.i18n.getMessage("helpActionRect")}</span>
                                <kbd className="shortcut-key">R</kbd>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Square size={16} style={{ rx: 4, ry: 4 }} color="var(--text-secondary)" />
                                <span style={{ flex: 1 }}>{chrome.i18n.getMessage("toolRoundedRect")}</span>
                                <span className="shortcut-key" style={{ visibility: 'hidden' }}>-</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <ArrowUpRight size={16} color="var(--text-secondary)" />
                                <span style={{ flex: 1 }}>{chrome.i18n.getMessage("helpActionArrow")}</span>
                                <kbd className="shortcut-key">A</kbd>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Minus size={16} color="var(--text-secondary)" />
                                <span style={{ flex: 1 }}>{chrome.i18n.getMessage("helpActionLine")}</span>
                                <kbd className="shortcut-key">L</kbd>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Type size={16} color="var(--text-secondary)" />
                                <span style={{ flex: 1 }}>{chrome.i18n.getMessage("helpActionText")}</span>
                                <kbd className="shortcut-key">T</kbd>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <MessageCircle size={16} color="var(--text-secondary)" />
                                <span style={{ flex: 1 }}>{chrome.i18n.getMessage("helpActionBubble")}</span>
                                <kbd className="shortcut-key">B</kbd>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--text-secondary)', color: 'var(--bg-glass)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 'bold' }}>1</div>
                                <span style={{ flex: 1 }}>{chrome.i18n.getMessage("toolStepNumber")}</span>
                                <kbd className="shortcut-key">N</kbd>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-secondary)' }}><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>
                                <span style={{ flex: 1 }}>{chrome.i18n.getMessage("toolPen")}</span>
                                <kbd className="shortcut-key">P</kbd>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-secondary)' }}><path d="M9 11l-4 4-2.5-2.5L5 10l4 1z"></path><path d="M10 6l4 4 6-6-4-4-6 6z"></path><path d="M14 10l-4-4"></path></svg>
                                <span style={{ flex: 1 }}>{chrome.i18n.getMessage("toolHighlighter")}</span>
                                <kbd className="shortcut-key">H</kbd>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-secondary)' }}><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>
                                <span style={{ flex: 1 }}>{chrome.i18n.getMessage("toolSpotlightRect")}</span>
                                <kbd className="shortcut-key">S</kbd>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-secondary)' }}><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                                <span style={{ flex: 1 }}>{chrome.i18n.getMessage("toolBlurRect")}</span>
                                <kbd className="shortcut-key">U</kbd>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-secondary)' }}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle></svg>
                                <span style={{ flex: 1 }}>{chrome.i18n.getMessage("toolWebcam")}</span>
                                <span className="shortcut-key" style={{ visibility: 'hidden' }}>-</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-secondary)' }}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                                <span style={{ flex: 1 }}>{chrome.i18n.getMessage("toolInsertImage")}</span>
                                <span className="shortcut-key" style={{ visibility: 'hidden' }}>-</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-secondary)' }}><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
                                <span style={{ flex: 1 }}>{chrome.i18n.getMessage("toolCrop")}</span>
                                <kbd className="shortcut-key">C</kbd>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Scaling size={16} color="var(--text-secondary)" />
                                <span style={{ flex: 1 }}>{chrome.i18n.getMessage("toolResize")}</span>
                                <span className="shortcut-key" style={{ visibility: 'hidden' }}>-</span>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default HelpModal;
