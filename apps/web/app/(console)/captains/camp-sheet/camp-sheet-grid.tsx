"use client";

import {
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ChevronDown, Search } from "lucide-react";
import { NO_ANSWER_LABEL, STANDING_LABEL } from "@camp404/core";
import { PARTICIPATION_STATUSES } from "@camp404/types";
import { Input } from "@camp404/ui/components/input";
import { cn } from "@camp404/ui/lib/utils";
import { matchesThisYear, type ThisYearFilter } from "@/lib/camp-roster";
import type { CampSheet, CampSheetColumn } from "@/lib/camp-sheet";

// The Camp sheet's grid, drawn like a spreadsheet (the owner's pick, option A):
// column letters over column names, a row number and the name pinned on the
// left, one thin line per person, and a formula bar that shows the whole of
// the selected cell. Read-only: no editing, no column changes (owner: "let's
// not get too complicated for now").
//
// It scrolls sideways inside its own frame ON PURPOSE, the one exception to
// "a table fits its window" (AGENTS.md): it is a spreadsheet with no buttons
// in it, and seeing every column of a person on one line is the point.
//
// The cells of ID, safety and dietary columns, and the formula bar's value,
// are marked data-os-private, so a background copy of this window blanks them.

/**
 * Each column's width in pixels; anything unlisted is DEFAULT_WIDTH. The
 * first column (the name) is pinned, so its width is NAME_WIDTH's: narrower
 * in a phone-wide window, so the pinned part leaves room to read the rest.
 */
const WIDTHS: Readonly<Record<string, number>> = {
  handle: 120,
  rank: 100,
  teams: 190,
  country: 130,
  approval: 100,
  this_year: 150,
  emergency_contact_1: 270,
  emergency_contact_2: 250,
  allergies: 160,
  anaphylactic: 110,
  food_dislikes: 150,
  dietary_notes: 210,
  email: 200,
  id_type: 90,
  id_number: 150,
  arrival: 180,
  dues_paid: 90,
  joined: 110,
};
const DEFAULT_WIDTH = 160;
const ROW_NUMBER_WIDTH = 44;
const NAME_WIDTH =
  "w-[120px] min-w-[120px] max-w-[120px] page-sm:w-[190px] page-sm:min-w-[190px] page-sm:max-w-[190px]";
/**
 * The pinned columns' width (row number + name) as scroll padding, so a cell
 * scrolled to (by the arrow keys, or a click) lands beside them, not under.
 */
const PINNED_SCROLL_PADDING = "scroll-pl-[164px] page-sm:scroll-pl-[234px]";

/** The 3px bar over a column name, by the part of the record it is about. */
const GROUP_BAR: Readonly<Record<CampSheetColumn["group"], string>> = {
  who: "shadow-[inset_0_3px_0_var(--color-primary)]",
  safety: "shadow-[inset_0_3px_0_var(--color-destructive)]",
  food: "shadow-[inset_0_3px_0_var(--color-warning)]",
  captains: "shadow-[inset_0_3px_0_var(--color-accent)]",
};

const GROUP_TITLE: Readonly<Record<CampSheetColumn["group"], string>> = {
  who: "Who",
  safety: "Safety",
  food: "Food",
  captains: "Captains only",
};

/** A spreadsheet's column letter: A … Z, AA, AB … */
export function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** A little emphasis on the words a captain scans for. */
function tone(key: string, value: string): string | undefined {
  switch (key) {
    case "allergies":
      return value ? "font-semibold text-destructive" : undefined;
    case "anaphylactic":
      return value === "Yes" ? "font-bold text-destructive" : undefined;
    case "approval":
      return value === "Approved"
        ? "text-success"
        : value === "Pending"
          ? "text-warning"
          : value === "Rejected"
            ? "font-semibold text-destructive"
            : undefined;
    case "dues_paid":
      return value === "Yes"
        ? "text-success"
        : value === "No"
          ? "text-warning"
          : undefined;
    default:
      return undefined;
  }
}

