"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  DEFAULT_GEOMETRY,
  cellOrigin,
  cellsInBox,
  defaultPlacement,
  dropTargetFor,
  fitPlacement,
  gridSize,
  moveSelection,
  neighbourIn,
  readingOrder,
  specKeys,
  type Cells,
  type DefaultSpec,
  type Direction,
  type GridGeometry,
  type GridSize,
} from "./icon-grid";

// The desktop's icons, moving like a real desktop's (owner, 2026-09-25;
// decision 14). Click selects; Ctrl, Cmd or Shift adds or takes away; a box
// drawn from the empty desktop selects every icon it touches; a drag moves the
// selection by whole cells and it is simply there on drop, no slide; a
// double-click or Enter opens. By keyboard the grid is one tab stop: arrows
// move focus, Shift or Ctrl with an arrow adds, Space selects, Esc clears,
// and Shift+F10 or the Menu key asks for the right-click menu.
//
// What the icons are, what opening one does, what the menu holds and where
// the layout is kept are all the app's. This draws them, keeps the
// selection, and reports moves (`onCellsChange`), drops into a member's
// folder (`onDropIntoFolder`) and menu requests (`onContextMenu`).

export type DesktopIconItem = {
  /** The item's key in the layout. */
  key: string;
  /** Its plain name ("Family tree"). */
  label: string;
  /** The picture, drawn with the classes the icon's state calls for. */
  icon: (className: string) => ReactNode;
  /** Its window is open: the icon lights up. */
  open?: boolean;
  /** Opening it is on its way (the page not there yet): it blinks. */
  pending?: boolean;
  /** A shortcut the member made: a small arrow, and ", shortcut" read out. */
  shortcut?: boolean;
  /** A team folder the member leads: a LEAD tag, and "you lead it" read out. */
  lead?: boolean;
  /** Items in a member's own folder, drawn on the folder and read out. */
  count?: number;
  /** New things (unread, pending): a chip, and "N new" read out. */
  badge?: number;
  /** A member's own folder: an icon dropped on it goes in. */
  acceptsDrop?: boolean;
  /** May go into a member's folder when dropped on one (a program or shortcut). */
  droppable?: boolean;
  /** Read out instead of the name built from the fields above. */
  ariaLabel?: string;
};

export type DesktopMenuRequest = {
  /** The icon the menu is for, or null for the empty desktop. */
  key: string | null;
  /** The selection when it opened (the icon's key alone, if it was not in it). */
  selected: string[];
  /** Where to open it, in px from the viewport's top left. */
  x: number;
  y: number;
};

type Props = {
  /** The grid's name, read out. "Desktop" unless given. */
  label?: string;
  items: readonly DesktopIconItem[];
  /** The default layout's order, by key (icon-grid's DefaultSpec). */
  spec: DefaultSpec;
  /** The member's saved cells; keys not in `items` are ignored. */
  cells: Cells;
  /** Icons moved: every placed key's new cell, to save. */
  onCellsChange: (cells: Cells) => void;
  onOpen: (key: string) => void;
  /** One droppable icon let go on a member's folder. */
  onDropIntoFolder?: (folderKey: string, key: string) => void;
  onContextMenu?: (request: DesktopMenuRequest) => void;
  geometry?: GridGeometry;
  /** A fixed grid size; measured from the element when not given. */
  size?: GridSize;
  className?: string;
};

/** How far a press must travel before it is a drag, in px. */
const DRAG_THRESHOLD = 5;

/** A contextmenu event this soon after a keyboard-opened menu is its echo. */
const KEY_MENU_ECHO_MS = 1000;

const ARROWS: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

/** What an icon is called, read out. */
export function iconName(item: DesktopIconItem): string {
  if (item.ariaLabel) return item.ariaLabel;
  const parts = [item.label];
  if (item.lead) parts.push("you lead it");
  if (item.shortcut) parts.push("shortcut");
  if (item.count !== undefined) {
    parts.push(`${item.count} ${item.count === 1 ? "item" : "items"}`);
  }
  if (item.badge) parts.push(`${item.badge} new`);
  return parts.join(", ");
}

/**
 * Follow one pointer on the window until it lets go, so a drag never loses
 * it, reporting moves at most once a frame.
 */
/** Two taps on one icon within this long open it (touch and pen). */
const DOUBLE_TAP_MS = 400;

