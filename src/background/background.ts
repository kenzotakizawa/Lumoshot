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

      if (mode === 'desktop') {
        chrome.windows.getCurrent((win) => {
          if (!win?.id) return;
          const winId = win.id;

          // Bug Fix #2: preserve all states including 'maximized', not just fullscreen/normal
          const originalState = win.state as chrome.windows.WindowState;

          // Bug Fix #5: poll until actually minimized before showing picker
          const waitForState = (
            targetState: string,
            callback: () => void,
            maxWaitMs = 2000
          ) => {
            const started = Date.now();
            const check = () => {
              chrome.windows.get(winId, (w) => {
                if (w?.state === targetState || Date.now() - started > maxWaitMs) {
                  callback();
                } else {
                  setTimeout(check, 50);
                }
              });
            };
            check();
          };

          const doMinimize = () => {
            chrome.windows.update(winId, { state: 'minimized' as chrome.windows.WindowState }, () => {
              // Bug Fix #1 & #5: poll until minimized instead of fixed 500ms timeout
              waitForState('minimized', () => {
                chrome.desktopCapture.chooseDesktopMedia(
                  ["screen", "window"],
                  activeTab,
                  (streamId) => {
                    // Bug Fix #2: restore to original state (including 'maximized')
                    chrome.windows.update(winId, { state: originalState });

                    if (!streamId) {
                      console.log("Capture canceled or failed.");
                      return;
                    }

                    // Bug Fix #4: set stream ID then inject capture script
                    chrome.scripting.executeScript({
                      target: { tabId: activeTab.id! },
                      func: (id) => {
                        // Guard: clear any leftover stream ID from a previous run
                        (window as any).LUMOSHOT_STREAM_ID = id;
                        (window as any).LUMOSHOT_CAPTURE_RUNNING = false;
                      },
                      args: [streamId]
                    }, () => {
                      chrome.scripting.executeScript({
                        target: { tabId: activeTab.id! },
                        files: ['capture.js']
                      });
                    });
                  }
                );
              });
            });
          };

          if (win.state === 'fullscreen') {
            // Bug Fix #5: exit fullscreen then poll until 'normal' before minimizing
            chrome.windows.update(winId, { state: 'normal' as chrome.windows.WindowState }, () => {
              waitForState('normal', doMinimize);
            });
          } else {
            doMinimize();
          }
        });
      } else if (mode === 'visible') {
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
        chrome.scripting.executeScript({
          target: { tabId: activeTab.id! },
          files: ['cropOverlay.js']
        });
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
        chrome.storage.local.set({
          "capturedImage": dataUrl,
          "cropRect": rect  // already includes devicePixelRatio from cropOverlay.ts
        }, () => {
          chrome.tabs.create({ url: 'editor.html?mode=crop', active: true });
        });
      });
    }, 100);
  }

  if (message.type === "CROP_CANCELED") {
    console.log("User canceled crop selection.");
  }

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
