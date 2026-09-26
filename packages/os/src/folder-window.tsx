import type { ReactNode } from "react";

export type FolderItem = {
  id: string;
  label: string;
  icon: (className: string) => ReactNode;
  /** Its window is open. */
  open?: boolean;
  /** New things in it (unread, pending): a chip, and "N new" read out. */
  badge?: number;
  /**
   * A small tag at the icon's top left (LEAD on a team the member leads, MINE
   * on one they are on): `text` is drawn, `spoken` is added to its name.
   */
  tag?: { text: string; spoken: string; strong?: boolean };
  onOpen: () => void;
};

type Props = {
  /** The folder's name, read out for its list. */
  label: string;
  items: readonly FolderItem[];
  /** Shown when the folder holds nothing. */
  empty?: ReactNode;
  /**
   * Pinned to the bottom of the window, in view however far the icons
   * scroll (the Teams folder's art piece).
   */
  footer?: ReactNode;
};

/**
 * A folder's window body (the approved prototype's): its programs as icons
 * on a grid, each opening its own window with one click. What a folder holds
 * is the app's to decide.
 */
export function FolderWindow({ label, items, empty, footer }: Props) {
  return (
    <div
      className={`relative flex min-h-full flex-col p-3 ${footer ? "pb-0" : "pb-8"}`}
    >
      {items.length === 0 ? (
        <div className="p-2 text-sm text-os-muted">{empty}</div>
      ) : (
        <ul
          aria-label={label}
          className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-x-1 gap-y-3"
        >
          {items.map((item) => (
            <li key={item.id}>
              <FolderIcon item={item} />
            </li>
          ))}
        </ul>
      )}
      {footer && (
        <div className="sticky bottom-0 -mx-3 mt-auto bg-os-panel px-3">
          {footer}
        </div>
      )}
    </div>
  );
}

function FolderIcon({ item }: { item: FolderItem }) {
  const extras = [
    item.tag?.spoken,
    item.badge && item.badge > 0 ? `${item.badge} new` : undefined,
  ].filter(Boolean);
  const name = [`Open ${item.label}`, ...extras].join(", ");
  return (
    <button
      type="button"
      data-icon={item.id}
      onClick={item.onOpen}
      aria-label={name}
      // Two lines at most; a longer name is whole in the tooltip.
      title={item.label}
      className="group relative flex w-full flex-col items-center gap-1.5 p-1 text-os-accent outline-none"
    >
      <span aria-hidden className="relative">
        {item.icon(
          `size-10 transition-colors group-hover:text-os-primary group-focus-visible:text-os-primary ${
            item.open
              ? "text-os-primary drop-shadow-[0_0_8px_var(--os-primary)]"
              : ""
          }`,
        )}
        {item.badge && item.badge > 0 ? (
          <span className="absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center bg-os-primary px-0.5 font-mono text-[10px] font-bold leading-none text-os-bg">
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        ) : null}
        {item.tag && (
          <span
            data-tag
            className={`absolute -left-3 -top-1.5 border bg-os-bg px-0.5 font-pixel text-[8px] uppercase leading-tight ${
              item.tag.strong
                ? "border-os-primary text-os-fg"
                : "border-os-line text-os-muted"
            }`}
          >
            {item.tag.text}
          </span>
        )}
      </span>
      {/* Drawn by CSS from data-label, not written into the page, so a
          folder's icon names never collide with the same words in a window's
          page; the button's name is its aria-label. */}
      <span
        aria-hidden
        data-label={item.label}
        className={`line-clamp-2 max-w-full px-1.5 py-0.5 text-center font-pixel text-[10px] uppercase leading-tight after:content-[attr(data-label)] ${
          item.open
            ? "bg-os-primary text-os-bg"
            : "bg-os-chrome/80 text-os-fg group-hover:bg-os-primary group-hover:text-os-bg group-focus-visible:bg-os-primary group-focus-visible:text-os-bg"
        }`}
      />
    </button>
  );
}
