// The last-seen copy (decision 3 A): a background window shows a frozen
// picture of its body as it last looked. Only the focused window mounts a
// page (a layout's `children` is Next's LayoutRouter, which renders the
// CURRENT segment from router context, so an old page's React tree cannot be
// kept and shown elsewhere). The picture is plain HTML: no React, no scripts,
// no handlers, no request, drawn in a CLOSED shadow root so Playwright,
// `getByLabel`, screen readers and Tab see one page only.
//
// Three rules the shell must keep (measured in the PR C spike):
//  - the host must carry `inert` and `aria-hidden` (mountLastSeen sets them);
//  - a closed shadow root can be attached ONCE per element, so a new copy
//    for a window needs a fresh host element (key the host by the copy);
//  - the document's own stylesheets are adopted into the root, and the
//    <html>/<body> classes are replayed on a wrapper, because selectors like
//    Tailwind's `dark:` (`:is(.dark *)`) cannot see across the shadow edge.

/** Total budget for every window's copy, in UTF-16 characters of HTML. */
export const LAST_SEEN_BUDGET_CHARS = 10 * 1024 * 1024; // ~20 MB in memory
/** A single body over this is not copied; the frame shows icon and name. */
export const LAST_SEEN_MAX_COPY_CHARS = 2 * 1024 * 1024;
/**
 * At most this many copies at once, whatever their size. Memory follows the
 * DOM a mounted copy builds (about 550 nodes for a roster), not its HTML, so
 * the character budget alone would allow hundreds (PR C spike).
 */
export const LAST_SEEN_MAX_COPIES = 16;

/** Put `data-os-private` on an element to blank it in every copy. */
export const PRIVATE_ATTR = "data-os-private";
/** What a blanked element says instead of its content. */
export const PRIVATE_PLACEHOLDER = "Hidden";

export interface LastSeenCopy {
  /** Sanitised HTML of the body, ready to parse into a shadow root. */
  html: string;
  /** `html.length`: what counts toward the budget. */
  chars: number;
  /** When it was taken (ms since epoch), for "Last seen hh:mm". */
  takenAt: number;
  /** The body's scroll offset at capture, replayed on mount. */
  scrollTop: number;
  /** Classes on <html> and <body> at capture (`dark`, the accent skin). */
  rootClasses: string;
}

// Elements that could run, load or play something. Removed outright.
const DROP =
  "script,noscript,iframe,object,embed,template,link,meta,audio,video";
// Attributes a copy must never keep: they would mark the copy as focusable
// or live, or they carry what the member typed in a hidden field.
const DROP_ATTRS = ["autofocus", "autoplay", "contenteditable", "tabindex"];

// Fields whose value is a secret, whatever their type.
const SECRET_FIELDS = [
  'input[type="password"]',
  'input[autocomplete~="current-password" i]',
  'input[autocomplete~="new-password" i]',
  'input[autocomplete~="one-time-code" i]',
].join(",");

function sanitise(root: Element): void {
  for (const el of Array.from(root.querySelectorAll(DROP))) el.remove();
  // Hidden inputs carry server-action ids and tokens, never anything to see.
  for (const el of Array.from(root.querySelectorAll('input[type="hidden"]'))) {
    el.remove();
  }
  for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.name) || DROP_ATTRS.includes(attr.name)) {
        el.removeAttribute(attr.name);
      } else if (
        (attr.name === "href" ||
          attr.name === "src" ||
          attr.name === "action") &&
        /^\s*javascript:/i.test(attr.value)
      ) {
        el.removeAttribute(attr.name);
      }
    }
  }
  // React keeps a controlled field's `value` attribute in step with what the
  // member typed, so a clone WOULD copy unsaved typing. A secret field is
  // always blanked, whatever its type: a password (a revealed one is
  // type="text") and a one-time code are known by their autocomplete. Other
  // fields keep their value (the copy is memory only, shows only this
  // member's own screen, and private fields are marked).
  for (const el of Array.from(root.querySelectorAll(SECRET_FIELDS))) {
    el.removeAttribute("value");
  }
  for (const el of Array.from(root.querySelectorAll(`[${PRIVATE_ATTR}]`))) {
    blank(el);
  }
}

