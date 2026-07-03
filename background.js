// Tracks which tabs currently have a Glance preview open, and for which
// origin, so the header rewrite below only touches the response headers of
// the framed page itself (not unrelated third-party iframes on the same page).
const activePreviews = new Map(); // tabId -> origin

browser.runtime.onMessage.addListener((message, sender) => {
  const tabId = sender.tab && sender.tab.id;
  if (tabId === undefined) return;

  switch (message.type) {
    case "glance:preview-opened":
    case "glance:preview-navigated": {
      try {
        activePreviews.set(tabId, new URL(message.url).origin);
      } catch (err) {
        activePreviews.delete(tabId);
      }
      break;
    }
    case "glance:preview-closed": {
      activePreviews.delete(tabId);
      break;
    }
  }
});

browser.tabs.onRemoved.addListener((tabId) => {
  activePreviews.delete(tabId);
});

browser.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId === 0) {
    activePreviews.delete(details.tabId);
  }
});

// Many sites refuse to render inside an <iframe> via X-Frame-Options or a
// Content-Security-Policy frame-ancestors directive. Since the preview is an
// explicit, user-initiated action (Alt+click), strip those directives for
// same-origin sub-frame responses belonging to an open Glance preview.
const BLOCKED_HEADERS = new Set(["x-frame-options"]);

browser.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.type !== "sub_frame") return {};

    const origin = activePreviews.get(details.tabId);
    if (!origin) return {};

    try {
      if (new URL(details.url).origin !== origin) return {};
    } catch (err) {
      return {};
    }

    const responseHeaders = details.responseHeaders.filter((header) => {
      const name = header.name.toLowerCase();
      if (BLOCKED_HEADERS.has(name)) return false;
      if (name === "content-security-policy" && /frame-ancestors/i.test(header.value)) {
        header.value = header.value.replace(/frame-ancestors[^;]*;?/i, "");
      }
      return true;
    });

    return { responseHeaders };
  },
  { urls: ["<all_urls>"] },
  ["blocking", "responseHeaders"]
);
