console.log("Lumoshot background script loaded");

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === "OPEN_EDITOR") {
    const mode = message.mode || 'local';
    console.log(`Received OPEN_EDITOR. Creating tab in ${mode} mode...`);
    chrome.tabs.create({ url: `editor.html?mode=${mode}`, active: true });
  }

  if (message.type === "START_CAPTURE") {
    const mode = message.captureMode; // 'visible', 'selected', 'desktop'
    console.log(`Received START_CAPTURE with mode: ${mode}. Getting active tab...`);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab || !activeTab.id) {
        console.error("No active tab found.");
        return;
      }
      console.log("Active tab:", activeTab.id, activeTab.url);

      if (mode === 'desktop') {
        // Minimize the browser window so it doesn't appear in the capture
        chrome.windows.getCurrent((win) => {
          if (!win?.id) return;
          const originalState = win.state; // Remember original state to restore later

          const doMinimize = () => {
            chrome.windows.update(win.id!, { state: 'minimized' }, () => {
              // Wait for minimize animation to complete
              setTimeout(() => {
                chrome.desktopCapture.chooseDesktopMedia(
                  ["screen", "window"],
                  activeTab,
                  (streamId) => {
                    // Restore window to original state
                    chrome.windows.update(win.id!, {
                      state: originalState === 'fullscreen' ? 'fullscreen' : 'normal'
                    });

                    if (!streamId) {
                      console.log("Capture canceled or failed.");
                      return;
                    }
                    chrome.scripting.executeScript({
                      target: { tabId: activeTab.id! },
                      func: (id) => { (window as any).LUMOSHOT_STREAM_ID = id; },
                      args: [streamId]
                    }, () => {
                      chrome.scripting.executeScript({
                        target: { tabId: activeTab.id! },
                        files: ['capture.js']
                      });
                    });
                  }
                );
              }, 500);
            });
          };

          if (win.state === 'fullscreen') {
            // Can't go directly from fullscreen to minimized;
            // exit fullscreen first, then minimize after a delay
            chrome.windows.update(win.id, { state: 'normal' }, () => {
              setTimeout(doMinimize, 400);
            });
          } else {
            doMinimize();
          }
        });
      } else if (mode === 'visible') {
        // Capture visible tab directly
        chrome.tabs.captureVisibleTab(activeTab.windowId, { format: 'png' }, (dataUrl) => {
          if (chrome.runtime.lastError || !dataUrl) {
            console.error("Failed to capture visible tab:", chrome.runtime.lastError);
            return;
          }
          chrome.storage.local.set({ "capturedImage": dataUrl }, () => {
            chrome.tabs.create({ url: 'editor.html?mode=capture', active: true });
          });
        });
      } else if (mode === 'selected') {
        // Inject crop overlayUI
        chrome.scripting.executeScript({
          target: { tabId: activeTab.id! },
          files: ['cropOverlay.js']
        });
        // We wait for CROP_AREA_SELECTED message
      }
    });
  }

  // Handle callback from cropOverlay.ts
  if (message.type === "CROP_AREA_SELECTED") {
    const rect = message.rect;
    console.log("Crop area selected:", rect);

    const targetTab = sender.tab;
    if (!targetTab || !targetTab.windowId) return;

    // Small delay to ensure overlay is fully removed from DOM before capturing
    setTimeout(() => {
      chrome.tabs.captureVisibleTab(targetTab.windowId, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) {
          console.error("Failed to capture after crop:", chrome.runtime.lastError);
          return;
        }

        // We need to actually crop the image based on the rect.
        // We can do this in an Offscreen Document, or send it directly to the Editor
        // and let the Editor handle the initial crop.
        // To keep it simple, let's pass the rect to the Editor via storage along with the full image.
        chrome.storage.local.set({
          "capturedImage": dataUrl,
          "cropRect": rect
        }, () => {
          chrome.tabs.create({ url: 'editor.html?mode=crop', active: true });
        });
      });
    }, 100);
  }

  if (message.type === "CROP_CANCELED") {
    console.log("User canceled crop selection.");
  }

  // Existing callback from capture.js (for desktop mode)
  if (message.type === "CAPTURE_COMPLETE") {
    console.log("Desktop capture complete!");
    chrome.storage.local.set({ "capturedImage": message.dataUrl }, () => {
      chrome.tabs.create({ url: 'editor.html?mode=capture', active: true });
    });
  }

  if (message.type === "CAPTURE_ERROR") {
    console.error("Capture failed in content script:", message.error);
  }
});
