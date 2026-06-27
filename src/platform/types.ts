// Shape of the region selected during a "crop" capture (extension only).
export interface CropRectLike {
    left: number;
    top: number;
    width: number;
    height: number;
    windowWidth: number;
    windowHeight: number;
}

export interface InitialImage {
    dataUrl: string;
    cropRect?: CropRectLike | null;
    mode: 'capture' | 'crop' | 'web';
    // When set (web only), the editor restores this saved snapshot instead of
    // loading a fresh background image.
    restoreState?: string;
}

// Things the editor needs from its host environment (extension vs web).
export interface Platform {
    // Returns the image the editor should open with, or null if none yet.
    getInitialImage(): Promise<InitialImage | null>;
}
