console.log("Lumoshot background script loaded");

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: "guide.html", active: true });
  }
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === "OPEN_EDITOR") {
    const mode = message.mode || 'local';
    chrome.tabs.create({ url: `editor.html?mode=${mode}`, active: true });
  }

  if (message.type === "START_CAPTURE") {
    const mode = message.captureMode;
    console.log(`START_CAPTURE mode: ${mode}`);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab?.id) return;

      if (mode === 'desktop') {
        chrome.windows.getCurrent((win) => {
          if (!win?.id) return;
          const winId = win.id;
          const originalState = win.state as string;

          // ── Revised flow ──────────────────────────────────────────────
          // 1. Show picker FIRST (Chrome is visible so dialog is operable)
          // 2. After user selects a source → minimize Chrome
          // 3. Poll until actually minimized
          // 4. Inject capture.js (Chrome not visible → won't appear in shot)
          // 5. CAPTURE_COMPLETE → restore Chrome
          // ─────────────────────────────────────────────────────────────

          chrome.desktopCapture.chooseDesktopMedia(
            ["screen", "window"],
            activeTab,
            (streamId) => {
              if (!streamId) {
                console.log("Capture canceled by user.");
                return;
              }

              // Minimize Chrome so it doesn't appear in the screenshot
              const doMinimizeAndCapture = () => {
                chrome.windows.update(winId, { state: 'minimized' as chrome.windows.WindowState }, () => {
                  // Poll until minimized
                  const started = Date.now();
                  const waitMinimized = () => {
                    chrome.windows.get(winId, (w) => {
                      if (w?.state === 'minimized' || Date.now() - started > 2000) {
                        // Chrome is now hidden — safe to capture
                        chrome.storage.session.set({
                          pendingRestoreWindowId: winId,
                          pendingRestoreState: originalState
                        }, () => {
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
                      } else {
                        setTimeout(waitMinimized, 50);
                      }
                    });
                  };
                  waitMinimized();
                });
              };

              // If fullscreen, exit first then minimize
              if (win.state === 'fullscreen') {
                chrome.windows.update(winId, { state: 'normal' as chrome.windows.WindowState }, () => {
                  setTimeout(doMinimizeAndCapture, 300);
                });
              } else {
                doMinimizeAndCapture();
              }
            }
          );
        });

      } else if (mode === 'visible') {
        setTimeout(() => {
          chrome.tabs.captureVisibleTab(activeTab.windowId, { format: 'png' }, (dataUrl) => {
            if (chrome.runtime.lastError || !dataUrl) {
              console.error("Visible tab capture failed:", chrome.runtime.lastError);
              return;
            }
            chrome.storage.local.set({ "capturedImage": dataUrl }, () => {
              chrome.tabs.create({ url: 'editor.html?mode=capture', active: true });
            });
          });
        }, 300);

      } else if (mode === 'selected') {
        chrome.scripting.executeScript({
          target: { tabId: activeTab.id! },
          files: ['cropOverlay.js']
        });
      }
    });
  }

  if (message.type === "CROP_AREA_SELECTED") {
    const rect = message.rect;
    const targetTab = sender.tab;
    if (!targetTab?.windowId) return;

    setTimeout(() => {
      chrome.tabs.captureVisibleTab(targetTab.windowId, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) return;
        chrome.storage.local.set({ "capturedImage": dataUrl, "cropRect": rect }, () => {
          chrome.tabs.create({ url: 'editor.html?mode=crop', active: true });
        });
      });
    }, 100);
  }

  if (message.type === "CROP_CANCELED") {
    console.log("User canceled crop.");
  }

  // Restore Chrome window AFTER the frame has been captured
  if (message.type === "CAPTURE_COMPLETE") {
    chrome.storage.session.get(
      ["pendingRestoreWindowId", "pendingRestoreState"],
      (data) => {
        const winId = data.pendingRestoreWindowId as number | undefined;
        const state = (data.pendingRestoreState as string) || 'normal';
        if (winId) {
          chrome.windows.update(winId, { state: state as chrome.windows.WindowState });
          chrome.storage.session.remove(["pendingRestoreWindowId", "pendingRestoreState"]);
        }
        chrome.storage.local.set({ "capturedImage": message.dataUrl }, () => {
          chrome.tabs.create({ url: 'editor.html?mode=capture', active: true });
        });
      }
    );
  }

  if (message.type === "CAPTURE_ERROR") {
    console.error("Capture error:", message.error);
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
