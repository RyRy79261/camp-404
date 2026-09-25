"use client";

import { useState } from "react";
import { teamFile, teamIcon } from "@/lib/teams";
import { useJoinData } from "../join-data";
import { PixelIcon } from "../pixel-icons";
import { WinBody } from "./ui";

/** "MUTANT.VEH" → "MUTANT", "COMMS_HR.TXT" → "COMMS HR". */
const label = (file: string) => file.replace(/\.[^.]+$/, "").replace(/_/g, " ");

// A folder of glitchy pixel icons, one per team; choosing one shows what the
// team does underneath, like a file's properties.
export function TeamsWindow() {
  const { teams: TEAMS, content } = useJoinData();
  const [open, setOpen] = useState(0);
  const team = TEAMS[Math.min(open, TEAMS.length - 1)];
  if (!team) return null;
  return (
    <WinBody>
      <p className="text-os-muted">{content.teams.intro}</p>
      <ul
        aria-label="Teams"
        className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-1"
      >
        {TEAMS.map((t, i) => {
          const chosen = i === open;
          return (
            <li key={t.key}>
              <button
                type="button"
                aria-pressed={chosen}
                onClick={() => setOpen(i)}
                className={`group flex w-full flex-col items-center gap-1.5 p-2 ${
                  chosen ? "bg-os-primary/15" : "hover:bg-os-chrome/60"
                }`}
              >
                <PixelIcon
                  icon={teamIcon(t)}
                  className={`size-11 ${
                    chosen ? "pixel-glitch-live text-os-fg" : "text-os-fg/90"
                  }`}
                />
                <span
                  className={`max-w-full truncate px-1 font-pixel text-[9px] uppercase ${
                    chosen
                      ? "bg-os-primary text-os-primary-fg"
                      : "text-os-fg group-hover:text-os-primary"
                  }`}
                >
                  {label(teamFile(t))}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <section
        aria-live="polite"
        className="flex gap-4 border border-os-line bg-os-bg/60 p-4"
      >
        <PixelIcon
          icon={teamIcon(team)}
          className="pixel-glitch-live size-14 shrink-0 text-os-fg"
        />
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-widest text-os-muted">
            C:\TEAMS\{teamFile(team)}
          </p>
          <h4 className="mt-1 font-pixel text-base uppercase text-os-fg">
            {team.label}
          </h4>
          <p className="mt-1">{team.description}</p>
        </div>
      </section>
      {content.teams.outro.map((p) => (
        <p key={p} className="text-os-muted">
          {p}
        </p>
      ))}
    </WinBody>
  );
}