function blank(el: Element): void {
  for (const attr of Array.from(el.attributes)) {
    if (
      attr.name !== "class" &&
      attr.name !== "style" &&
      attr.name !== PRIVATE_ATTR
    ) {
      el.removeAttribute(attr.name);
    }
  }
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "img" || tag === "select") {
    // Void or option-bearing: no text child to put the word in.
    el.replaceChildren();
    if (tag === "input") el.setAttribute("placeholder", PRIVATE_PLACEHOLDER);
    return;
  }
  // Text straight inside a table part or a list is moved OUT of it when the
  // copy is parsed again (the parser's foster-parenting), so the word needs
  // a child the parent allows. Measured on the roster: a bare "Hidden" in a
  // <tr> landed above the table.
  const doc = el.ownerDocument;
  const cell = (name: string, colspan = false) => {
    const c = doc.createElement(name);
    if (colspan) c.setAttribute("colspan", "1000");
    c.textContent = PRIVATE_PLACEHOLDER;
    return c;
  };
  const row = () => {
    const r = doc.createElement("tr");
    r.append(cell("td", true));
    return r;
  };
  if (tag === "tr") el.replaceChildren(cell("td", true));
  else if (
    tag === "table" ||
    tag === "tbody" ||
    tag === "thead" ||
    tag === "tfoot"
  ) {
    el.replaceChildren(row());
  } else if (tag === "ul" || tag === "ol" || tag === "menu")
    el.replaceChildren(cell("li"));
  else if (tag === "dl") el.replaceChildren(cell("dd"));
  else el.textContent = PRIVATE_PLACEHOLDER;
}

/**
 * Copy a window body. Cheap (one deep clone, one walk, one serialise) and
 * synchronous; call it before a switch the desktop starts and when the page
 * is idle after a commit. Returns null for a body over the per-copy limit.
 */
export function captureLastSeen(
  body: Element,
  now: number = Date.now(),
  maxChars: number = LAST_SEEN_MAX_COPY_CHARS,
): LastSeenCopy | null {
  const clone = body.cloneNode(true) as Element;
  sanitise(clone);
  const html = clone.outerHTML;
  if (html.length > maxChars) return null;
  const doc = body.ownerDocument;
  return {
    html,
    chars: html.length,
    takenAt: now,
    scrollTop: body.scrollTop,
    rootClasses:
      `${doc.documentElement.className} ${doc.body?.className ?? ""}`.trim(),
  };
}

// One set of constructed sheets shared by every copy, rebuilt only when the
// document's sheet list changes (a newly visited page can bring a CSS chunk).
let sheetCache: {
  key: string;
  sheets: CSSStyleSheet[];
  links: string[];
} | null = null;

function sheetKey(doc: Document): string {
  return Array.from(doc.styleSheets)
    .map(
      (s) =>
        s.href ??
        `inline:${(s.ownerNode as Element | null)?.textContent?.length ?? 0}`,
    )
    .join("|");
}

function documentSheets(doc: Document): {
  sheets: CSSStyleSheet[];
  links: string[];
} {
  const key = sheetKey(doc);
  if (sheetCache?.key === key) return sheetCache;
  const sheets: CSSStyleSheet[] = [];
  const links: string[] = [];
  const Ctor = doc.defaultView?.CSSStyleSheet;
  for (const s of Array.from(doc.styleSheets)) {
    if (s.disabled) continue;
    let text: string;
    try {
      text = Array.from(s.cssRules, (r) => r.cssText).join("\n");
    } catch {
      // A cross-origin sheet hides its rules; link to it instead.
      if (s.href) links.push(s.href);
      continue;
    }
    if (!Ctor) continue;
    const sheet = new Ctor();
    if (s.media.mediaText) sheet.media.appendMedium(s.media.mediaText);
    sheet.replaceSync(text);
    sheets.push(sheet);
  }
  sheetCache = { key, sheets, links };
  return sheetCache;
}

let frozen: CSSStyleSheet | null = null;

function frozenSheet(doc: Document): CSSStyleSheet {
  if (frozen) return frozen;
  const Ctor = doc.defaultView?.CSSStyleSheet ?? CSSStyleSheet;
  frozen = new Ctor();
  frozen.replaceSync(
    "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}",
  );
  return frozen;
}

