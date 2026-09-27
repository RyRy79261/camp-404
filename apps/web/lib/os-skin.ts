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
 * The theme attributes the desktop root carries (lib/os-themes.ts, issue
 * #290): the system theme and the two switches beside it. The script copies
 * them to <html> from the skinned element that has them, so the menus,
 * dialogs and toasts a window opens into <body> wear the theme, and "Bigger
 * text" can raise the root size every rem is measured from. Removed again
 * when no skinned element has them (a gate screen, a page with no desktop).
 */
export const OS_THEME_ATTRIBUTES = [
  "data-os-theme",
  "data-os-text",
  "data-os-effects",
] as const;

/**
 * Runs in <head>, before the body is parsed, and keeps the class (and the
 * theme attributes) in step with the marker for the life of the page. A
 * MutationObserver's callback runs at the end of the task that changed the
 * tree, before the browser paints, so a hard load paints skinned from its
 * first frame and a client-side navigation never shows a frame in the wrong
 * skin. `toggle` with a force that matches the class already there changes
 * nothing, and an attribute is written only when it differs, so the usual
 * mutation (a window's content) costs two `querySelector`s and no restyle.
 * Only the marker and the theme attributes are watched, never the class; the
 * copy on <html> matches what it copies, so writing it cannot loop.
 */
export const OS_SKIN_SCRIPT = `(function(){var d=document,h=d.documentElement,A=${JSON.stringify(
  OS_THEME_ATTRIBUTES,
)};function s(){h.classList.toggle(${JSON.stringify(
  OS_SKIN_CLASS,
)},!!d.querySelector("[data-os-skin]"));var t=d.querySelector("[data-os-skin][data-os-theme]");for(var i=0;i<A.length;i++){var a=A[i],v=t?t.getAttribute(a):null;if(v!==h.getAttribute(a)){if(v===null)h.removeAttribute(a);else h.setAttribute(a,v)}}}s();new MutationObserver(s).observe(h,{childList:true,subtree:true,attributes:true,attributeFilter:["data-os-skin"].concat(A)})})();`;
