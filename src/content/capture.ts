console.log("Lumoshot capture script loaded");

// Be careful to avoid global scope pollution if injected multiple times
(async () => {
    // Bug Fix #4: guard against duplicate injection running capture twice
    if ((window as any).LUMOSHOT_CAPTURE_RUNNING) {
        console.warn("Lumoshot capture already in progress, skipping duplicate injection.");
        return;
    }
    (window as any).LUMOSHOT_CAPTURE_RUNNING = true;

    try {
        // We expect streamId to be passed via a mechanism. 
        // Chrome scripting API allows passing args, but standard execution context is isolated.
        // Let's rely on a variable we inject right before this script, OR 
        // simply listen for a message if we use `scripting.executeScript` to inject a listener.
        // ACTUALLY: executeScript can take `args`.

        // HOWEVER, to be simple, let's assume we pass streamId via `args`.
        // But `args` are passed to the function, not global.
        // So we need to wrap this in a function if we use `func`.
        // If we use `files`, we can't easily pass args unless we set a global var via another injection.

        // BETTER APPROACH:
        // The background script will inject this file. 
        // But this file needs the streamId.
        // Let's use `chrome.runtime.onMessage` to receive the streamId *after* injection?
        // OR: Background sets a global variable `window.LUMOSHOT_STREAM_ID` before injecting this file.

        // Let's go with: background injects a small code snippet setting the variable, THEN injects this file.
        const streamId = (window as any).LUMOSHOT_STREAM_ID;
        if (!streamId) {
            console.error("No streamId found in window.LUMOSHOT_STREAM_ID");
            return;
        }

        console.log("Capture script starting with streamId:", streamId);

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: streamId
                }
            } as any
        });

        // Create video element
        const video = document.createElement('video');
        video.srcObject = stream;
        video.style.position = 'fixed';
        video.style.top = '-9999px';
        document.body.appendChild(video);

        await new Promise<void>((resolve) => {
            video.onloadedmetadata = () => {
                video.play();
                // Wait for a frame
                setTimeout(() => resolve(), 500);
            };
        });

        // Capture frame
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Could not get 2d context");

        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');

        // Clean up
        stream.getTracks().forEach(t => t.stop());
        video.remove();
        canvas.remove();
        (window as any).LUMOSHOT_STREAM_ID = undefined; // Cleanup global

        console.log("Capture successful, sending data back...");

        // Send back to background
        chrome.runtime.sendMessage({
            type: "CAPTURE_COMPLETE",
            dataUrl: dataUrl,
            width: canvas.width,
            height: canvas.height
        });

    } catch (err) {
        console.error("Capture script error:", err);
        chrome.runtime.sendMessage({ type: "CAPTURE_ERROR", error: String(err) });
    }
})();