function follow(
  e: PointerEvent,
  onMove: (dx: number, dy: number) => void,
  onUp: (dx: number, dy: number, moved: boolean) => void,
) {
  const x0 = e.clientX;
  const y0 = e.clientY;
  let moved = false;
  let frame = 0;
  let last: [number, number] = [0, 0];
  const flush = () => {
    frame = 0;
    onMove(last[0], last[1]);
  };
  const move = (ev: globalThis.PointerEvent) => {
    const dx = ev.clientX - x0;
    const dy = ev.clientY - y0;
    if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    moved = true;
    last = [dx, dy];
    if (!frame) frame = requestAnimationFrame(flush);
  };
  const up = (ev: globalThis.PointerEvent) => {
    // A move still waiting for its frame is reported first, so a quick
    // box-select never loses its last stretch.
    if (frame) {
      cancelAnimationFrame(frame);
      flush();
    }
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    onUp(ev.clientX - x0, ev.clientY - y0, moved);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
}

export function DesktopIcons({
  label = "Desktop",
  items,
  spec,
  cells,
  onCellsChange,
  onOpen,
  onDropIntoFolder,
  onContextMenu,
  geometry = DEFAULT_GEOMETRY,
  size: fixedSize,
  className = "absolute inset-0",
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<GridSize>({ cols: 10, rows: 6 });
  const size = fixedSize ?? measured;
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [drag, setDrag] = useState<{
    ids: ReadonlySet<string>;
    x: number;
    y: number;
  } | null>(null);
  const [band, setBand] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);
  const keyMenuAt = useRef(0);
  // A finger or a pen (a tablet at desktop width): the browser's dblclick is
  // not reliable for a double tap (iOS Safari), so two taps on one icon open
  // it here, and the dblclick that may follow is ignored.
  const lastTap = useRef<{ key: string; at: number } | null>(null);
  const tapOpenedAt = useRef(0);

  // The grid follows the desktop's size.
  useEffect(() => {
    const el = root.current;
    if (!el || fixedSize) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const next = gridSize(width, height, geometry);
      setMeasured((m) =>
        m.cols === next.cols && m.rows === next.rows ? m : next,
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fixedSize, geometry]);

  const byKey = useMemo(
    () => new Map(items.map((i) => [i.key, i] as const)),
    [items],
  );

  // The spec, kept to the icons there are, and every other icon (the
  // member's own items) as extras in the first free cells.
  const { keys, placement } = useMemo(() => {
    const known = (k: string) => byKey.has(k);
    const named = new Set(specKeys(spec));
    const fitted: DefaultSpec = {
      columns: spec.columns.map((col) => col.filter(known)),
      right: (spec.right ?? []).filter(known),
      extra: [
        ...(spec.extra ?? []).filter(known),
        ...items.map((i) => i.key).filter((k) => !named.has(k)),
      ],
    };
    const allKeys = specKeys(fitted);
    const defaults = defaultPlacement(fitted, size);
    return {
      keys: allKeys,
      placement: fitPlacement(cells, allKeys, size, defaults),
    };
  }, [byKey, items, spec, cells, size]);

  const order = useMemo(() => readingOrder(placement), [placement]);
  const selected = useMemo(
    () => new Set([...selection].filter((k) => placement[k])),
    [selection, placement],
  );
  const tabKey =
    focusKey && placement[focusKey] ? focusKey : (order[0] ?? null);

  const focusIcon = (key: string) => {
    setFocusKey(key);
    const icons = root.current?.querySelectorAll<HTMLElement>("[data-key]");
    [...(icons ?? [])]
      .find((el) => el.dataset.key === key)
      ?.focus({ preventScroll: true });
  };

  function iconDown(key: string, e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault(); // no text selection, no native drag
    const touch = e.pointerType === "touch" || e.pointerType === "pen";
    focusIcon(key);
    const additive = e.ctrlKey || e.metaKey || e.shiftKey;
    const wasSelected = selected.has(key);
    let group: ReadonlySet<string> = selected;
    if (!wasSelected) {
      group = additive ? new Set([...selected, key]) : new Set([key]);
      setSelection(group);
    }
    const ids = group;
    follow(
      e,
      (dx, dy) => setDrag({ ids, x: dx, y: dy }),
      (dx, dy, moved) => {
        setDrag(null);
        if (!moved && touch) {
          const now = Date.now();
          const before = lastTap.current;
          if (before && before.key === key && now - before.at < DOUBLE_TAP_MS) {
            lastTap.current = null;
            tapOpenedAt.current = now;
            onOpen(key);
            return;
          }
          lastTap.current = { key, at: now };
        }
        if (!moved) {
          // A plain click on one icon of a bigger selection keeps just it;
          // Ctrl or Shift on a selected icon takes it out.
          if (wasSelected) {
            setSelection(
              additive
                ? new Set([...selected].filter((k) => k !== key))
                : new Set([key]),
            );
          }
          return;
        }
        const dc = Math.round(dx / geometry.cell.w);
        const dr = Math.round(dy / geometry.cell.h);
        if (dc === 0 && dr === 0) return;
        const folder = dropTargetFor(
          placement,
          ids,
          dc,
          dr,
          size,
          (k) => !!byKey.get(k)?.acceptsDrop,
        );
        if (folder && byKey.get(key)?.droppable && onDropIntoFolder) {
          onDropIntoFolder(folder, key);
          return;
        }
        onCellsChange(moveSelection(placement, keys, ids, dc, dr, size));
      },
    );
  }

  /** A box drawn on the empty desktop selects every icon it touches. */
  function desktopDown(e: PointerEvent<HTMLDivElement>) {
    // A pointer press (every one on the desktop or an icon comes through
    // here) means the next contextmenu event is a real right-click, not the
    // echo of a keyboard-opened menu: without this, a right-click within a
    // second of Shift+F10 was swallowed.
    keyMenuAt.current = 0;
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x0 = e.clientX - rect.left;
    const y0 = e.clientY - rect.top;
    const additive = e.ctrlKey || e.metaKey || e.shiftKey;
    const base: ReadonlySet<string> = additive ? selected : new Set();
    follow(
      e,
      (dx, dy) => {
        const box = { x0, y0, x1: x0 + dx, y1: y0 + dy };
        setBand(box);
        setSelection(
          new Set([...base, ...cellsInBox(placement, box, geometry)]),
        );
      },
      (_dx, _dy, moved) => {
        setBand(null);
        if (!moved && !additive) setSelection(new Set());
      },
    );
  }

  function askMenu(key: string | null, x: number, y: number) {
    if (!onContextMenu) return;
    let sel = [...selected];
    if (key && !selected.has(key)) {
      sel = [key];
      setSelection(new Set(sel));
    }
    if (!key) {
      sel = [];
      setSelection(new Set());
    }
    onContextMenu({ key, selected: sel, x, y });
  }

  function onMenuEvent(key: string | null, e: MouseEvent) {
    if (key === null && e.target !== e.currentTarget) return;
    e.preventDefault();
    e.stopPropagation();
    // The browser's own contextmenu after Shift+F10 or the Menu key.
    if (Date.now() - keyMenuAt.current < KEY_MENU_ECHO_MS) return;
    if (key) focusIcon(key);
    askMenu(key, e.clientX, e.clientY);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-key]");
    const key = el?.dataset.key ?? null;
    const additive = e.ctrlKey || e.metaKey || e.shiftKey;

    if ((e.key === "F10" && e.shiftKey) || e.key === "ContextMenu") {
      e.preventDefault();
      keyMenuAt.current = Date.now();
      const r = (el ?? e.currentTarget).getBoundingClientRect();
      askMenu(
        key,
        r.left + Math.min(24, r.width / 2),
        r.top + Math.min(24, r.height / 2),
      );
      return;
    }
    if (e.key === "Escape") {
      if (selected.size > 0) {
        e.stopPropagation();
        setSelection(new Set());
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setSelection(new Set(order));
      return;
    }
    if (!key) {
      // The desktop itself has focus (no icons, or none placed): arrows go in.
      if (ARROWS[e.key] && order[0]) {
        e.preventDefault();
        focusIcon(order[0]);
      }
      return;
    }
    const dir = ARROWS[e.key];
    if (dir) {
      e.preventDefault();
      const next = neighbourIn(placement, key, dir);
      if (!next) return;
      focusIcon(next);
      if (additive) setSelection(new Set([...selected, key, next]));
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const next = e.key === "Home" ? order[0] : order.at(-1);
      if (next) focusIcon(next);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      onOpen(key);
      return;
    }
    if (e.key === " ") {
      e.preventDefault();
      if (additive) {
        const next = new Set(selected);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        setSelection(next);
      } else {
        setSelection(new Set([key]));
      }
    }
  }

  const { cell } = geometry;

  return (
    <div
      ref={root}
      role="listbox"
      aria-label={label}
      aria-multiselectable="true"
      aria-orientation="vertical"
      tabIndex={order.length === 0 ? 0 : -1}
      onPointerDown={desktopDown}
      onContextMenu={(e) => onMenuEvent(null, e)}
      onKeyDown={onKeyDown}
      data-os-icons
      className={`touch-none select-none outline-none ${className}`}
    >
      {keys.map((key) => {
        const item = byKey.get(key);
        const at = placement[key];
        if (!item || !at) return null;
        const o = cellOrigin(at, geometry);
        const isSelected = selected.has(key);
        const dragging = drag?.ids.has(key);
        const iconClass = `size-10 transition-colors group-hover:text-os-primary group-focus-visible:text-os-primary ${
          item.open
            ? "text-os-primary drop-shadow-[0_0_8px_var(--os-primary)]"
            : ""
        }`;
        return (
          <div
            key={key}
            role="option"
            data-key={key}
            aria-selected={isSelected}
            aria-label={iconName(item)}
            tabIndex={key === tabKey ? 0 : -1}
            onFocus={() => setFocusKey(key)}
            onPointerDown={(e) => iconDown(key, e)}
            onDoubleClick={() => {
              // Already opened by the double tap it echoes.
              if (Date.now() - tapOpenedAt.current < DOUBLE_TAP_MS) return;
              onOpen(key);
            }}
            onContextMenu={(e) => onMenuEvent(key, e)}
            style={{
              left: o.x,
              top: o.y,
              width: cell.w,
              height: cell.h,
              transform: dragging
                ? `translate(${drag!.x}px, ${drag!.y}px)`
                : undefined,
            }}
            className={`group absolute flex flex-col items-center gap-1.5 border border-dotted p-1 text-os-accent outline-none ${
              isSelected
                ? "border-os-primary/70 bg-os-primary/15"
                : "border-transparent"
            } ${dragging ? "z-10 cursor-grabbing opacity-75" : ""} ${
              item.pending ? "os-pending" : ""
            }`}
          >
            <span aria-hidden className="relative">
              {item.icon(iconClass)}
              {item.badge ? (
                <span className="absolute -right-2.5 -top-1.5 grid h-4 min-w-4 place-items-center bg-os-primary px-0.5 font-mono text-[10px] font-bold leading-none text-os-primary-fg">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              ) : null}
              {item.count !== undefined && (
                <span
                  data-count
                  className="absolute -bottom-1 -right-2 grid h-4 min-w-4 place-items-center border border-os-line bg-os-bg px-0.5 font-mono text-[10px] leading-none text-os-fg"
                >
                  {item.count}
                </span>
              )}
              {item.lead && (
                <span
                  data-lead
                  className="absolute -left-4 -top-1.5 border border-os-primary bg-os-bg px-0.5 font-pixel text-[10px] uppercase leading-tight text-os-fg"
                >
                  Lead
                </span>
              )}
              {item.shortcut && (
                <span
                  data-shortcut
                  className="absolute -bottom-1 -left-1.5 grid size-4 place-items-center border border-os-line bg-os-bg font-mono text-[11px] leading-none text-os-fg"
                >
                  ↗
                </span>
              )}
            </span>
            {/* The label is drawn by CSS from data-label, not written into
                the page: the icons are always on the desktop, so their names
                as text would collide with the same words in the page a
                window shows (a test's getByText, a find in page). The icon's
                name is its aria-label. */}
            <span
              aria-hidden
              data-label={item.label}
              className={`line-clamp-2 max-w-full px-1 py-0.5 text-center font-pixel text-[11px] uppercase leading-tight after:content-[attr(data-label)] ${
                item.open || isSelected
                  ? "bg-os-primary text-os-primary-fg"
                  : "bg-os-chrome/80 text-os-fg group-hover:bg-os-primary group-hover:text-os-primary-fg group-focus-visible:bg-os-primary group-focus-visible:text-os-primary-fg"
              }`}
            />
          </div>
        );
      })}
      {band && (
        <div
          aria-hidden
          data-band
          className="pointer-events-none absolute border border-dashed border-os-primary bg-os-primary/10"
          style={{
            left: Math.min(band.x0, band.x1),
            top: Math.min(band.y0, band.y1),
            width: Math.abs(band.x1 - band.x0),
            height: Math.abs(band.y1 - band.y0),
          }}
        />
      )}
    </div>
  );
}