/**
 * Draw a copy into `host`: a closed shadow root holding the document's
 * sheets and the copied HTML, the host made inert and hidden from assistive
 * tech. `host` must be a fresh element (attachShadow runs once per element).
 */
export function mountLastSeen(host: HTMLElement, copy: LastSeenCopy): void {
  host.setAttribute("inert", "");
  host.setAttribute("aria-hidden", "true");
  const root = host.attachShadow({ mode: "closed" });
  const doc = host.ownerDocument;
  const { sheets, links } = documentSheets(doc);
  // Entry animations (`animate-in fade-in`) would replay on every mount and
  // a spinner would keep spinning: a copy is a still picture.
  root.adoptedStyleSheets = [...sheets, frozenSheet(doc)];
  const wrap = doc.createElement("div");
  // Replays `dark` and the accent skin for selectors that look up the tree;
  // the fixed box keeps the copy's layout inside the frame.
  wrap.className = copy.rootClasses;
  // A flex column, so a copied window body (`flex-1 min-h-0`) keeps its own
  // height and scroll offset instead of growing to its content.
  wrap.setAttribute(
    "style",
    "display:flex;flex-direction:column;height:100%;overflow:hidden;pointer-events:none;user-select:none",
  );
  const template = doc.createElement("template");
  template.innerHTML = copy.html;
  wrap.append(template.content);
  for (const href of links) {
    const link = doc.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    root.append(link);
  }
  root.append(wrap);
  // The copied body is its own scroll box (as the window body is); put it
  // back where the member left it. Needs `host` in the document.
  const body = wrap.firstElementChild;
  if (body && copy.scrollTop > 0) body.scrollTop = copy.scrollTop;
}

/**
 * "Last seen 14:02." In `timeZone` when given (the app passes the clock its
 * taskbar shows, so the two never disagree), else the device's own clock.
 */
export function lastSeenLabel(takenAt: number, timeZone?: string): string {
  const d = new Date(takenAt);
  if (timeZone) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone,
    }).formatToParts(d);
    const part = (type: string) =>
      parts.find((p) => p.type === type)?.value ?? "00";
    return `Last seen ${part("hour")}:${part("minute")}.`;
  }
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `Last seen ${hh}:${mm}.`;
}

/**
 * Every window's copy, memory only, under one budget. `put` makes a window
 * the most recent; when the total goes over, the least recently put or
 * touched copies are dropped (the window stays open and falls back to icon
 * and name). `clear` is for sign-out, a user change and a manifest change.
 */
export class LastSeenStore {
  private copies = new Map<string, LastSeenCopy>();
  private total = 0;

  constructor(
    private readonly budget: number = LAST_SEEN_BUDGET_CHARS,
    private readonly maxCopies: number = LAST_SEEN_MAX_COPIES,
  ) {}

  get(key: string): LastSeenCopy | undefined {
    return this.copies.get(key);
  }

  get totalChars(): number {
    return this.total;
  }

  /** Stores a copy; returns the keys evicted to make room (or to stay under the count). */
  put(key: string, copy: LastSeenCopy): string[] {
    this.drop(key);
    if (copy.chars > this.budget) return [];
    this.copies.set(key, copy);
    this.total += copy.chars;
    const evicted: string[] = [];
    for (const [k, c] of this.copies) {
      if (this.total <= this.budget && this.copies.size <= this.maxCopies) {
        break;
      }
      this.copies.delete(k);
      this.total -= c.chars;
      evicted.push(k);
    }
    return evicted;
  }

  /** Marks a window as recently used without replacing its copy. */
  touch(key: string): void {
    const copy = this.copies.get(key);
    if (!copy) return;
    this.copies.delete(key);
    this.copies.set(key, copy);
  }

  drop(key: string): void {
    const copy = this.copies.get(key);
    if (!copy) return;
    this.copies.delete(key);
    this.total -= copy.chars;
  }

  /** Keeps only the given window keys (for `pruneTo`). */
  keepOnly(keys: Iterable<string>): void {
    const keep = new Set(keys);
    for (const k of Array.from(this.copies.keys()))
      if (!keep.has(k)) this.drop(k);
  }

  clear(): void {
    this.copies.clear();
    this.total = 0;
  }
}
