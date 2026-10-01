import type { ReactNode } from "react";

type Props = {
  /** Marks the button (data-icon), so focus can come back to it. */
  id: string;
  label: string;
  /** The picture, drawn with the classes the icon's state calls for. */
  icon: (className: string) => ReactNode;
  /** Its window is open: the icon lights up. */
  open: boolean;
  onOpen: () => void;
  size?: "sm" | "md";
  /**
   * Says "start here": the icon glows (calmly, a slow pulse; still under
   * reduced motion) and the words join its name, "Open README.TXT, start
   * here". The app decides when it stops.
   */
  hint?: string;
};

/** A program on the desktop: a picture over a label, one click to open. */
export function DesktopIcon({
  id,
  label,
  icon,
  open,
  onOpen,
  size = "md",
  hint,
}: Props) {
  const lit = open || !!hint;
  return (
    <button
      type="button"
      data-icon={id}
      onClick={onOpen}
      aria-label={hint ? `Open ${label}, ${hint}` : `Open ${label}`}
      data-hint={hint ? "" : undefined}
      data-size={hint ? size : undefined}
      // Two lines at most; a longer name is whole in the tooltip.
      title={label}
      className={`group flex w-28 flex-col items-center gap-2 p-1 text-os-accent outline-none ${
        hint ? "os-icon-hint" : ""
      }`}
    >
      {icon(
        `${size === "sm" ? "size-10" : "size-14"} transition-colors group-hover:text-os-primary group-focus-visible:text-os-primary ${
          lit ? "text-os-primary drop-shadow-[0_0_8px_var(--os-primary)]" : ""
        }`,
      )}
      {/* Drawn by CSS from data-label, not written into the page, so a
          folder's icon names never collide with the same words in a window's
          page; the button's name is its aria-label. */}
      <span
        aria-hidden
        data-label={label}
        className={`line-clamp-2 max-w-full px-1.5 py-0.5 text-center font-pixel text-[10px] uppercase tracking-wider after:content-[attr(data-label)] ${
          open
            ? "bg-os-primary text-os-bg"
            : "bg-os-chrome/80 text-os-fg group-hover:bg-os-primary group-hover:text-os-bg group-focus-visible:bg-os-primary group-focus-visible:text-os-bg"
        }`}
      />
    </button>
  );
}
