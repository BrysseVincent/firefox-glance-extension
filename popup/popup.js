const toggle = document.getElementById("enabled-toggle");

browser.storage.local.get({ glimpseEnabled: true }).then((res) => {
  toggle.checked = res.glimpseEnabled;
});

toggle.addEventListener("change", () => {
  browser.storage.local.set({ glimpseEnabled: toggle.checked });
});
