"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  Users,
  X,
} from "lucide-react";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { Card } from "@camp404/ui/components/card";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { InputField } from "@camp404/ui/components/input-field";
import { Label } from "@camp404/ui/components/label";
import { Switch } from "@camp404/ui/components/switch";
import { toast } from "@camp404/ui/components/toast";
import { cn } from "@camp404/ui/lib/utils";
import {
  moveTeamAction,
  renameTeamAction,
  setTeamArchivedAction,
  type TeamSettingsResult,
} from "./actions";

// Captain-only team editor (Phase 2). The server page passes the full team list
// (active + archived), order-sorted; this island edits it one operation at a
// time — rename / reorder / archive — each persisted via a server action and
// re-read with router.refresh() (no optimistic UI; the server stays the truth).
//
// Feedback, as on every captain screen: a problem with the typed name shows on
// the name field; a failed one-tap move or archive is a toast. Only the control
// that was used spins, and no second change starts while one runs.
//
// No board draws this editor; it is built from the kit (40px icon buttons,
// EmptyState, InputField, Switch).

// The server refuses to archive below this (MIN_ACTIVE_TEAMS in ./actions);
// the switch says so before the captain tries.
const MIN_ACTIVE_TEAMS = 2;

type Busy = { key: string; action: "up" | "down" | "archive" | "rename" };
type Control = "up" | "down" | "rename";

// The row shape the editor renders. Structurally a TeamConfigEntry; kept as a
// local structural type (like the roster toolbar's `teams` prop) so this client
// island doesn't import the DB package, and exported so the server page that
// builds the data conforms to the same contract.
export type TeamRow = {
  key: string;
  label: string;
  order: number;
  archived: boolean;
};

