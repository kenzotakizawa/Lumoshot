import type { CropRectLike, Platform } from './types';

// Chrome extension implementation: the captured image is handed over via
// chrome.storage.local by the background/capture scripts.
export const platform: Platform = {
    getInitialImage() {
        return new Promise((resolve) => {
            const params = new URLSearchParams(window.location.search);
            if (params.get('mode') === 'restore') {
                // A .lumoshot project opened from the popup.
                chrome.storage.local.get(['restoreProject'], (result) => {
                    const project = result.restoreProject as { state?: string; assets?: Record<string, string>; name?: string } | undefined;
                    if (!project?.state) {
                        resolve(null);
                        return;
                    }
                    resolve({ dataUrl: '', cropRect: null, mode: 'restore', restoreState: project.state, restoreAssets: project.assets, projectName: project.name });
                });
                return;
            }
            const mode = (params.get('mode') || 'capture') as 'capture' | 'crop';
            chrome.storage.local.get(['capturedImage', 'cropRect'], (result) => {
                const dataUrl = result.capturedImage as string;
                if (!dataUrl) {
                    resolve(null);
                    return;
                }
                resolve({ dataUrl, cropRect: (result.cropRect as CropRectLike | undefined) ?? null, mode });
            });
        });
    },
};
