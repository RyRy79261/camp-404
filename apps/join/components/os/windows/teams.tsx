"use client";

import { useState } from "react";
import { TEAMS, TEAMS_INTRO, TEAMS_OUTRO } from "@/lib/content";
import { PixelIcon } from "../pixel-icons";
import { WinBody } from "./ui";

/** "MUTANT.VEH" → "MUTANT", "COMMS_HR.TXT" → "COMMS HR". */
const label = (file: string) => file.replace(/\.[^.]+$/, "").replace(/_/g, " ");

// A folder of glitchy pixel icons, one per team; choosing one shows what the
// team does underneath, like a file's properties.
export function TeamsWindow() {
  const [open, setOpen] = useState(0);
  const team = TEAMS[open]!;
  return (
    <WinBody>
      <p className="text-os-muted">{TEAMS_INTRO}</p>
      <ul
        aria-label="Teams"
        className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-1"
      >
        {TEAMS.map((t, i) => {
          const chosen = i === open;
          return (
            <li key={t.file}>
              <button
                type="button"
                aria-pressed={chosen}
                onClick={() => setOpen(i)}
                className={`group flex w-full flex-col items-center gap-1.5 p-2 ${
                  chosen ? "bg-os-primary/15" : "hover:bg-os-chrome/60"
                }`}
              >
                <PixelIcon
                  icon={t.icon}
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
                  {label(t.file)}
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
          icon={team.icon}
          className="pixel-glitch-live size-14 shrink-0 text-os-fg"
        />
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-widest text-os-muted">
            C:\TEAMS\{team.file}
          </p>
          <h4 className="mt-1 font-pixel text-base uppercase text-os-fg">
            {team.name}
            {team.isNew && (
              <span className="ml-2 bg-os-accent px-1.5 align-middle text-[9px] text-os-primary-fg">
                New
              </span>
            )}
          </h4>
          <p className="mt-1">{team.does}</p>
        </div>
      </section>
      {TEAMS_OUTRO.map((p) => (
        <p key={p} className="text-os-muted">
          {p}
        </p>
      ))}
    </WinBody>
  );
}
