import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import EditorHost, { type EditorStart } from './EditorHost';
import { platform } from '@platform';
import './Editor.css';

// Extension editor page. Each capture opens its own tab; once the edit is
// saved as a project, the tab's URL carries ?project=<id> so reloading it
// reopens that project instead of re-importing the capture.
function ExtensionEditorApp() {
    const [start, setStart] = useState<EditorStart | null>(null);

    useEffect(() => {
        const id = Number(new URLSearchParams(window.location.search).get('project'));
        if (Number.isInteger(id) && id > 0) {
            setStart({ kind: 'project', id });
            return;
        }
        platform.getInitialImage().then((init) => setStart({ kind: 'image', init }));
    }, []);

    if (!start) return null;
    return (
        <EditorHost
            start={start}
            onProjectChange={(id) => {
                const url = new URL(window.location.href);
                if (id != null) {
                    url.searchParams.set('project', String(id));
                    url.searchParams.delete('mode');
                } else {
                    url.searchParams.delete('project');
                }
                window.history.replaceState(null, '', url);
            }}
        />
    );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
        <ExtensionEditorApp />
    </React.StrictMode>
);
