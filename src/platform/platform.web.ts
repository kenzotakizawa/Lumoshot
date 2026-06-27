import type { InitialImage, Platform } from './types';

// Web implementation: the web shell (landing screen) obtains an image via
// upload / paste / screen-capture, then sets it here before mounting the editor.
let pendingImage: InitialImage | null = null;

export function setWebInitialImage(dataUrl: string): void {
    pendingImage = { dataUrl, cropRect: null, mode: 'web' };
}

// Reopen a saved project: restore the full editor snapshot instead of a fresh image.
export function setWebInitialState(state: string): void {
    pendingImage = { dataUrl: '', cropRect: null, mode: 'web', restoreState: state };
}

export const platform: Platform = {
    async getInitialImage() {
        return pendingImage;
    },
};
