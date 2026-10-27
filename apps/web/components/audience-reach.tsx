"use client";

import * as React from "react";

// The send screens' audience line (owner's mock-up, step 8, 2026-10-27):
// "Reaches 14 people. Left out: 3 who said Not coming this year. Who?" A
// group send leaves out every member who said Not coming this year; "Who?"
// shows their names, which the server sends only to a viewer who may read
// participation (team lead and up). Used by the questionnaire Send page and
// the announcements composer.

/** The members a group send leaves out because they said Not coming. */
export interface NotComing {
  count: number;
  /** Null when the viewer may not read who said what. */
  names: string[] | null;
}

function people(n: number): string {
  return `${n} ${n === 1 ? "person" : "people"}`;
}

/** "Reaches N people." */
export function reachesText(reaches: number): string {
  return `Reaches ${people(reaches)}.`;
}

/** "Left out: M who said Not coming this year.", or "" when nobody is. */
export function leftOutText(notComing: NotComing): string {
  return notComing.count > 0
    ? `Left out: ${notComing.count} who said Not coming this year.`
    : "";
}

/**
 * The left-out half of the line, with its "Who?" link and the names under it.
 * Draws nothing when nobody is left out.
 */
export function NotComingNote({ notComing }: { notComing: NotComing }) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  if (notComing.count === 0) return null;
  const names = notComing.names;
  return (
    <>
      {" "}
      {leftOutText(notComing)}
      {names && names.length > 0 && (
        <>
          {" "}
          <button
            type="button"
            className="text-primary underline underline-offset-2 hover:no-underline"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen((o) => !o)}
          >
            Who?
          </button>
          {open && (
            <span id={id} className="mt-1 block text-muted-foreground">
              {names.join(", ")}
            </span>
          )}
        </>
      )}
    </>
  );
}
