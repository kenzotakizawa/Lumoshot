console.log("Lumoshot crop overlay script loaded");

// This script will inject a full-screen semi-transparent div.
// The user can drag to define a rectangular area.
// On mouse up, it removes the overlay, coordinates are sent to background.

(function () {
    // Prevent multiple injections
    if (document.getElementById('lumoshot-crop-overlay')) return;

    let startX = 0, startY = 0, currentX = 0, currentY = 0;
    let isDragging = false;

    const overlay = document.createElement('div');
    overlay.id = 'lumoshot-crop-overlay';
    Object.assign(overlay.style, {
        position: 'fixed',
        top: '0', left: '0', width: '100vw', height: '100vh',
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: '2147483647', // Max z-index
        cursor: 'crosshair',
        display: 'flex'
    });

    const selectionBox = document.createElement('div');
    Object.assign(selectionBox.style, {
        position: 'absolute',
        border: '2px solid #0066ff',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        display: 'none', // Hidden initially
        pointerEvents: 'none' // Let clicks pass back to overlay
    });

    // Quick tip label
    const tip = document.createElement('div');
    tip.innerText = "Drag to select area. Press Esc to cancel.";
    Object.assign(tip.style, {
        position: 'absolute',
        top: '20px', left: '50%', transform: 'translateX(-50%)',
        color: 'white', backgroundColor: 'rgba(0,0,0,0.7)',
        padding: '8px 16px', borderRadius: '4px',
        fontFamily: 'sans-serif', fontSize: '14px',
        pointerEvents: 'none'
    });

    overlay.appendChild(selectionBox);
    overlay.appendChild(tip);
    document.body.appendChild(overlay);

    const updateBox = () => {
        const left = Math.min(startX, currentX);
        const top = Math.min(startY, currentY);
        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);

        Object.assign(selectionBox.style, {
            left: `${left}px`,
            top: `${top}px`,
            width: `${width}px`,
            height: `${height}px`,
            display: 'block'
        });
    };

    overlay.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        currentX = startX;
        currentY = startY;
        updateBox();
        tip.style.display = 'none'; // Hide tip once started
    });

    overlay.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        currentX = e.clientX;
        currentY = e.clientY;
        updateBox();
    });

    overlay.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;

        const rect = {
            left: Math.min(startX, currentX),
            top: Math.min(startY, currentY),
            width: Math.abs(currentX - startX),
            height: Math.abs(currentY - startY),
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio
        };

        // Remove UI immediately so it's not captured (if background captures *after* this)
        document.body.removeChild(overlay);

        // Send coordinates back to background
        if (rect.width > 10 && rect.height > 10) {
            chrome.runtime.sendMessage({
                type: "CROP_AREA_SELECTED",
                rect: rect
            });
        } else {
            // Too small, probably a mistake. Just cancel.
            chrome.runtime.sendMessage({ type: "CROP_CANCELED" });
        }
    });

    // Handle Esc key
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            document.body.removeChild(overlay);
            document.removeEventListener('keydown', handleKeyDown);
            chrome.runtime.sendMessage({ type: "CROP_CANCELED" });
        }
    };
    document.addEventListener('keydown', handleKeyDown);

})();
