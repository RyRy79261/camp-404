"use client";

import { useState } from "react";
import { TEAMS, TEAMS_INTRO, TEAMS_OUTRO } from "@/lib/content";
import { WinBody } from "./ui";

// A folder of team files; opening one shows what the team does beside it.
export function TeamsWindow() {
  const [open, setOpen] = useState(0);
  const team = TEAMS[open]!;
  return (
    <WinBody>
      <p className="text-os-muted">{TEAMS_INTRO}</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <ul
          aria-label="Team files"
          className="grid shrink-0 grid-cols-2 gap-1 sm:w-52 sm:grid-cols-1"
        >
          {TEAMS.map((t, i) => (
            <li key={t.file}>
              <button
                type="button"
                aria-pressed={i === open}
                onClick={() => setOpen(i)}
                className={`flex w-full items-center gap-2 px-2 py-1 text-left font-mono text-[11px] uppercase ${
                  i === open
                    ? "bg-os-primary text-os-primary-fg"
                    : "text-os-fg hover:bg-os-chrome"
                }`}
              >
                <span aria-hidden>▤</span>
                <span className="truncate">{t.file}</span>
              </button>
            </li>
          ))}
        </ul>
        <section
          aria-live="polite"
          className="min-h-40 flex-1 border border-os-line bg-os-bg/60 p-4"
        >
          <p className="font-mono text-[10px] uppercase tracking-widest text-os-muted">
            C:\TEAMS\{team.file}
          </p>
          <h4 className="mt-2 font-pixel text-base uppercase text-os-fg">
            {team.name}
            {team.isNew && (
              <span className="ml-2 bg-os-accent px-1.5 align-middle text-[9px] text-os-primary-fg">
                New
              </span>
            )}
          </h4>
          <p className="mt-2">{team.does}</p>
        </section>
      </div>
      {TEAMS_OUTRO.map((p) => (
        <p key={p} className="text-os-muted">
          {p}
        </p>
      ))}
    </WinBody>
  );
}
