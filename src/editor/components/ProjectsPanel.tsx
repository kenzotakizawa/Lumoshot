import React, { useCallback, useEffect, useState } from 'react';
import { Check, FileArchive, Images, Trash2, X } from 'lucide-react';
import { deleteProject, listProjects, MAX_ITEMS, type Project } from '../../lib/projectStore';
import { getUILanguage } from '../../lib/i18n';

const isJa = getUILanguage().toLowerCase().startsWith('ja');
const tt = (ja: string, en: string) => (isJa ? ja : en);

function relativeTime(ts: number): string {
    const diff = Math.max(0, Date.now() - ts);
    const min = Math.floor(diff / 60000);
    if (min < 1) return tt('たった今', 'just now');
    if (min < 60) return tt(`${min}分前`, `${min} min ago`);
    const h = Math.floor(min / 60);
    if (h < 24) return tt(`${h}時間前`, `${h} h ago`);
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

interface ProjectsPanelProps {
    open: boolean;
    currentId: number | null;
    onClose: () => void;
    onOpenProject: (id: number) => void;
    // Bumped by the host after saves so the list (thumbnails, order) refreshes.
    refreshToken: number;
    // Export the chosen projects as images (ZIP) or one .lumoshot file.
    onExport: (ids: number[], kind: 'images' | 'project-file') => Promise<void>;
    // "3/8" while an export runs, or an error message.
    exportStatus: string | null;
}

// Right-hand drawer listing recent projects; click one to switch to it.
const ProjectsPanel: React.FC<ProjectsPanelProps> = ({ open, currentId, onClose, onOpenProject, refreshToken, onExport, exportStatus }) => {
    const [projects, setProjects] = useState<Project[]>([]);
    // Selection mode: pick several projects to export together.
    const [selecting, setSelecting] = useState(false);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [busy, setBusy] = useState(false);

    const toggle = (id: number) => setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });

    const runExport = async (kind: 'images' | 'project-file') => {
        setBusy(true);
        try {
            await onExport([...selected], kind);
        } finally {
            setBusy(false);
        }
    };

    const reload = useCallback(async () => {
        setProjects(await listProjects());
    }, []);

    useEffect(() => {
        if (open) reload();
        else {
            setSelecting(false);
            setSelected(new Set());
        }
    }, [open, refreshToken, reload]);

    // Projects saved from other tabs (e.g. a new capture) show up on focus.
    useEffect(() => {
        if (!open) return;
        const onFocus = () => reload();
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (selecting) setSelecting(false);
            else onClose();
        };
        window.addEventListener('focus', onFocus);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('keydown', onKey);
        };
    }, [open, reload, onClose, selecting]);

    const remove = async (e: React.MouseEvent, p: Project) => {
        e.stopPropagation();
        if (!window.confirm(tt(`「${p.name}」を削除しますか？`, `Delete "${p.name}"?`))) return;
        await deleteProject(p.id!);
        reload();
    };

    if (!open) return null;

    return (
        <div className="projects-panel-backdrop" onMouseDown={onClose}>
            <aside className="projects-panel" onMouseDown={(e) => e.stopPropagation()} aria-label={tt('最近の編集', 'Recent edits')}>
                <div className="projects-panel-head">
                    <span className="projects-panel-title">{tt('最近の編集', 'Recent edits')}</span>
                    <span className="projects-panel-count">{projects.length}/{MAX_ITEMS}</span>
                    {projects.length > 0 && (
                        <button
                            className={`projects-panel-select ${selecting ? 'active' : ''}`}
                            onClick={() => {
                                setSelecting((v) => !v);
                                setSelected(new Set());
                            }}
                        >
                            {selecting ? tt('完了', 'Done') : tt('選択', 'Select')}
                        </button>
                    )}
                    <button className="projects-panel-close" onClick={onClose} aria-label={tt('閉じる', 'Close')}>
                        <X size={16} />
                    </button>
                </div>

                {projects.length === 0 ? (
                    <p className="projects-panel-empty">{tt('保存された編集はまだありません。', 'No saved edits yet.')}</p>
                ) : (
                    <ul className="projects-panel-list">
                        {projects.map((p) => {
                            const isCurrent = p.id === currentId;
                            const isSelected = selected.has(p.id!);
                            return (
                                <li key={p.id}>
                                    <button
                                        className={`projects-panel-item ${isCurrent ? 'current' : ''} ${isSelected ? 'selected' : ''}`}
                                        onClick={() => {
                                            if (selecting) toggle(p.id!);
                                            else if (isCurrent) onClose();
                                            else onOpenProject(p.id!);
                                        }}
                                        aria-current={isCurrent ? 'true' : undefined}
                                        aria-pressed={selecting ? isSelected : undefined}
                                    >
                                        {selecting && (
                                            <span className={`projects-panel-check ${isSelected ? 'on' : ''}`} aria-hidden="true">
                                                {isSelected && <Check size={12} />}
                                            </span>
                                        )}
                                        <img src={p.thumbnail} alt="" loading="lazy" />
                                        <span className="projects-panel-meta">
                                            <span className="projects-panel-name">{p.name}</span>
                                            <span className="projects-panel-time">
                                                {isCurrent ? tt('編集中', 'Editing') : relativeTime(p.updatedAt)}
                                            </span>
                                        </span>
                                    </button>
                                    {!isCurrent && !selecting && (
                                        <button className="projects-panel-delete" onClick={(e) => remove(e, p)} aria-label={tt('削除', 'Delete')} title={tt('削除', 'Delete')}>
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}

                {selecting && (
                    <div className="projects-panel-foot">
                        <div className="projects-panel-foot-row">
                            <span>{exportStatus ?? tt(`${selected.size}件を選択中`, `${selected.size} selected`)}</span>
                            <button
                                className="projects-panel-link"
                                onClick={() => setSelected(selected.size === projects.length ? new Set() : new Set(projects.map((p) => p.id!)))}
                            >
                                {selected.size === projects.length ? tt('選択を解除', 'Clear') : tt('すべて選択', 'Select all')}
                            </button>
                        </div>
                        <div className="projects-panel-foot-actions">
                            <button className="projects-panel-export primary" disabled={selected.size === 0 || busy} onClick={() => runExport('images')}>
                                <Images size={15} /> {tt('画像で保存', 'Save images')}
                            </button>
                            <button className="projects-panel-export" disabled={selected.size === 0 || busy} onClick={() => runExport('project-file')}>
                                <FileArchive size={15} /> {tt('編集データで保存', 'Save project file')}
                            </button>
                        </div>
                        <p className="projects-panel-hint">
                            {tt('画像は作った順に番号付きで保存します（2件以上はZIP）。形式とサイズは保存ボタン横の ▾ の設定に従います。',
                                'Images are numbered in the order they were made (a ZIP for 2 or more). Format and size follow the ▾ settings next to Save.')}
                        </p>
                    </div>
                )}
            </aside>
        </div>
    );
};

export default ProjectsPanel;
