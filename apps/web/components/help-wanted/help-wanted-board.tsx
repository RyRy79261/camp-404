"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, Pencil, Plus, Search } from "lucide-react";
import { useWindowDirty } from "@camp404/os";
import {
  HELP_WANTED_FILTERS,
  HELP_WANTED_FILTER_LABELS,
  matchesHelpWantedFilter,
  pickerGroups,
  rolesOpenText,
  teamPlacesFilled,
  teamsNeedLeadText,
  type HelpWantedFilter,
} from "@camp404/core";
import {
  TEAM_ROLE_MAX_PLACES,
  TEAM_ROLE_NAME_MAX,
  TEAM_ROLE_NOTE_MAX,
  SaveTeamRoleInput,
} from "@camp404/types";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@camp404/ui/components/dialog";
import { Field } from "@camp404/ui/components/field";
import { Input } from "@camp404/ui/components/input";
import { ProgressBar } from "@camp404/ui/components/progress-bar";
import { RowActions } from "@camp404/ui/components/row-actions";
import { Spinner } from "@camp404/ui/components/spinner";
import { toast } from "@camp404/ui/components/toast";
import { cn } from "@camp404/ui/lib/utils";
import {
  copyLastYearsRolesAction,
  giveTeamRoleAction,
  removeTeamRoleAction,
  saveTeamRoleAction,
  setKeenAction,
  setLeadPlacesAction,
  takeTeamRoleAction,
} from "@/app/(console)/help-wanted/actions";
import { withArticle } from "@/lib/help-wanted-copy";
import type {
  HelpWantedRoleView,
  HelpWantedTeamView,
  HelpWantedView,
  PickablePerson,
} from "@/lib/help-wanted";

// Help wanted, as the owner approved it (Option A, 2026-10-09): the summary
// line, the filter chips, then one card per team, the teams that need a lead
// first. Each role is a row: its name and note, how full it is and who fills
// it, and the viewer's one action on the right in the same place on every
// row (RowActions). A full role says "Full" quietly; a viewer who may not act
// gets words, never a disabled control. Who may see what was decided on the
// server (lib/help-wanted.ts): a row carries who is keen, and member ids,
// only for a viewer who may give that role.
//
// One-tap changes (I'm keen, Copy, Take off) report a failure as a toast; the
// role form shows its problems beside the fields (AGENTS.md).

type Result = { ok: true } | { ok: false; error: string };

const QUIET = "text-sm text-muted-foreground";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /^\p{Lu}/u.test(w))
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
}

/** A one-tap button: runs `act`, toasts a failure (or `done`), refreshes. */
function OneTap({
  act,
  done,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "onClick"> & {
  act: () => Promise<Result>;
  done?: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      type="button"
      size="sm"
      {...props}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await act();
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          if (done) toast.success(done);
          router.refresh();
        })
      }
    >
      {pending && <Spinner size="sm" label="Saving…" />}
      {children}
    </Button>
  );
}

// --- The board -----------------------------------------------------------------

