import type { ReactNode } from "react";
import { DesktopIcon } from "./desktop-icon";

export type FolderItem = {
  id: string;
  label: string;
  icon: (className: string) => ReactNode;
  /** Its window is open. */
  open?: boolean;
  onOpen: () => void;
};

type Props = {
  /** The folder's name, read out for its list. */
  label: string;
  items: readonly FolderItem[];
  /** Shown when the folder holds nothing. */
  empty?: ReactNode;
};

/**
 * A folder's window body: its programs as icons, each opening its own
 * window. What a folder holds is the app's to decide.
 */
export function FolderWindow({ label, items, empty }: Props) {
  if (items.length === 0) {
    return <div className="p-5 text-sm text-os-muted">{empty}</div>;
  }
  return (
    <ul
      aria-label={label}
      className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] justify-items-center gap-y-4 p-4"
    >
      {items.map((item) => (
        <li key={item.id}>
          <DesktopIcon
            id={item.id}
            label={item.label}
            icon={item.icon}
            open={!!item.open}
            onOpen={item.onOpen}
            size="sm"
          />
        </li>
      ))}
    </ul>
  );
}