export function TeamSettingsManager({ teams }: { teams: TeamRow[] }) {
  const router = useRouter();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [pending, startTransition] = useTransition();
  // A running change disables every control, which drops keyboard focus, and
  // leaving rename mode removes the input that had it. Once the change lands,
  // focus goes back to the control that was used (or the nearest enabled one
  // on that row), so a keyboard user stays where they were.
  const controls = useRef(new Map<string, HTMLButtonElement>());
  const returnFocusTo = useRef<{ key: string; control: Control } | null>(null);
  const controlRef =
    (key: string, control: Control) => (el: HTMLButtonElement | null) => {
      if (el) controls.current.set(`${key}:${control}`, el);
      else controls.current.delete(`${key}:${control}`);
    };

  useEffect(() => {
    const target = returnFocusTo.current;
    if (target === null || editingKey !== null || pending) return;
    returnFocusTo.current = null;
    const order: Control[] =
      target.control === "up"
        ? ["up", "down", "rename"]
        : target.control === "down"
          ? ["down", "up", "rename"]
          : ["rename"];
    const el = order
      .map((control) => controls.current.get(`${target.key}:${control}`))
      .find((button) => button && !button.disabled);
    el?.focus();
  }, [editingKey, pending]);

  const activeCount = teams.filter((t) => !t.archived).length;
  const atMinimum = activeCount <= MIN_ACTIVE_TEAMS;

  function run(
    next: Busy,
    action: () => Promise<TeamSettingsResult>,
    onOk: () => void,
    onError: (message: string) => void = (message) => toast.error(message),
  ) {
    setBusy(next);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        onError(result.error);
        return;
      }
      onOk();
      router.refresh();
    });
  }

  function startEdit(team: TeamRow) {
    setRenameError(null);
    setEditingKey(team.key);
    setDraftLabel(team.label);
  }

  function cancelEdit() {
    if (editingKey)
      returnFocusTo.current = { key: editingKey, control: "rename" };
    setEditingKey(null);
    setDraftLabel("");
    setRenameError(null);
  }

  function saveEdit(team: TeamRow) {
    const label = draftLabel.trim();
    if (!label) {
      // Emptied then Enter/Save: keep the row in edit mode with a hint rather
      // than silently discarding the draft (the Save button is also disabled).
      setRenameError("A team needs a name.");
      return;
    }
    if (label === team.label) {
      cancelEdit();
      return;
    }
    setRenameError(null);
    run(
      { key: team.key, action: "rename" },
      () => renameTeamAction(team.key, label),
      () => {
        toast.success("Team renamed");
        cancelEdit();
      },
      setRenameError,
    );
  }

  function move(team: TeamRow, direction: "up" | "down") {
    returnFocusTo.current = { key: team.key, control: direction };
    run(
      { key: team.key, action: direction },
      () => moveTeamAction(team.key, direction),
      () => toast.success(`${team.label} moved ${direction}`),
    );
  }

  if (teams.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Users aria-hidden />}
          title="No teams yet."
          description="The camp's teams appear here once they are set up."
        />
      </Card>
    );
  }

  const spins = (key: string, action: Busy["action"]) =>
    pending && busy?.key === key && busy.action === action;

  return (
    <div className="flex flex-col gap-4">
      {atMinimum && (
        <p
          id="team-minimum-active"
          className="text-caption text-muted-foreground"
        >
          Only {activeCount} teams are active, and a camp needs at least{" "}
          {MIN_ACTIVE_TEAMS}. Restore a team before you archive another.
        </p>
      )}

      <Card className="divide-y divide-border p-0">
        <ul>
          {teams.map((team, index) => {
            const editing = editingKey === team.key;
            return (
              <li
                key={team.key}
                className={cn(
                  "flex items-center gap-3 px-4 py-3",
                  team.archived && "opacity-60",
                )}
              >
                {/* Reorder controls: 40px targets, stacked with a gap. */}
                <div className="flex flex-col gap-1">
                  <Button
                    ref={controlRef(team.key, "up")}
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${team.label} up`}
                    disabled={pending || index === 0}
                    onClick={() => move(team, "up")}
                  >
                    {spins(team.key, "up") ? (
                      <Loader2 className="animate-spin" aria-hidden />
                    ) : (
                      <ChevronUp aria-hidden />
                    )}
                  </Button>
                  <Button
                    ref={controlRef(team.key, "down")}
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${team.label} down`}
                    disabled={pending || index === teams.length - 1}
                    onClick={() => move(team, "down")}
                  >
                    {spins(team.key, "down") ? (
                      <Loader2 className="animate-spin" aria-hidden />
                    ) : (
                      <ChevronDown aria-hidden />
                    )}
                  </Button>
                </div>

                {/* Label — read mode (name + rename) or edit mode (input). */}
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <div className="flex items-start gap-2">
                      <InputField
                        label={
                          <span className="sr-only">Rename {team.label}</span>
                        }
                        wrapperClassName="flex-1 gap-0 [&>p]:mt-1"
                        value={draftLabel}
                        autoFocus
                        maxLength={40}
                        error={renameError ?? undefined}
                        disabled={pending}
                        onChange={(e) => {
                          setDraftLabel(e.target.value);
                          setRenameError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(team);
                          if (e.key === "Escape") cancelEdit();
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Save name for ${team.label}`}
                        disabled={pending || draftLabel.trim().length === 0}
                        onClick={() => saveEdit(team)}
                      >
                        {spins(team.key, "rename") ? (
                          <Loader2 className="animate-spin" aria-hidden />
                        ) : (
                          <Check aria-hidden />
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Cancel rename"
                        disabled={pending}
                        onClick={cancelEdit}
                      >
                        <X aria-hidden />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{team.label}</span>
                      {team.archived && (
                        <Badge variant="outline">Archived</Badge>
                      )}
                      <Button
                        ref={controlRef(team.key, "rename")}
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Rename ${team.label}`}
                        disabled={pending}
                        onClick={() => startEdit(team)}
                      >
                        <Pencil aria-hidden />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Archive toggle. */}
                <div className="flex shrink-0 items-center gap-2">
                  {spins(team.key, "archive") ? (
                    <Loader2
                      className="size-4 animate-spin text-muted-foreground"
                      aria-hidden
                    />
                  ) : (
                    <Label
                      htmlFor={`archived-${team.key}`}
                      className="text-caption text-muted-foreground"
                    >
                      Active
                    </Label>
                  )}
                  <Switch
                    id={`archived-${team.key}`}
                    checked={!team.archived}
                    // An active team at the minimum cannot be archived; an
                    // archived one can always come back.
                    disabled={pending || (!team.archived && atMinimum)}
                    aria-describedby={
                      !team.archived && atMinimum
                        ? "team-minimum-active"
                        : undefined
                    }
                    aria-label={`${team.label} active`}
                    onCheckedChange={(checked) =>
                      run(
                        { key: team.key, action: "archive" },
                        () => setTeamArchivedAction(team.key, !checked),
                        () =>
                          toast.success(
                            checked ? "Team restored" : "Team archived",
                          ),
                      )
                    }
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <p className="text-caption text-muted-foreground">
        Renaming, reordering, or archiving a team updates the roster and the
        sign-up questionnaire right away. Archived teams stay valid on existing
        profiles; at least two teams must stay active.
      </p>
    </div>
  );
}
