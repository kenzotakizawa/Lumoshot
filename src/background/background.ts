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
          const originalState = win.state as string;

          // Poll until window reaches targetState (avoids fixed-delay race conditions)
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
              waitForState('minimized', () => {
                chrome.desktopCapture.chooseDesktopMedia(
                  ["screen", "window"],
                  activeTab,
                  (streamId) => {
                    if (!streamId) {
                      // User canceled — restore window immediately
                      console.log("Capture canceled.");
                      chrome.windows.update(winId, {
                        state: originalState as chrome.windows.WindowState
                      });
                      return;
                    }

                    // ── Plan A: store restore info in session storage ─────────
                    // Window stays minimized until CAPTURE_COMPLETE confirms
                    // the frame has been grabbed (so Chrome doesn't appear in screenshot)
                    chrome.storage.session.set({
                      pendingRestoreWindowId: winId,
                      pendingRestoreState: originalState
                    }, () => {
                      // Inject stream ID, then inject capture script
                      chrome.scripting.executeScript({
                        target: { tabId: activeTab.id! },
                        func: (id) => {
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
                    });
                  }
                );
              });
            });
          };

          if (win.state === 'fullscreen') {
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
    const targetTab = sender.tab;
    if (!targetTab || !targetTab.windowId) return;

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

  // ── Plan A: restore window AFTER frame is captured ───────────────────────
  // The window stayed minimized while capture.js grabbed the frame.
  // Now it's safe to restore — Chrome won't appear in the screenshot.
  if (message.type === "CAPTURE_COMPLETE") {
    console.log("Desktop capture complete! Restoring window...");

    chrome.storage.session.get(
      ["pendingRestoreWindowId", "pendingRestoreState"],
      (data) => {
        const winId = data.pendingRestoreWindowId as number | undefined;
        const state = (data.pendingRestoreState as string) || 'normal';

        if (winId) {
          chrome.windows.update(winId, {
            state: state as chrome.windows.WindowState
          }, () => {
            console.log(`Window ${winId} restored to '${state}'.`);
          });
          // Clean up session storage
          chrome.storage.session.remove(["pendingRestoreWindowId", "pendingRestoreState"]);
        }

        // Open editor regardless of whether restore worked
        chrome.storage.local.set({ "capturedImage": message.dataUrl }, () => {
          chrome.tabs.create({ url: 'editor.html?mode=capture', active: true });
        });
      }
    );
  }

  if (message.type === "CAPTURE_ERROR") {
    console.error("Capture failed in content script:", message.error);
    // Still restore the window if capture failed
    chrome.storage.session.get(
      ["pendingRestoreWindowId", "pendingRestoreState"],
      (data) => {
        const winId = data.pendingRestoreWindowId as number | undefined;
        const state = (data.pendingRestoreState as string) || 'normal';
        if (winId) {
          chrome.windows.update(winId, { state: state as chrome.windows.WindowState });
          chrome.storage.session.remove(["pendingRestoreWindowId", "pendingRestoreState"]);
        }
      }
    );
  }
});
