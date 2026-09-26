// The 404 OS skin's switch: a class on <html> while anything on the page
// carries `data-os-skin` (the desktop, the blocking form, the gate screens).
// app/globals.css keys every skin rule on it.
//
// It used to be `:root:has([data-os-skin])` in the CSS. That selector made
// Chrome restyle the whole document on every DOM insertion or removal
// anywhere, because any of them might change what `:root` matches. Measured
// 2026-09-26 on production builds (headless Chromium, 1440x900, CDP
// Performance metrics, medians of 30 switches between three open windows):
// 26.6 ms of style recalculation a switch with `:has`, 9.0 ms with this
// class, 5.6 ms before the skin existed. A class changes only when the
// marker comes or goes.
//
// Plain module: the root layout (a server component) inlines the script.

/** The class on <html> that turns the skin on. */
export const OS_SKIN_CLASS = "os-skinned";

/**
 * Runs in <head>, before the body is parsed, and keeps the class in step with
 * the marker for the life of the page. A MutationObserver's callback runs at
 * the end of the task that changed the tree, before the browser paints, so a
 * hard load paints skinned from its first frame and a client-side navigation
 * never shows a frame in the wrong skin. `toggle` with a force that matches
 * the class already there changes nothing, so the usual mutation (a window's
 * content) costs one `querySelector` and no restyle. Only `data-os-skin`
 * attributes are watched, never the class itself, so it cannot loop.
 */
export const OS_SKIN_SCRIPT = `(function(){var d=document,h=d.documentElement;function s(){h.classList.toggle(${JSON.stringify(
  OS_SKIN_CLASS,
)},!!d.querySelector("[data-os-skin]"))}s();new MutationObserver(s).observe(h,{childList:true,subtree:true,attributes:true,attributeFilter:["data-os-skin"]})})();`;
