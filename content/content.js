(() => {
  if (window.__glanceInjected) return;
  window.__glanceInjected = true;

  const ICONS = {
    expand:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>',
    bookmark:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>',
  };

  const CONTROLS_CSS = `
    .glance-bar {
      pointer-events: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      transform: translateY(-50%);
    }
    .glance-btn {
      appearance: none;
      border: none;
      background: rgba(30, 31, 36, 0.92);
      color: #c7c8cd;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      line-height: 1;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      transition: background-color 0.15s ease, color 0.15s ease, transform 0.08s ease;
    }
    .glance-btn svg {
      width: 16px;
      height: 16px;
      pointer-events: none;
    }
    .glance-btn:hover {
      background: rgba(60, 62, 70, 0.95);
      color: #ffffff;
    }
    .glance-btn:active {
      transform: scale(0.9);
    }
    .glance-btn-active {
      background: rgba(90, 150, 255, 0.45);
      color: #ffffff;
    }
    .glance-btn-active svg {
      fill: currentColor;
    }
    .glance-dialog-backdrop {
      position: fixed;
      inset: 0;
      pointer-events: auto;
    }
    .glance-dialog {
      pointer-events: auto;
      position: fixed;
      top: 50%;
      right: 54px;
      transform: translateY(-50%);
      width: 260px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 14px;
      background: #26272e;
      border-radius: 10px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
      font: 13px -apple-system, "Segoe UI", Roboto, sans-serif;
      color: #e6e6e9;
    }
    .glance-dialog h3 {
      margin: 0 0 2px;
      font-size: 13px;
      font-weight: 600;
      text-align: center;
    }
    .glance-dialog label {
      font-size: 11px;
      color: #a5a6ac;
    }
    .glance-dialog input,
    .glance-dialog select {
      width: 100%;
      box-sizing: border-box;
      background: #1e1f24;
      border: 1px solid #3a3b42;
      border-radius: 6px;
      padding: 6px 8px;
      color: #e6e6e9;
      font: inherit;
    }
    .glance-dialog input:focus,
    .glance-dialog select:focus {
      outline: none;
      border-color: #5a96ff;
    }
    .glance-dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 6px;
      margin-top: 4px;
    }
    .glance-dialog-btn {
      border: none;
      border-radius: 6px;
      padding: 6px 12px;
      font: inherit;
      cursor: pointer;
    }
    .glance-dialog-btn:hover {
      filter: brightness(1.15);
    }
    .glance-dialog-cancel {
      background: #3a3b42;
      color: #e6e6e9;
    }
    .glance-dialog-save {
      background: #5a96ff;
      color: #fff;
    }
  `;

  let enabled = true;
  browser.storage.local.get({ glanceEnabled: true }).then((res) => {
    enabled = res.glanceEnabled;
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.glanceEnabled) {
      enabled = changes.glanceEnabled.newValue;
    }
  });

  let isPreview = false; // set once the background tells us we're the preview tab
  let overlayEl = null; // dim layer shown on the origin page while a preview is open
  let overlayArmAt = 0; // ignore the mouseup/click that opened the preview
  let controlsRoot = null;
  let controlsShadow = null;
  let bookmarkBtn = null;
  let dialogEls = null; // { backdrop, dialog } while the bookmark dialog is open

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

      const anchor = event.target.closest && event.target.closest("a[href]");
      if (!isPreviewableLink(anchor)) return;

      event.preventDefault();
      event.stopPropagation();
      browser.runtime.sendMessage({
        type: "glance:open",
        url: anchor.href,
        screen: {
          availLeft: window.screen.availLeft || 0,
          availTop: window.screen.availTop || 0,
          availWidth: window.screen.availWidth,
          availHeight: window.screen.availHeight,
        },
      });
    },
    true
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape") return;
      if (dialogEls) {
        event.preventDefault();
        event.stopPropagation();
        closeBookmarkDialog();
        return;
      }
      if (!overlayEl && !isPreview) return;
      event.preventDefault();
      event.stopPropagation();
      browser.runtime.sendMessage({ type: "glance:close" });
    },
    true
  );

  // ---------- Origin page overlay

  function addOverlay() {
    if (overlayEl) return;
    overlayEl = document.createElement("div");
    overlayEl.id = "glance-origin-overlay";
    Object.assign(overlayEl.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483646",
      background: "rgba(0, 0, 0, 0.25)",
      backdropFilter: "blur(4px)",
      cursor: "pointer",
      pointerEvents: "none",
    });
    document.documentElement.appendChild(overlayEl);
    overlayArmAt = performance.now() + 800;
    setTimeout(() => {
      if (overlayEl) overlayEl.style.pointerEvents = "auto";
    }, 800);
    overlayEl.addEventListener("click", () => {
      if (performance.now() < overlayArmAt) return;
      browser.runtime.sendMessage({ type: "glance:close" });
    });
  }

  function removeOverlay() {
    if (!overlayEl) return;
    overlayEl.remove();
    overlayEl = null;
  }

  // ---------- Preview controls bar

  function makeButton(className, iconSvg, title, handler) {
    const btn = document.createElement("button");
    btn.className = `glance-btn ${className}`;
    btn.innerHTML = iconSvg;
    btn.title = title;
    btn.type = "button";
    btn.addEventListener("click", handler);
    return btn;
  }

  function showControls(bookmarked) {
    isPreview = true;
    if (controlsRoot && document.documentElement.contains(controlsRoot)) {
      setBookmarkState(bookmarked);
      return;
    }

    controlsRoot = document.createElement("div");
    Object.assign(controlsRoot.style, {
      all: "initial",
      position: "fixed",
      top: "50%",
      right: "8px",
      zIndex: "2147483647",
      pointerEvents: "none",
    });
    controlsShadow = controlsRoot.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = CONTROLS_CSS;

    const bar = document.createElement("div");
    bar.className = "glance-bar";

    bookmarkBtn = makeButton("glance-btn-bookmark", ICONS.bookmark, "Bookmark this page", onBookmarkClick);
    const expandBtn = makeButton("glance-btn-expand", ICONS.expand, "Open in new tab", () =>
      browser.runtime.sendMessage({ type: "glance:promote" })
    );

    bar.append(bookmarkBtn, expandBtn);
    controlsShadow.append(style, bar);
    document.documentElement.appendChild(controlsRoot);

    setBookmarkState(bookmarked);
  }

  function hideControls() {
    isPreview = false;
    closeBookmarkDialog();
    if (controlsRoot) {
      controlsRoot.remove();
      controlsRoot = null;
      controlsShadow = null;
      bookmarkBtn = null;
    }
  }

  function setBookmarkState(active) {
    if (bookmarkBtn) bookmarkBtn.classList.toggle("glance-btn-active", !!active);
  }

  // ---------- Bookmark dialog (Firefox's native star panel isn't reachable
  // from extensions, so this is a small replica: name + destination folder)

  async function onBookmarkClick() {
    if (dialogEls) {
      closeBookmarkDialog();
      return;
    }
    if (bookmarkBtn.classList.contains("glance-btn-active")) {
      const res = await browser.runtime.sendMessage({ type: "glance:bookmark-remove" });
      setBookmarkState(res && res.bookmarked);
      return;
    }
    const info = await browser.runtime.sendMessage({ type: "glance:bookmark-info" });
    if (!info) return;
    openBookmarkDialog(info);
  }

  function openBookmarkDialog(info) {
    const backdrop = document.createElement("div");
    backdrop.className = "glance-dialog-backdrop";
    backdrop.addEventListener("click", closeBookmarkDialog);

    const dialog = document.createElement("div");
    dialog.className = "glance-dialog";

    const heading = document.createElement("h3");
    heading.textContent = "Bookmark this page";

    const nameLabel = document.createElement("label");
    nameLabel.textContent = "Name";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = info.title;

    const folderLabel = document.createElement("label");
    folderLabel.textContent = "Folder";
    const folderSelect = document.createElement("select");
    for (const folder of info.folders) {
      const option = document.createElement("option");
      option.value = folder.id;
      option.textContent = `${"  ".repeat(folder.depth)}${folder.title}`;
      if (folder.id === info.defaultFolderId) option.selected = true;
      folderSelect.appendChild(option);
    }

    const actions = document.createElement("div");
    actions.className = "glance-dialog-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "glance-dialog-btn glance-dialog-cancel";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", closeBookmarkDialog);

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "glance-dialog-btn glance-dialog-save";
    saveBtn.textContent = "Save";
    const save = async () => {
      const res = await browser.runtime.sendMessage({
        type: "glance:bookmark-create",
        title: nameInput.value.trim(),
        parentId: folderSelect.value,
      });
      setBookmarkState(res && res.bookmarked);
      closeBookmarkDialog();
    };
    saveBtn.addEventListener("click", save);
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") save();
    });

    actions.append(cancelBtn, saveBtn);
    dialog.append(heading, nameLabel, nameInput, folderLabel, folderSelect, actions);
    controlsShadow.append(backdrop, dialog);
    dialogEls = { backdrop, dialog };
    nameInput.focus();
    nameInput.select();
  }

  function closeBookmarkDialog() {
    if (!dialogEls) return;
    dialogEls.backdrop.remove();
    dialogEls.dialog.remove();
    dialogEls = null;
  }

  // ---------- Messages from the background script

  browser.runtime.onMessage.addListener((message) => {
    switch (message.type) {
      case "glance:add-overlay":
        addOverlay();
        break;
      case "glance:remove-overlay":
        removeOverlay();
        break;
      case "glance:show-controls":
        showControls(message.bookmarked);
        break;
      case "glance:hide-controls":
        hideControls();
        break;
    }
  });
})();
