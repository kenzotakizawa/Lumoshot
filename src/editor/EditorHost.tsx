import { useCallback, useEffect, useRef, useState } from 'react';
import Editor, { type EditorController } from './Editor';
import ProjectsPanel from './components/ProjectsPanel';
import type { InitialImage } from '../platform/types';
import { getProject, getProjectAssets, listProjects, upsertProject } from '../lib/projectStore';
import { lastStepInState } from './utils/drawTools/stepNumber';
import { getUILanguage } from '../lib/i18n';

// Owns "which project is open" for both the web app and the extension:
// autosave into the shared project store, saving everything before leaving,
// and switching to another project by remounting a fresh Editor.

export type EditorStart =
    // A fresh capture/upload; becomes a new project on its first save.
    | { kind: 'image'; init: InitialImage | null }
    // A project already in the store.
    | { kind: 'project'; id: number };

interface EditorHostProps {
    start: EditorStart;
    onGoHome?: () => void;
    // The project now open (null until a fresh image is first saved).
    onProjectChange?: (id: number | null) => void;
}

interface Session {
    key: number;
    init: InitialImage | null;
    projectId: number | null;
    name: string | null;
}

interface PendingSave {
    state: string;
    thumbnail: string;
    assets: Record<string, string>;
}

const AUTOSAVE_DELAY_MS = 800;

const isJa = getUILanguage().toLowerCase().startsWith('ja');
const tt = (ja: string, en: string) => (isJa ? ja : en);
const LABEL_SAVING = tt('保存中...', 'Saving...');
const LABEL_SAVED = tt('保存済み', 'Saved');
const LABEL_FAILED = tt('自動保存に失敗しました', 'Autosave failed');

async function sessionForProject(id: number, key: number): Promise<Session | null> {
    const project = await getProject(id);
    if (!project) return null;
    const assets = await getProjectAssets(project);
    return {
        key,
        projectId: id,
        name: project.name,
        init: { dataUrl: '', cropRect: null, mode: 'restore', restoreState: project.state, restoreAssets: assets, projectName: project.name },
    };
}

