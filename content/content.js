(() => {
  if (window.__glanceInjected) return;
  window.__glanceInjected = true;

  const MIN_WIDTH = 320;
  const MIN_HEIGHT = 200;

  const ICONS = {
    close:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
    expand:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>',
    split:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="18" rx="1.5"></rect><rect x="14" y="3" width="7" height="18" rx="1.5"></rect></svg>',
  };

  let enabled = true;
  browser.storage.local.get({ glanceEnabled: true }).then((res) => {
    enabled = res.glanceEnabled;
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.glanceEnabled) {
      enabled = changes.glanceEnabled.newValue;
    }
  });

  let hostEl = null;
  let shadow = null;
  let panelEl = null;
  let iframeEl = null;
  let titleEl = null;
  let splitButtonEl = null;
  let isSplit = false;
  let lastFloatingRect = null; // remembered geometry to restore after leaving split mode

  function isPreviewableLink(anchor) {
    if (!anchor || !anchor.href) return false;
    if (anchor.hasAttribute("download")) return false;
    try {
      const url = new URL(anchor.href);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch (err) {
      return false;
    }
  }

  document.addEventListener(
    "click",
    (event) => {
      if (!enabled) return;
      if (!event.altKey || event.button !== 0) return;
      if (hostEl && event.composedPath().includes(hostEl)) return;

      const anchor = event.target.closest && event.target.closest("a[href]");
      if (!isPreviewableLink(anchor)) return;

      event.preventDefault();
      event.stopPropagation();
      openPreview(anchor.href);
    },
    true
  );

  async function openPreview(url) {
    if (!panelEl) {
      await buildPanel();
      browser.runtime.sendMessage({ type: "glance:preview-opened", url });
    } else {
      browser.runtime.sendMessage({ type: "glance:preview-navigated", url });
    }
    iframeEl.src = url;
    titleEl.textContent = safeHostname(url);
    titleEl.title = url;
  }

  function safeHostname(url) {
    try {
      return new URL(url).hostname;
    } catch (err) {
      return url;
    }
  }

  async function buildPanel() {
    hostEl = document.createElement("div");
    hostEl.id = "glance-host";
    document.documentElement.appendChild(hostEl);
    shadow = hostEl.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = await fetch(browser.runtime.getURL("content/content.css")).then((r) =>
      r.text()
    );
    shadow.appendChild(style);

    panelEl = document.createElement("div");
    panelEl.className = "glance-panel";

    const header = document.createElement("div");
    header.className = "glance-header";

    titleEl = document.createElement("span");
    titleEl.className = "glance-title";

    const buttons = document.createElement("div");
    buttons.className = "glance-buttons";

    const closeBtn = makeButton("glance-btn-close", ICONS.close, "Close preview", closePreview);
    const expandBtn = makeButton("glance-btn-expand", ICONS.expand, "Open in new tab", expandToTab);
    splitButtonEl = makeButton("glance-btn-split", ICONS.split, "Toggle split view", toggleSplit);

    const divider = document.createElement("span");
    divider.className = "glance-divider";

    buttons.append(splitButtonEl, expandBtn, divider, closeBtn);
    header.append(titleEl, buttons);

    iframeEl = document.createElement("iframe");
    iframeEl.className = "glance-iframe";
    iframeEl.setAttribute("referrerpolicy", "no-referrer-when-downgrade");

    panelEl.append(header, iframeEl);

    const edges = ["top", "bottom", "left", "right", "top-left", "top-right", "bottom-left", "bottom-right"];
    for (const edge of edges) {
      const handle = document.createElement("div");
      handle.className = `glance-resize glance-resize-${edge}`;
      panelEl.appendChild(handle);
      makeResizable(handle, {
        x: edge.includes("left") ? "left" : edge.includes("right") ? "right" : null,
        y: edge.includes("top") ? "top" : edge.includes("bottom") ? "bottom" : null,
      });
    }

    shadow.appendChild(panelEl);

    setFloatingDefaults();
    makeDraggable(header);
  }

  function makeButton(className, iconSvg, title, handler) {
    const btn = document.createElement("button");
    btn.className = `glance-btn ${className}`;
    btn.innerHTML = iconSvg;
    btn.title = title;
    btn.type = "button";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      handler();
    });
    return btn;
  }

  const DEFAULT_MARGIN_PCT = 5; // space left on every side, as a % of the viewport

  function setFloatingDefaults() {
    panelEl.style.width = `${100 - DEFAULT_MARGIN_PCT * 2}%`;
    panelEl.style.height = `${100 - DEFAULT_MARGIN_PCT * 2}%`;
    panelEl.style.top = `${DEFAULT_MARGIN_PCT}%`;
    panelEl.style.left = `${DEFAULT_MARGIN_PCT}%`;
  }

  function closePreview() {
    if (!hostEl) return;
    if (isSplit) exitSplit();
    hostEl.remove();
    hostEl = null;
    shadow = null;
    panelEl = null;
    iframeEl = null;
    titleEl = null;
    splitButtonEl = null;
    lastFloatingRect = null;
    browser.runtime.sendMessage({ type: "glance:preview-closed" });
  }

  function expandToTab() {
    if (iframeEl && iframeEl.src) {
      window.open(iframeEl.src, "_blank");
    }
    closePreview();
  }

  function toggleSplit() {
    if (isSplit) {
      exitSplit();
    } else {
      enterSplit();
    }
  }

  function enterSplit() {
    lastFloatingRect = {
      width: panelEl.style.width,
      height: panelEl.style.height,
      top: panelEl.style.top,
      left: panelEl.style.left,
    };
    isSplit = true;
    panelEl.classList.add("glance-split");
    splitButtonEl.classList.add("glance-btn-active");
    panelEl.style.width = "50%";
    panelEl.style.height = "100%";
    panelEl.style.top = "0%";
    panelEl.style.left = "50%";
    document.documentElement.classList.add("glance-split-active");
    document.documentElement.style.marginRight = "50%";
  }

  function exitSplit() {
    isSplit = false;
    panelEl.classList.remove("glance-split");
    splitButtonEl.classList.remove("glance-btn-active");
    document.documentElement.classList.remove("glance-split-active");
    document.documentElement.style.marginRight = "";
    if (lastFloatingRect) {
      Object.assign(panelEl.style, lastFloatingRect);
    } else {
      setFloatingDefaults();
    }
  }

  function makeDraggable(handleEl) {
    handleEl.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".glance-btn")) return;
      if (isSplit) exitSplit();

      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = panelEl.offsetLeft;
      const startTop = panelEl.offsetTop;
      handleEl.setPointerCapture(e.pointerId);

      const onMove = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        panelEl.style.left = `${clamp(startLeft + dx, -panelEl.offsetWidth + 80, window.innerWidth - 80)}px`;
        panelEl.style.top = `${clamp(startTop + dy, 0, window.innerHeight - 40)}px`;
      };
      const onUp = () => {
        handleEl.removeEventListener("pointermove", onMove);
        handleEl.removeEventListener("pointerup", onUp);
      };
      handleEl.addEventListener("pointermove", onMove);
      handleEl.addEventListener("pointerup", onUp);
    });
  }

  function makeResizable(handleEl, { x = null, y = null }) {
    handleEl.addEventListener("pointerdown", (e) => {
      if (isSplit) exitSplit();

      const startX = e.clientX;
      const startY = e.clientY;
      const startWidth = panelEl.offsetWidth;
      const startHeight = panelEl.offsetHeight;
      const startLeft = panelEl.offsetLeft;
      const startTop = panelEl.offsetTop;
      handleEl.setPointerCapture(e.pointerId);

      const onMove = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        if (x === "left") {
          const newWidth = clamp(startWidth - dx, MIN_WIDTH, startLeft + startWidth);
          panelEl.style.width = `${newWidth}px`;
          panelEl.style.left = `${startLeft + startWidth - newWidth}px`;
        } else if (x === "right") {
          const newWidth = clamp(startWidth + dx, MIN_WIDTH, window.innerWidth - startLeft);
          panelEl.style.width = `${newWidth}px`;
        }

        if (y === "top") {
          const newHeight = clamp(startHeight - dy, MIN_HEIGHT, startTop + startHeight);
          panelEl.style.height = `${newHeight}px`;
          panelEl.style.top = `${startTop + startHeight - newHeight}px`;
        } else if (y === "bottom") {
          const newHeight = clamp(startHeight + dy, MIN_HEIGHT, window.innerHeight - startTop);
          panelEl.style.height = `${newHeight}px`;
        }
      };
      const onUp = () => {
        handleEl.removeEventListener("pointermove", onMove);
        handleEl.removeEventListener("pointerup", onUp);
      };
      handleEl.addEventListener("pointermove", onMove);
      handleEl.addEventListener("pointerup", onUp);
    });
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
})();
