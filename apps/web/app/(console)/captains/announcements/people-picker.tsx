"use client";

import { useId, useRef, useState } from "react";
import { Search, Users, X } from "lucide-react";
import { Input } from "@camp404/ui/components/input";
import { Label } from "@camp404/ui/components/label";
import { cn } from "@camp404/ui/lib/utils";
import type { AnnouncementPerson } from "@camp404/db/broadcasts";
import { peopleSummary } from "./audience-words";

// "Specific people…" (#313, owner approved 2026-10-02: one OR several chosen
// members): a name search that adds each pick as a chip, and the line that
// says who it goes to. The list is what the server offers (approved members,
// never the sender, never an erased account); the actions check every id
// again, so this only shapes the choice.

/** How many matches the search shows at once. */
const MATCHES_SHOWN = 6;

export function PeoplePicker({
  people,
  chosen,
  onChange,
  teamLabels,
  disabled = false,
}: {
  people: readonly AnnouncementPerson[];
  /** The chosen member ids, in the order they were picked. */
  chosen: readonly string[];
  onChange: (ids: string[]) => void;
  teamLabels: Record<string, string>;
  disabled?: boolean;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  const byId = new Map(people.map((p) => [p.id, p]));
  const picked = chosen.map(
    (pid) => byId.get(pid) ?? { id: pid, name: "Someone who left", teams: [] },
  );
  const q = query.trim().toLowerCase();
  const matches = q
    ? people
        .filter((p) => !chosen.includes(p.id))
        // Any word of the name: "nai" finds Jess Naidoo.
        .filter((p) => {
          const name = p.name.toLowerCase();
          return (
            name.startsWith(q) ||
            name.split(/\s+/).some((word) => word.startsWith(q))
          );
        })
        .slice(0, MATCHES_SHOWN)
    : [];

  const teamsOf = (p: AnnouncementPerson) =>
    p.teams.map((t) => teamLabels[t] ?? t).join(", ");

  function add(personId: string) {
    onChange([...chosen, personId]);
    setQuery("");
    inputRef.current?.focus();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${id}-search`}>People</Label>
      {picked.length > 0 && (
        <ul aria-label="Chosen people" className="flex flex-wrap gap-2">
          {picked.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-2 border border-primary bg-primary/10 py-1 pl-3 pr-1 text-sm"
            >
              <span className="flex flex-col leading-tight">
                <span className="font-semibold">{p.name}</span>
                {p.teams.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {teamsOf(p)}
                  </span>
                )}
              </span>
              <button
                type="button"
                aria-label={`Remove ${p.name}`}
                disabled={disabled}
                onClick={() => onChange(chosen.filter((c) => c !== p.id))}
                className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          ref={inputRef}
          id={`${id}-search`}
          type="search"
          value={query}
          disabled={disabled}
          autoComplete="off"
          placeholder={
            picked.length > 0 ? "Add someone else…" : "Search by name…"
          }
          aria-describedby={`${id}-summary`}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Enter adds the first match, so a name can be typed and added
            // without reaching for the pointer.
            if (e.key === "Enter" && matches[0]) {
              e.preventDefault();
              add(matches[0].id);
            }
          }}
          className="pl-9"
        />
      </div>
      {q && (
        <ul
          aria-label="Matching people"
          className="flex flex-col border border-border"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              No one by that name.
            </li>
          ) : (
            matches.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => add(p.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                    i === 0 && "bg-muted/50",
                  )}
                >
                  <span>{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {teamsOf(p)}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      <AudienceLine id={`${id}-summary`}>
        {peopleSummary(picked.map((p) => p.name))}
      </AudienceLine>
    </div>
  );
}

/** The "who it goes to" line under the audience picker, with its icon. */
export function AudienceLine({
  id,
  children,
}: {
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <p
      id={id}
      className="flex items-start gap-2 text-xs text-muted-foreground"
      aria-live="polite"
    >
      <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
