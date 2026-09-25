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
};

/** A program on the desktop: a picture over a label, one click to open. */
export function DesktopIcon({
  id,
  label,
  icon,
  open,
  onOpen,
  size = "md",
}: Props) {
  return (
    <button
      type="button"
      data-icon={id}
      onClick={onOpen}
      aria-label={`Open ${label}`}
      className="group flex w-28 flex-col items-center gap-2 p-1 text-os-accent outline-none"
    >
      {icon(
        `${size === "sm" ? "size-10" : "size-14"} transition-colors group-hover:text-os-primary group-focus-visible:text-os-primary ${
          open ? "text-os-primary drop-shadow-[0_0_8px_var(--os-primary)]" : ""
        }`,
      )}
      <span
        className={`max-w-full truncate px-1.5 py-0.5 font-pixel text-[10px] uppercase tracking-wider ${
          open
            ? "bg-os-primary text-os-primary-fg"
            : "bg-os-chrome/80 text-os-fg group-hover:bg-os-primary group-hover:text-os-primary-fg group-focus-visible:bg-os-primary group-focus-visible:text-os-primary-fg"
        }`}
      >
        {label}
      </span>
    </button>
  );
}