const SELECT =
  "h-9 w-full cursor-pointer appearance-none rounded-md border border-input bg-background pl-3 pr-9 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function NativeSelect({
  label,
  value,
  onChange,
  active,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <div className="relative w-full page-sm:w-52">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(SELECT, active && "border-primary")}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50"
      />
    </div>
  );
}

interface Selection {
  rowId: string;
  col: number;
}

export function CampSheetGrid({
  columns,
  rows,
  teams,
}: CampSheet & {
  /** The camp's active teams, for the team filter. */
  teams: readonly { key: string; label: string }[];
}) {
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState("");
  const [thisYear, setThisYear] = useState<ThisYearFilter>("any");
  const [selected, setSelected] = useState<Selection | null>(null);
  const idBase = useId();

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (!q || row.cells.some((cell) => cell.toLowerCase().includes(q))) &&
        (!team || row.teams.includes(team)) &&
        matchesThisYear(row, thisYear),
    );
  }, [rows, query, team, thisYear]);

  // A selection on a row the filters hide is no selection.
  const selectedRow = selected
    ? shown.findIndex((r) => r.id === selected.rowId)
    : -1;
  const current =
    selected && selectedRow >= 0
      ? { row: selectedRow, col: selected.col }
      : null;
  const cellId = (row: number, col: number) => `${idBase}-r${row}-c${col}`;

  function select(row: number, col: number) {
    const target = shown[row];
    if (!target) return;
    setSelected({ rowId: target.id, col });
    // Bring a cell moved to by the keyboard into view, if the browser can.
    document
      .getElementById(cellId(row, col))
      ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTableElement>) {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const move = moves[e.key];
    if (!move || shown.length === 0) return;
    e.preventDefault();
    if (!current) {
      select(0, 0);
      return;
    }
    const row = Math.min(Math.max(current.row + move[0], 0), shown.length - 1);
    const col = Math.min(
      Math.max(current.col + move[1], 0),
      columns.length - 1,
    );
    select(row, col);
  }

  const fx = current
    ? {
        address: `${columnLetter(current.col)}${current.row + 1} · ${columns[current.col]!.header}`,
        name: shown[current.row]!.cells[0] ?? "",
        value: shown[current.row]!.cells[current.col] ?? "",
      }
    : null;
  const width = (key: string) => WIDTHS[key] ?? DEFAULT_WIDTH;
  // The pinned name column's width is a class (it changes with the window).
  const widthStyle = (i: number, key: string, min: boolean) =>
    i === 0
      ? undefined
      : min
        ? { width: width(key), minWidth: width(key) }
        : { maxWidth: width(key) };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full page-sm:w-64">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, team, allergy…"
            aria-label="Search the sheet"
            className="h-9 pl-9"
          />
        </div>
        <NativeSelect
          label="Filter by team"
          value={team}
          onChange={setTeam}
          active={team !== ""}
        >
          <option value="">All teams</option>
          {teams.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          label="This year"
          value={thisYear}
          onChange={(v) => setThisYear(v as ThisYearFilter)}
          active={thisYear !== "any"}
        >
          <option value="any">This year: everyone</option>
          {PARTICIPATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STANDING_LABEL[status]}
            </option>
          ))}
          <option value="none">{NO_ANSWER_LABEL}</option>
        </NativeSelect>
        <p
          aria-live="polite"
          className="text-sm tabular-nums text-muted-foreground page-sm:ml-auto"
        >
          {shown.length} of {rows.length}{" "}
          {rows.length === 1 ? "person" : "people"}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {/* The formula bar: the whole of the selected cell. */}
        <div
          role="region"
          aria-label="Selected cell"
          className="flex min-h-8 flex-col border border-b-0 border-border bg-card text-sm page-sm:flex-row page-sm:items-stretch"
        >
          <span className="flex min-h-7 shrink-0 items-center border-b border-border px-2.5 font-mono text-xs text-muted-foreground page-sm:min-w-32 page-sm:border-b-0 page-sm:border-r">
            {fx ? fx.address : "—"}
          </span>
          {fx ? (
            <span className="min-w-0 whitespace-pre-wrap break-words px-2.5 py-1.5">
              <span className="font-medium">{fx.name}</span>
              {" — "}
              <span data-os-private="">{fx.value || "(empty)"}</span>
            </span>
          ) : (
            <span className="px-2.5 py-1.5 text-muted-foreground">
              Click a cell to read all of it here.
            </span>
          )}
        </div>

        <div
          className={cn(
            "min-h-72 flex-1 scroll-pt-12 overflow-auto border border-border",
            PINNED_SCROLL_PADDING,
          )}
        >
          <table
            role="grid"
            aria-label="Camp sheet"
            aria-rowcount={shown.length + 1}
            aria-colcount={columns.length}
            aria-activedescendant={
              current ? cellId(current.row, current.col) : undefined
            }
            tabIndex={0}
            onKeyDown={onKeyDown}
            className="w-max border-separate border-spacing-0 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <thead>
              {/* The column letters: a picture of a spreadsheet, not a header. */}
              <tr aria-hidden="true">
                <th
                  style={{
                    width: ROW_NUMBER_WIDTH,
                    minWidth: ROW_NUMBER_WIDTH,
                  }}
                  className="sticky left-0 top-0 z-30 h-5 border-b border-r border-border bg-muted"
                />
                {columns.map((c, i) => (
                  <th
                    key={c.key}
                    style={widthStyle(i, c.key, true)}
                    className={cn(
                      "sticky top-0 z-20 h-5 border-b border-r border-border bg-muted text-center font-mono text-[11px] font-normal text-muted-foreground",
                      i === 0 && cn("left-[44px] z-30", NAME_WIDTH),
                    )}
                  >
                    {columnLetter(i)}
                  </th>
                ))}
              </tr>
              <tr aria-rowindex={1}>
                <td
                  aria-hidden="true"
                  className="sticky left-0 top-5 z-30 h-7 border-b border-r border-border bg-card"
                />
                {columns.map((c, i) => (
                  <th
                    key={c.key}
                    scope="col"
                    aria-colindex={i + 1}
                    title={GROUP_TITLE[c.group]}
                    style={widthStyle(i, c.key, false)}
                    className={cn(
                      "sticky top-5 z-20 h-7 truncate border-b border-r border-border bg-card px-2 text-left font-semibold",
                      GROUP_BAR[c.group],
                      i === 0 && cn("left-[44px] z-30 border-r-2", NAME_WIDTH),
                    )}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="px-3 py-6 text-muted-foreground"
                  >
                    No one matches.
                  </td>
                </tr>
              )}
              {shown.map((row, r) => {
                const rowSelected = current?.row === r;
                return (
                  <tr key={row.id} aria-rowindex={r + 2} className="group/row">
                    <td
                      aria-hidden="true"
                      className={cn(
                        "sticky left-0 z-10 h-[26px] border-b border-r border-border text-center font-mono text-[11px] text-muted-foreground",
                        rowSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted",
                      )}
                    >
                      {r + 1}
                    </td>
                    {row.cells.map((value, c) => {
                      const column = columns[c]!;
                      const isSelected = rowSelected && current?.col === c;
                      const Cell = c === 0 ? "th" : "td";
                      return (
                        <Cell
                          key={column.key}
                          id={cellId(r, c)}
                          {...(c === 0 ? { scope: "row" } : {})}
                          role={c === 0 ? "rowheader" : "gridcell"}
                          aria-colindex={c + 1}
                          aria-selected={isSelected}
                          title={value || undefined}
                          data-os-private={column.private ? "" : undefined}
                          onClick={() => select(r, c)}
                          style={widthStyle(c, column.key, false)}
                          className={cn(
                            "h-[26px] cursor-cell truncate border-b border-r border-border px-2 text-left font-normal",
                            c === 0
                              ? cn(
                                  "sticky left-[44px] z-10 border-r-2 bg-background font-semibold group-hover/row:bg-muted",
                                  NAME_WIDTH,
                                )
                              : "group-hover/row:bg-muted/40",
                            tone(column.key, value),
                            isSelected &&
                              "bg-primary/10 outline outline-2 -outline-offset-2 outline-primary",
                          )}
                        >
                          {value}
                        </Cell>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
