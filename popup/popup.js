const toggle = document.getElementById("enabled-toggle");

browser.storage.local.get({ glanceEnabled: true }).then((res) => {
  toggle.checked = res.glanceEnabled;
});

toggle.addEventListener("change", () => {
  browser.storage.local.set({ glanceEnabled: toggle.checked });
});
