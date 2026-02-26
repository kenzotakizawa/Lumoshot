console.log("Lumoshot background script loaded");

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === "OPEN_EDITOR") {
    const mode = message.mode || 'capture'; // Default to capture
    console.log(`Received OPEN_EDITOR. Creating tab in ${mode} mode...`);
    chrome.tabs.create({ url: `editor.html?mode=${mode}`, active: true });
  }

  if (message.type === "REQUEST_CAPTURE") {
    console.log("Received REQUEST_CAPTURE from tab:", sender.tab?.id);

    const targetTab = sender.tab;
    if (!targetTab) {
      console.error("No sender tab for REQUEST_CAPTURE");
      return;
    }

    chrome.desktopCapture.chooseDesktopMedia(
      ["screen", "window"],
      targetTab,
      (streamId) => {
        console.log("Desktop capture callback. StreamId:", streamId);
        if (!streamId) {
          console.log("Capture canceled or failed (empty streamId).");
          // Notify editor of failure
          chrome.tabs.sendMessage(targetTab.id!, { type: 'onCaptureFailed' });
          return;
        }

        // Send streamId back to the requesting tab
        console.log("Sending streamId to tab:", targetTab.id);
        chrome.tabs.sendMessage(targetTab.id!, { type: 'onStreamId', streamId });
      }
    );
  }
});