export function HelpWantedBoard({ view }: { view: HelpWantedView }) {
  const [filter, setFilter] = React.useState<HelpWantedFilter>("all");
  const [picking, setPicking] = React.useState<{
    team: HelpWantedTeamView;
    row: HelpWantedRoleView;
  } | null>(null);
  const keeper = view.everyone !== null;
  const teams = view.teams.filter((t) => matchesHelpWantedFilter(t, filter));
  const { summary } = view;

  return (
    <div className="flex flex-col gap-4">
      <p
        data-testid="help-wanted-summary"
        className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-base font-semibold"
      >
        <span className="text-primary">
          {teamsNeedLeadText(summary.teamsNeedingLead)}
        </span>
        <span aria-hidden className="text-muted-foreground">
          ·
        </span>
        <span>{rolesOpenText(summary.rolesOpen)}</span>
        {!keeper && view.keenCount > 0 && (
          <span className="text-sm font-normal text-muted-foreground">
            You&apos;re keen on {view.keenCount}
          </span>
        )}
      </p>

      <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
        {HELP_WANTED_FILTERS.map((f) => {
          const on = filter === f;
          return (
            <button
              key={f}
              type="button"
              data-slot="filter-chip"
              aria-pressed={on}
              onClick={() => setFilter(f)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on && "border-primary bg-primary/15",
              )}
            >
              {HELP_WANTED_FILTER_LABELS[f]}{" "}
              <span
                data-slot="filter-chip-count"
                className="tabular-nums text-muted-foreground"
              >
                {summary.counts[f]}
              </span>
            </button>
          );
        })}
      </div>

      {teams.length === 0 ? (
        <p className={QUIET}>No team matches.</p>
      ) : (
        teams.map((t) => (
          <TeamCard
            key={t.key}
            team={t}
            year={view.year}
            onPick={(row) => setPicking({ team: t, row })}
          />
        ))
      )}

      {picking && view.everyone && (
        <Picker
          key={`${picking.team.key}:${picking.row.key}`}
          team={picking.team}
          row={picking.row}
          everyone={view.everyone}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}

// --- One team ------------------------------------------------------------------

function TeamCard({
  team,
  year,
  onPick,
}: {
  team: HelpWantedTeamView;
  year: number | null;
  onPick: (row: HelpWantedRoleView) => void;
}) {
  const [editing, setEditing] = React.useState<string | null>(null);
  const places = teamPlacesFilled(team);
  const headingId = `team-${team.key}`;
  const needsLead = team.lead.filled === 0;
  const others = team.rows.length - 1;
  const yearWords = year === null ? "this year" : `for ${year}`;

  return (
    <section
      aria-labelledby={headingId}
      data-team={team.key}
      data-slot="card"
      className="border border-border bg-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2
            id={headingId}
            className="font-sans text-base font-semibold tracking-normal normal-case"
          >
            {team.label}
          </h2>
          {needsLead ? (
            <Badge data-slot="badge">Needs a lead</Badge>
          ) : (
            <span className={QUIET}>
              Lead ·{" "}
              <span className="font-semibold text-foreground">
                {team.leadNames.join(", ")}
              </span>
            </span>
          )}
        </div>
        {places.places > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {places.filled} of {places.places} places filled
            </span>
            <ProgressBar
              className="w-16"
              value={places.filled}
              max={places.places}
              label={`${team.label} places filled`}
            />
          </div>
        )}
      </div>

      <ul className="flex flex-col divide-y divide-border">
        {team.rows.map((row) =>
          editing === row.key ? (
            <li key={row.key}>
              <RoleForm team={team} row={row} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={row.key}>
              <RoleRow
                team={team}
                row={row}
                onPick={() => onPick(row)}
                onEdit={() => setEditing(row.key)}
              />
            </li>
          ),
        )}
      </ul>

      {others === 0 && (
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
          <p className={QUIET}>
            No other roles {yearWords} yet.
            {team.lastYear.length > 0 && (
              <>
                {" "}
                Last year:{" "}
                <span className="font-semibold text-foreground">
                  {team.lastYear
                    .map((r) =>
                      r.places > 1 ? `${r.name} ×${r.places}` : r.name,
                    )
                    .join(", ")}
                </span>
                .
              </>
            )}
          </p>
          {team.manages && team.lastYear.length > 0 && (
            <OneTap
              variant="outline"
              className="self-start"
              act={async () => {
                const result = await copyLastYearsRolesAction({
                  team: team.key,
                });
                if (result.ok) {
                  toast.success(
                    `Copied ${result.data.copied} ${result.data.copied === 1 ? "role" : "roles"} from last year. Nobody is in them yet.`,
                  );
                }
                return result;
              }}
            >
              <Copy aria-hidden />
              Copy last year&apos;s roles
            </OneTap>
          )}
        </div>
      )}

      {team.manages &&
        (editing === "new" ? (
          <div className="border-t border-border">
            <RoleForm team={team} row={null} onDone={() => setEditing(null)} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="flex w-full items-center gap-2 border-t border-border px-4 py-3 text-sm font-semibold text-primary hover:bg-foreground/5"
          >
            <Plus aria-hidden className="h-4 w-4" />
            Add a role
            <span className="sr-only"> to {team.label}</span>
          </button>
        ))}
    </section>
  );
}

// --- One role --------------------------------------------------------------------

function RoleRow({
  team,
  row,
  onPick,
  onEdit,
}: {
  team: HelpWantedTeamView;
  row: HelpWantedRoleView;
  onPick: () => void;
  onEdit: () => void;
}) {
  const where = `${row.name} in ${team.label}`;
  const ref = { team: team.key, roleId: row.roleId };
  let primary: React.ReactNode;
  switch (row.action) {
    case "pick":
      primary = (
        <Button
          type="button"
          size="sm"
          className="w-full"
          onClick={onPick}
          aria-label={`Pick someone for ${where}`}
        >
          Pick someone
        </Button>
      );
      break;
    case "keen":
      primary = (
        <OneTap
          className="w-full"
          aria-label={`I'm keen on ${where}`}
          act={() => setKeenAction({ ...ref, keen: true })}
          done={`You're keen on ${where}. The team's lead or a captain will see it.`}
        >
          I&apos;m keen
        </OneTap>
      );
      break;
    case "unkeen":
      primary = (
        <OneTap
          variant="outline"
          className="w-full"
          aria-pressed
          aria-label={`You're keen on ${where}. Undo`}
          act={() => setKeenAction({ ...ref, keen: false })}
        >
          You&apos;re keen ✓ · Undo
        </OneTap>
      );
      break;
    case "full":
      primary = <span className={QUIET}>Full</span>;
      break;
    case "yours":
      primary = <span className={QUIET}>Yours</span>;
      break;
    case "captain_picks":
      primary = <span className={QUIET}>A captain picks</span>;
      break;
  }

  return (
    <div
      data-role={row.isLead ? "lead" : row.name}
      className="grid gap-3 px-4 py-3 page-sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] page-sm:items-center"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-semibold">
          {row.name}
          {row.isLead && row.places > 1 && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {row.places} wanted
            </span>
          )}
        </span>
        {row.note && <span className={QUIET}>{row.note}</span>}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span
          className={cn(
            "text-sm font-semibold tabular-nums",
            row.open ? "text-primary" : "text-success",
          )}
        >
          {row.filled} of {row.places}
        </span>
        {row.people.length === 0 ? (
          <span className={QUIET}>Nobody yet</span>
        ) : (
          <ul
            aria-label={`Who is ${row.name}`}
            className="flex flex-wrap gap-x-3 gap-y-1"
          >
            {row.people.map((p, i) => (
              <li
                key={p.userId ?? `${p.name}-${i}`}
                className="flex items-center gap-1.5 text-sm"
              >
                <span
                  aria-hidden
                  className={cn(
                    "inline-flex h-5 min-w-5 items-center justify-center bg-muted px-1 text-[10px] font-bold",
                    p.you && "bg-primary text-primary-foreground",
                  )}
                >
                  {initials(p.name) || "?"}
                </span>
                {p.name}
              </li>
            ))}
          </ul>
        )}
        {row.open && row.keen && row.keen.length > 0 && (
          <p className="text-sm text-accent">
            <span className="font-semibold">{row.keen.length} keen:</span>{" "}
            {row.keen.map((k) => k.name).join(", ")}
          </p>
        )}
      </div>
      <RowActions
        label={`Actions for ${where}`}
        className="page-sm:w-56"
        primary={<div className="flex w-36 justify-center">{primary}</div>}
        secondary={
          team.manages ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onEdit}
              aria-label={`Change ${where}`}
              title="Change this role"
            >
              <Pencil aria-hidden />
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}

// --- Adding or changing a role ----------------------------------------------------

function RoleForm({
  team,
  row,
  onDone,
}: {
  team: HelpWantedTeamView;
  /** null: a new role. */
  row: HelpWantedRoleView | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const lead = row?.isLead === true;
  const [name, setName] = React.useState(row?.name ?? "");
  const [places, setPlaces] = React.useState(String(row?.places ?? 1));
  const [note, setNote] = React.useState(row?.note ?? "");
  const [error, setError] = React.useState<{
    field: string;
    text: string;
  } | null>(null);
  const [pending, start] = React.useTransition();
  const id = `${team.key}-${row?.key ?? "new"}`;
  const dirty =
    name !== (row?.name ?? "") ||
    places !== String(row?.places ?? 1) ||
    (!lead && note !== (row?.note ?? ""));
  useWindowDirty(dirty, "This role has changes that are not saved. Leave?");

  const title = row
    ? lead
      ? `How many leads ${team.label} wants`
      : "Change this role"
    : `New role in ${team.label}`;

  function save() {
    setError(null);
    const count = Number(places);
    start(async () => {
      if (lead) {
        const result = await setLeadPlacesAction({
          team: team.key,
          places: count,
        });
        if (!result.ok) {
          setError({ field: "places", text: result.error });
          return;
        }
      } else {
        const input = {
          id: row?.roleId ?? null,
          team: team.key,
          name,
          places: count,
          note,
          expectedVersion: row?.version ?? 0,
        };
        const parsed = SaveTeamRoleInput.safeParse(input);
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          setError({
            field: String(issue?.path[0] ?? "name"),
            text: issue?.message ?? "Check the role.",
          });
          return;
        }
        const result = await saveTeamRoleAction(input);
        if (!result.ok) {
          setError({ field: "form", text: result.error });
          return;
        }
        if (!row) toast.success(`Added ${parsed.data.name} to ${team.label}.`);
      }
      onDone();
      router.refresh();
    });
  }

  const problem = (field: string) =>
    error && error.field === field ? error.text : undefined;

  return (
    <form
      aria-label={title}
      className="flex flex-col gap-3 bg-muted/40 px-4 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
        {title}
      </p>
      <div className="grid gap-3 page-sm:grid-cols-[minmax(0,1fr)_6rem]">
        {lead ? (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Role</span>
            <span className="text-sm">Lead</span>
          </div>
        ) : (
          <Field
            label="Role name"
            htmlFor={`${id}-name`}
            error={problem("name")}
          >
            <Input
              id={`${id}-name`}
              value={name}
              maxLength={TEAM_ROLE_NAME_MAX}
              placeholder="e.g. Shopper"
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
        )}
        <Field
          label="Places"
          htmlFor={`${id}-places`}
          error={problem("places")}
        >
          <Input
            id={`${id}-places`}
            type="number"
            inputMode="numeric"
            min={1}
            max={TEAM_ROLE_MAX_PLACES}
            value={places}
            onChange={(e) => setPlaces(e.target.value)}
          />
        </Field>
        {!lead && (
          <div className="page-sm:col-span-2">
            <Field
              label="Note, optional"
              htmlFor={`${id}-note`}
              error={problem("note")}
            >
              <Input
                id={`${id}-note`}
                value={note}
                maxLength={TEAM_ROLE_NOTE_MAX}
                placeholder="One line, e.g. Shops in Cape Town the week before"
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
          </div>
        )}
      </div>

      {row?.canTake && <PeopleInRole team={team} row={row} />}

      {error?.field === "form" && (
        <p role="alert" className="text-sm text-destructive">
          {error.text}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {row && !lead && (
          <OneTap
            variant="outline"
            className="mr-auto"
            act={async () => {
              const result = await removeTeamRoleAction({
                id: row.roleId,
                expectedVersion: row.version,
              });
              if (result.ok) {
                toast.success(`Removed ${row.name} from ${team.label}.`);
                onDone();
              }
              return result;
            }}
          >
            Remove role
          </OneTap>
        )}
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Spinner size="sm" label="Saving…" />}
          {row ? "Save" : "Add role"}
        </Button>
      </div>
    </form>
  );
}

/** Who fills a role, each with "Take off", inside its change form. */
function PeopleInRole({
  team,
  row,
}: {
  team: HelpWantedTeamView;
  row: HelpWantedRoleView;
}) {
  // Only for a viewer who may take people out (Lead: a captain); the server
  // decided that (canTake) and sends ids only to who runs the team.
  const people = row.people.flatMap((p) =>
    p.userId ? [{ ...p, userId: p.userId }] : [],
  );
  if (people.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium">In this role</span>
      <ul className="flex flex-col gap-1">
        {people.map((p) => (
          <li
            key={p.userId}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <span>{p.name}</span>
            <OneTap
              variant="ghost"
              aria-label={`Take ${p.name} off ${row.name}`}
              act={() =>
                takeTeamRoleAction({
                  team: team.key,
                  roleId: row.roleId,
                  userId: p.userId,
                })
              }
              done={`${p.name} is no longer ${row.isLead ? "a lead of" : `${withArticle(row.name)} in`} ${team.label}.`}
            >
              Take off
            </OneTap>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- The picker ------------------------------------------------------------------

function Picker({
  team,
  row,
  everyone,
  onClose,
}: {
  team: HelpWantedTeamView;
  row: HelpWantedRoleView;
  everyone: PickablePerson[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [pick, setPick] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const byId = new Map(everyone.map((p) => [p.userId, p]));
  const groups = pickerGroups({
    keen: (row.keen ?? []).map((k) => k.userId),
    team: team.memberIds ?? [],
    everyone: everyone.map((p) => p.userId),
    taken: row.people.flatMap((p) => (p.userId ? [p.userId] : [])),
  });
  const q = query.trim().toLowerCase();
  const show = (ids: string[]) =>
    ids.flatMap((id) => {
      const p = byId.get(id);
      return p && (!q || p.name.toLowerCase().includes(q)) ? [p] : [];
    });
  const inTeam = new Set(team.memberIds ?? []);
  const held = (userId: string) => {
    const names = team.rows
      .filter((r) => r.people.some((p) => p.userId === userId))
      .map((r) => r.name);
    return names.length ? names.join(", ") : "No role yet";
  };
  const elsewhere = (p: PickablePerson) => {
    const others = p.teamKeys
      .map((k, i) => (k === team.key ? null : p.teams[i]))
      .filter(Boolean);
    return others.length ? `In ${others.join(", ")}` : "Not in a team yet";
  };

  const sections: {
    title: string;
    people: PickablePerson[];
    describe: (p: PickablePerson) => string;
  }[] = [
    {
      title: "Keen",
      people: show(groups.keen),
      describe: (p) =>
        inTeam.has(p.userId)
          ? `Keen · in ${team.label} · ${held(p.userId)}`
          : `Keen · not in ${team.label} yet`,
    },
    {
      title: `In ${team.label}`,
      people: show(groups.team),
      describe: (p) => held(p.userId),
    },
    { title: "Everyone else", people: show(groups.rest), describe: elsewhere },
  ];

  const chosen = pick ? byId.get(pick) : undefined;
  const joins = chosen ? !inTeam.has(chosen.userId) : false;
  const what = !chosen
    ? "Pick one person."
    : row.isLead
      ? `${chosen.name} becomes a lead of ${team.label}${joins ? " and joins the team" : ""}.`
      : `${chosen.name} becomes ${withArticle(row.name)}${joins ? ` and joins ${team.label}` : ""}.`;

  function give() {
    if (!chosen) return;
    setError(null);
    start(async () => {
      const result = await giveTeamRoleAction({
        team: team.key,
        roleId: row.roleId,
        userId: chosen.userId,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(
        row.isLead
          ? `${chosen.name} is a lead of ${team.label} now.`
          : `${chosen.name} is ${withArticle(row.name)} in ${team.label} now.`,
      );
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col">
        <DialogHeader>
          <DialogTitle>
            {row.isLead
              ? `A lead for ${team.label}`
              : `${row.name} · ${team.label}`}
          </DialogTitle>
          <DialogDescription>
            {row.filled} of {row.places} filled
            {row.note && !row.isLead ? ` · ${row.note}` : ""}
          </DialogDescription>
        </DialogHeader>
        <label className="relative block">
          <span className="sr-only">Search by name</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            className="pl-9"
            placeholder="Search by name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div
          role="radiogroup"
          aria-label="Who"
          className="flex min-h-0 flex-col gap-3 overflow-y-auto"
        >
          {sections.map((s) =>
            s.people.length === 0 ? null : (
              <div key={s.title} className="flex flex-col gap-1.5">
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {s.title} · {s.people.length}
                </p>
                {s.people.map((p) => (
                  <label
                    key={p.userId}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 border border-border px-3 py-2",
                      pick === p.userId && "border-primary bg-primary/15",
                    )}
                  >
                    <input
                      type="radio"
                      name="pick"
                      value={p.userId}
                      checked={pick === p.userId}
                      onChange={() => setPick(p.userId)}
                      className="accent-[var(--primary)]"
                    />
                    <span className="flex flex-col">
                      <span className="font-semibold">{p.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {s.describe(p)}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            ),
          )}
          {sections.every((s) => s.people.length === 0) && (
            <p className={QUIET}>Nobody matches.</p>
          )}
        </div>
        <p className="text-sm">{what}</p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={give} disabled={!chosen || pending}>
            {pending && <Spinner size="sm" label="Saving…" />}
            Give them the role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
