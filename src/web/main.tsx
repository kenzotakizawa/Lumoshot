import React from 'react';
import ReactDOM from 'react-dom/client';
import WebApp from './WebApp';

// Right after a deploy, a page served from the old cache asks for the old
// editor chunk, which no longer exists. Reload once to get the new version
// (at most once a minute, so a real outage doesn't loop).
window.addEventListener('vite:preloadError', (event) => {
    const KEY = 'lumoshot.reloadedForUpdate';
    try {
        const last = Number(sessionStorage.getItem(KEY)) || 0;
        if (Date.now() - last < 60_000) return;
        sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
        // Without sessionStorage a reload loop can't be ruled out: leave it.
        return;
    }
    event.preventDefault();
    window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
        <WebApp />
    </React.StrictMode>
);
