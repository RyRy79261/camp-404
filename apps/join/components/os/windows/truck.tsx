import { TRUCK } from "@/lib/content";
import { WinBody } from "./ui";

// One big truck; the trailers go behind members' own cars.
const TRUCK_ART = [
  " ____________________ _____",
  "|                    ||__\\ \\__",
  "|     CAMP  404      ||      __]",
  "|____________________||_____|__|",
  "   (@)(@)       (@)(@)     (@)",
  "",
  "    ______          _________",
  "   /|_||_\\`.__      |  FOOD + |",
  "  (   _    _ _\\=====|  BIKES  |",
  "  =`-(_)--(_)-'     |_________|",
  "                        (o)",
].join("\n");

export function TruckWindow() {
  return (
    <WinBody>
      <pre
        aria-hidden
        className="overflow-x-auto font-mono text-[11px] leading-tight text-os-accent"
      >
        {TRUCK_ART}
      </pre>
      <ol className="space-y-1 font-mono text-xs">
        {TRUCK.entries.map((e, i) => (
          <li key={e} className="grid grid-cols-[3.25rem_1fr] gap-2">
            <span className="text-os-muted">
              [{String(i + 1).padStart(3, "0")}]
            </span>
            <span>{e}</span>
          </li>
        ))}
      </ol>
    </WinBody>
  );
}
