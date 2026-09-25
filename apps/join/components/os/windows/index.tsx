import type { AppId } from "@/lib/window-manager";
import { ReadmeWindow } from "./readme";

export function WindowContent({
  id,
  openApp,
}: {
  id: AppId;
  openApp: (id: AppId) => void;
}) {
  switch (id) {
    case "readme":
      return <ReadmeWindow openApp={openApp} />;
    default:
      return (
        <p className="p-5 font-mono text-xs uppercase text-os-muted">
          Loading<span className="camp404-cursor">_</span>
        </p>
      );
  }
}
