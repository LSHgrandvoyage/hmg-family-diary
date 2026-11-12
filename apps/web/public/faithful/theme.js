/* Runs before CSS: appearance changes never rerender the diary or interrupt audio. */
(() => {
  const media = matchMedia("(prefers-color-scheme: dark)");
  const valid = (value) => ["auto", "light", "dark"].includes(value);
  let mode = "auto",
    nativeDark = null;
  try {
    if (window.NativeDiary?.theme) {
      const state = JSON.parse(window.NativeDiary.theme());
      mode = state.theme_mode;
      nativeDark = state.theme_dark;
    } else mode = localStorage.getItem("chagok-theme-v1") || "auto";
  } catch {}
  const isNative = !!window.NativeDiary;
  if (isNative) {
    if (!valid(mode)) mode = "auto";
  } else {
    if (!["light", "dark"].includes(mode)) mode = "light";
    try {
      localStorage.setItem("chagok-theme-v1", mode);
    } catch {}
  }
  function apply() {
    const dark =
      mode === "auto" ? (nativeDark ?? media.matches) : mode === "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", dark ? "#0b0d12" : "#f4f5f7");
    window.dispatchEvent(
      new CustomEvent("diarythemechange", { detail: { mode, dark } }),
    );
  }
  window.DiaryTheme = {
    get mode() {
      return mode;
    },
    set(value) {
      if (!valid(value) || (!isNative && value === "auto")) return;
      mode = value;
      try {
        localStorage.setItem("chagok-theme-v1", mode);
      } catch {}
      apply();
    },
    native(state) {
      if (!valid(state.theme_mode)) return;
      if (mode === state.theme_mode && nativeDark === !!state.theme_dark)
        return;
      mode = state.theme_mode;
      nativeDark = !!state.theme_dark;
      apply();
    },
  };
  media.addEventListener("change", apply);
  window.addEventListener("storage", (e) => {
    if (e.key === "chagok-theme-v1" && !window.NativeDiary) {
      mode = ["light", "dark"].includes(e.newValue) ? e.newValue : "light";
      apply();
    }
  });
  apply();
})();
