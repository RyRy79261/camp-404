import type { AppId } from "@/lib/window-manager";
import { ApplyWindow } from "./apply";
import { CrewWindow } from "./crew";
import { FeeWindow } from "./fee";
import { GiftsWindow } from "./gifts";
import { InkblotWindow } from "./inkblot";
import { MapWindow } from "./map";
import { PerksWindow } from "./perks";
import { ReadmeWindow } from "./readme";
import { ScheduleWindow } from "./schedule";
import { TeamsWindow } from "./teams";
import { TerminalWindow } from "./terminal";
import { TruckWindow } from "./truck";

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
      return <TerminalWindow openApp={openApp} close={close} />;
    case "apply":
      return <ApplyWindow />;
    case "inkblot":
      return <InkblotWindow />;
  }
}
