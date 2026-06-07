import { ChevronRight } from "lucide-react";
import { cn } from "@camp404/ui/lib/utils";
import type { RosterDisplayRow } from "@/lib/camp-roster";
import {
  RoleBadge,
  RosterAvatar,
  countryFlag,
  statusBarClass,
} from "./roster-presentation";

// Terminal-console roster table (board S17, ≥ sm). One row per member: a status
// colour bar, mono-tinted avatar, name, @handle, country (flag + name), the
// three-rank role badge and a chevron open affordance. The chevron is a real
// focusable button so the row is keyboard-reachable; the whole row is also
// clickable for pointer users. Serves both the captain view (coloured status
// bar) and the member view (no `status` → a neutral bar, no approval signal).

export function RosterTable({
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
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-card",
        className,
      )}
    >
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b bg-black/20 font-mono text-micro font-bold uppercase tracking-wide text-muted-foreground">
            <th className="w-1 p-0" aria-hidden />
            <th scope="col" className="px-4 py-3 font-bold">
              Member
            </th>
            <th scope="col" className="w-[180px] px-2 py-3 font-bold">
              Handle
            </th>
            <th scope="col" className="w-[220px] px-2 py-3 font-bold">
              Country
            </th>
            <th scope="col" className="w-[160px] px-2 py-3 font-bold">
              Role
            </th>
            <th scope="col" className="w-[80px] px-2 py-3">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const selected = r.id === selectedId;
            return (
              <tr
                key={r.id}
                onClick={() => onSelect(r.id)}
                className={cn(
                  "cursor-pointer border-b transition-colors last:border-0",
                  selected
                    ? "bg-accent/10"
                    : "even:bg-white/[0.025] hover:bg-white/[0.04]",
                )}
              >
                <td className="relative w-1 p-0">
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-y-0 left-0 w-1",
                      r.status ? statusBarClass(r.status) : "bg-border",
                    )}
                  />
                  {r.statusLabel && (
                    <span className="sr-only">{r.statusLabel}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <RosterAvatar name={r.displayName} id={r.id} px={30} />
                    <span className="font-semibold text-foreground">
                      {r.displayName}
                    </span>
                  </div>
                </td>
                <td className="px-2 py-3 font-mono text-label text-muted-foreground">
                  {r.handle ? `@${r.handle}` : "—"}
                </td>
                <td className="px-2 py-3 text-sm text-foreground">
                  {r.country ? (
                    <span className="inline-flex items-center gap-2">
                      <span aria-hidden className="text-base">
                        {countryFlag(r.country)}
                      </span>
                      {r.country}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-2 py-3">
                  <RoleBadge rank={r.rank} isLead={r.isLead} />
                </td>
                <td className="px-2 py-3 text-right">
                  <button
                    type="button"
                    data-roster-trigger={r.id}
                    aria-current={selected ? "true" : undefined}
                    aria-label={`Open ${r.displayName}'s profile`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(r.id);
                    }}
                    className="inline-flex items-center justify-center rounded-md p-1 text-accent transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <ChevronRight aria-hidden className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
