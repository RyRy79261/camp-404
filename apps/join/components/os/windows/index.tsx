import dynamic from "next/dynamic";
import { useEffect } from "react";
import { TerminalWindow } from "@camp404/os/terminal";
import { INKBLOT } from "@/lib/content";
import { JOIN_COMMANDS, WELCOME } from "@/lib/terminal-commands";
import type { AppId } from "@/lib/window-manager";
import { useJoinData } from "../join-data";
import { ApplyWindow } from "./apply";
import { CrewWindow } from "./crew";
import { FeeWindow } from "./fee";
import { GiftsWindow } from "./gifts";
import { MapWindow } from "./map";
import { PerksWindow } from "./perks";
import { ReadmeWindow } from "./readme";
import { ScheduleWindow } from "./schedule";
import { TeamsWindow } from "./teams";
import { TruckWindow } from "./truck";

// A hidden game is fetched only when someone finds it, so it is never in the
// first bundle. Until it arrives the window shows the game's own background.
const InkblotWindow = dynamic(
  () => import("@camp404/games/inkblot").then((m) => m.InkblotWindow),
  { loading: () => <div className="h-full bg-os-bg" /> },
);

// The game hides behind a terminal command. Fetch it while someone types, so
// the command opens a game that is ready, as it did before the game moved
// into its own package.
function JoinTerminal({
  openApp,
  close,
}: {
  openApp: (id: AppId) => void;
  close: () => void;
}) {
  const data = useJoinData();
  useEffect(() => {
    void import("@camp404/games/inkblot");
  }, []);
  return (
    <TerminalWindow
      commands={JOIN_COMMANDS}
      context={data}
      welcome={WELCOME}
      openApp={openApp}
      close={close}
    />
  );
}

export function WindowContent({
  id,
  openApp,
  close,
}: {
  id: AppId;
  openApp: (id: AppId) => void;
  close: () => void;
}) {
  switch (id) {
    case "readme":
      return <ReadmeWindow openApp={openApp} />;
    case "teams":
      return <TeamsWindow />;
    case "gifts":
      return <GiftsWindow />;
    case "map":
      return <MapWindow />;
    case "crew":
      return <CrewWindow />;
    case "schedule":
      return <ScheduleWindow />;
    case "fee":
      return <FeeWindow />;
    case "perks":
      return <PerksWindow />;
    case "truck":
      return <TruckWindow />;
    case "terminal":
      return <JoinTerminal openApp={openApp} close={close} />;
    case "apply":
      return <ApplyWindow />;
    case "inkblot":
      return <InkblotWindow copy={INKBLOT} photoBase="/inkblot" />;
  }
}