export default function EditorHost({ start, onGoHome, onProjectChange }: EditorHostProps) {
    const [session, setSession] = useState<Session | null>(null);
    const [saveStatus, setSaveStatus] = useState<string | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [panelOpen, setPanelOpen] = useState(false);
    // Bumped after each save so the panel's thumbnails/order stay current.
    const [savedCount, setSavedCount] = useState(0);
    const saveStatusRef = useRef(saveStatus);
    saveStatusRef.current = saveStatus;
    // The screenshot edited just before this one (for continuing step numbers).
    const [stepContinuation, setStepContinuation] = useState<{ name: string; lastStep: number } | null>(null);

    const controller = useRef<EditorController | null>(null);
    const projectId = useRef<number | null>(null);
    const lastSavedState = useRef<string | null>(null);
    const pending = useRef<PendingSave | null>(null);
    const timer = useRef<number | null>(null);
    // Writes run one after another, so a slow first save (which creates the
    // project) can't race a later one into creating a duplicate.
    const saveChain = useRef<Promise<void>>(Promise.resolve());
    const onProjectChangeRef = useRef(onProjectChange);
    onProjectChangeRef.current = onProjectChange;

    const setProject = (id: number | null) => {
        if (projectId.current === id) return;
        projectId.current = id;
        onProjectChangeRef.current?.(id);
    };

    // Each time a session starts, look up the most recently edited *other*
    // project as the "previous screenshot".
    useEffect(() => {
        if (!session) return;
        let cancelled = false;
        listProjects().then((all) => {
            if (cancelled) return;
            const previous = all.find((p) => p.id !== session.projectId);
            setStepContinuation(previous ? { name: previous.name, lastStep: lastStepInState(previous.state) } : null);
        });
        return () => {
            cancelled = true;
        };
    }, [session]);

    // Open whatever we were asked to start with.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (start.kind === 'project') {
                const s = await sessionForProject(start.id, 1);
                if (cancelled) return;
                if (!s) {
                    setLoadError(tt('このプロジェクトは見つかりませんでした（削除された可能性があります）。', 'This project could not be found (it may have been deleted).'));
                    return;
                }
                projectId.current = start.id;
                lastSavedState.current = null;
                setSaveStatus(LABEL_SAVED);
                setSession(s);
            } else {
                projectId.current = null;
                setSaveStatus(null);
                setSession({ key: 1, init: start.init, projectId: null, name: start.init?.projectName ?? null });
            }
        })();
        return () => {
            cancelled = true;
        };
        // `start` is fixed for the lifetime of a host (remount to start over).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const write = useCallback((save: PendingSave) => {
        saveChain.current = saveChain.current.then(async () => {
            if (save.state === lastSavedState.current) return;
            setSaveStatus(LABEL_SAVING);
            try {
                const id = await upsertProject(projectId.current, save.state, save.thumbnail, save.assets);
                lastSavedState.current = save.state;
                setProject(id);
                setSaveStatus(LABEL_SAVED);
                setSavedCount((n) => n + 1);
            } catch (err) {
                console.warn('autosave failed', err);
                setSaveStatus(LABEL_FAILED);
            }
        });
        return saveChain.current;
    }, []);

    // Debounced autosave from the editor.
    const handleSnapshot = useCallback((state: string, thumbnail: string, assets: Record<string, string>) => {
        pending.current = { state, thumbnail, assets };
        setSaveStatus(LABEL_SAVING);
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
            timer.current = null;
            const save = pending.current;
            pending.current = null;
            if (save) write(save);
        }, AUTOSAVE_DELAY_MS);
    }, [write]);

    // Save everything now (no debounce): the latest canvas, not just the last
    // debounced snapshot. Used before leaving the editor or switching project.
    const flush = useCallback(async () => {
        if (timer.current !== null) {
            window.clearTimeout(timer.current);
            timer.current = null;
        }
        const now = controller.current?.snapshotNow() ?? pending.current;
        pending.current = null;
        if (now) await write(now);
        else await saveChain.current;
    }, [write]);

    // Switch to another saved project (from the projects panel).
    const openProject = useCallback(async (id: number) => {
        setPanelOpen(false);
        if (id === projectId.current) return;
        await flush();
        const s = await sessionForProject(id, (session?.key ?? 0) + 1);
        if (!s) return;
        lastSavedState.current = null;
        setProject(id);
        setSaveStatus(LABEL_SAVED);
        setSession(s);
    }, [flush, session?.key]);

    const goHome = useCallback(async () => {
        await flush();
        onGoHome?.();
    }, [flush, onGoHome]);

    // Warn before closing the tab only if something isn't saved yet, and try
    // to save when the tab is hidden (switching away, closing the window).
    useEffect(() => {
        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            if (!pending.current && saveStatusRef.current !== LABEL_SAVING) return;
            e.preventDefault();
            e.returnValue = '';
        };
        const onVisibility = () => {
            if (document.visibilityState === 'hidden') flush();
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            window.removeEventListener('beforeunload', onBeforeUnload);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [flush]);
    // Leaving without goHome (e.g. the browser Back button): write whatever
    // is still pending.
    useEffect(() => () => {
        if (timer.current !== null) window.clearTimeout(timer.current);
        if (pending.current) write(pending.current);
    }, [write]);

    if (loadError) return <div className="web-editor-loading">{loadError}</div>;
    if (!session) return <div className="web-editor-loading">{tt('読み込み中…', 'Loading…')}</div>;

    return (
        <Editor
            key={session.key}
            initial={session.init}
            controllerRef={controller}
            onSnapshot={handleSnapshot}
            onGoHome={onGoHome ? goHome : undefined}
            saveStatusLabel={saveStatus}
            projectName={session.name}
            onOpenProjects={() => setPanelOpen(true)}
            stepContinuation={stepContinuation}
            overlay={
                <ProjectsPanel
                    open={panelOpen}
                    currentId={projectId.current}
                    onClose={() => setPanelOpen(false)}
                    onOpenProject={openProject}
                    refreshToken={savedCount}
                />
            }
        />
    );
}
