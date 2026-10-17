import React, { useCallback, useEffect, useState } from 'react';
import { Trash2, X } from 'lucide-react';
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
}

// Right-hand drawer listing recent projects; click one to switch to it.
const ProjectsPanel: React.FC<ProjectsPanelProps> = ({ open, currentId, onClose, onOpenProject, refreshToken }) => {
    const [projects, setProjects] = useState<Project[]>([]);

    const reload = useCallback(async () => {
        setProjects(await listProjects());
    }, []);

    useEffect(() => {
        if (open) reload();
    }, [open, refreshToken, reload]);

    // Projects saved from other tabs (e.g. a new capture) show up on focus.
    useEffect(() => {
        if (!open) return;
        const onFocus = () => reload();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('focus', onFocus);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('keydown', onKey);
        };
    }, [open, reload, onClose]);

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
                            return (
                                <li key={p.id}>
                                    <button
                                        className={`projects-panel-item ${isCurrent ? 'current' : ''}`}
                                        onClick={() => (isCurrent ? onClose() : onOpenProject(p.id!))}
                                        aria-current={isCurrent ? 'true' : undefined}
                                    >
                                        <img src={p.thumbnail} alt="" loading="lazy" />
                                        <span className="projects-panel-meta">
                                            <span className="projects-panel-name">{p.name}</span>
                                            <span className="projects-panel-time">
                                                {isCurrent ? tt('編集中', 'Editing') : relativeTime(p.updatedAt)}
                                            </span>
                                        </span>
                                    </button>
                                    {!isCurrent && (
                                        <button className="projects-panel-delete" onClick={(e) => remove(e, p)} aria-label={tt('削除', 'Delete')} title={tt('削除', 'Delete')}>
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </aside>
        </div>
    );
};

export default ProjectsPanel;
