import { cn } from "@camp404/ui/lib/utils";
import type { RosterDisplayRow } from "@/lib/camp-roster";
import {
  RosterAvatar,
  countryFlag,
  roleFor,
  statusBarClass,
} from "./roster-presentation";

// Mobile roster list (board S17 mobile, < sm). Each member is a full-width
// button row — status bar, avatar, name + sub-line (@handle · flag · country)
// and a trailing role emoji. Buttons make every row keyboard-reachable. Serves
// both the captain view (coloured status bar) and the member view (no `status`
// → a neutral bar, no approval signal).

export function RosterList({
  rows,
  selectedId,
  onSelect,
  className,
}: {
  rows: RosterDisplayRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        "divide-y overflow-hidden rounded-lg border bg-card",
        className,
      )}
    >
      {rows.map((r) => {
        const selected = r.id === selectedId;
        const role = roleFor(r.rank, r.isLead);
        return (
          <li key={r.id}>
            <button
              type="button"
              data-roster-trigger={r.id}
              aria-current={selected ? "true" : undefined}
              onClick={() => onSelect(r.id)}
              aria-label={`Open ${r.displayName}'s profile`}
              className="flex w-full items-stretch text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            >
              <span
                aria-hidden
                className={cn(
                  "w-1 shrink-0",
                  r.status ? statusBarClass(r.status) : "bg-border",
                )}
              />
              {r.statusLabel && <span className="sr-only">{r.statusLabel}</span>}
              <span
                className={cn(
                  "flex flex-1 items-center gap-3 px-3 py-2.5 transition-colors",
                  selected ? "bg-accent/10" : "",
                )}
              >
                <RosterAvatar name={r.displayName} id={r.id} px={34} radius={4} />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate font-semibold",
                      selected ? "text-accent" : "text-foreground",
                    )}
                  >
                    {r.displayName}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-caption text-muted-foreground">
                    {r.handle && (
                      <span className="font-mono">@{r.handle}</span>
                    )}
                    {r.country && (
                      <>
                        <span aria-hidden>{countryFlag(r.country)}</span>
                        <span className="truncate">{r.country}</span>
                      </>
                    )}
                  </span>
                </span>
                <span aria-hidden className="text-xl leading-none">
                  {role.emoji}
                </span>
                <span className="sr-only">{role.label}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
