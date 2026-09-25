import type { AppDef } from "@/lib/apps";
import { AppIcon } from "./icons";

export function DesktopIcon({
  app,
  open,
  onOpen,
  size = "md",
}: {
  app: AppDef;
  open: boolean;
  onOpen: () => void;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      data-icon={app.id}
      onClick={onOpen}
      aria-label={`Open ${app.label}`}
      className="group flex w-28 flex-col items-center gap-2 p-1 text-os-accent outline-none"
    >
      <AppIcon
        id={app.id}
        className={`${size === "sm" ? "size-10" : "size-14"} transition-colors group-hover:text-os-primary group-focus-visible:text-os-primary ${
          open
            ? "text-os-primary drop-shadow-[0_0_8px_var(--color-os-primary)]"
            : ""
        }`}
      />
      <span
        className={`max-w-full truncate px-1.5 py-0.5 font-pixel text-[10px] uppercase tracking-wider ${
          open
            ? "bg-os-primary text-os-primary-fg"
            : "bg-os-chrome/80 text-os-fg group-hover:bg-os-primary group-hover:text-os-primary-fg group-focus-visible:bg-os-primary group-focus-visible:text-os-primary-fg"
        }`}
      >
        {app.label}
      </span>
    </button>
  );
}
