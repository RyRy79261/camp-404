import { useJoinData } from "../join-data";
import { WinBody } from "./ui";

// One big truck; the trailers go behind members' own cars.
const TRUCK_ART = [
  " ____________________ _____",
  "|                    ||__\\ \\__",
  "|     CAMP  404      ||      __]",
  "|____________________||_____|__|",
  "   (@)(@)       (@)(@)     (@)",
  "",
  " ____________        ______",
  "| EVERYTHING |      /|_||_\\`.__",
  "|    ELSE    |=====(   _    _ _\\",
  "|____________|     =`-(_)--(_)-'",
  "     (o)",
].join("\n");

export function TruckWindow() {
  const truck = useJoinData().content.truck;
  return (
    <WinBody>
      <pre
        aria-hidden
        className="overflow-x-auto font-mono text-[11px] leading-tight text-os-accent"
      >
        {TRUCK_ART}
      </pre>
      <ol className="space-y-1 font-mono text-xs">
        {truck.entries.map((e, i) => (
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
