import React from 'react';
import ReactDOM from 'react-dom/client';
import GifApp from './GifApp';
import '../editor/Editor.css';
import './gif.css';

// GIF editor page (extension): gif.html?recording=<id>, opened when a
// recording stops.
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
        <GifApp />
    </React.StrictMode>
);
