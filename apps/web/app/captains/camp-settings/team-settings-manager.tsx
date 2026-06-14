"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, Pencil, TriangleAlert, X } from "lucide-react";
import { Alert } from "@camp404/ui/components/alert";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { Card } from "@camp404/ui/components/card";
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
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<TeamSettingsResult>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onOk?.();
      router.refresh();
    });
  }

  function startEdit(team: TeamRow) {
    setError(null);
    setEditingKey(team.key);
    setDraftLabel(team.label);
  }

  function cancelEdit() {
    setEditingKey(null);
    setDraftLabel("");
  }

  function saveEdit(team: TeamRow) {
    const label = draftLabel.trim();
    if (!label) {
      // Emptied then Enter/Save: keep the row in edit mode with a hint rather
      // than silently discarding the draft (the Save button is also disabled).
      setError("A team needs a name.");
      return;
    }
    if (label === team.label) {
      cancelEdit();
      return;
    }
    run(() => renameTeamAction(team.key, label), () => {
      toast.success("Team renamed");
      cancelEdit();
    });
  }

  if (teams.length === 0) {
    return (
      <Alert variant="info">
        <span>No teams are configured yet.</span>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert variant="error">
          <TriangleAlert aria-hidden />
          <span>{error}</span>
        </Alert>
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
                {/* Reorder controls. */}
                <div className="flex flex-col">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    aria-label={`Move ${team.label} up`}
                    disabled={pending || index === 0}
                    onClick={() => run(() => moveTeamAction(team.key, "up"))}
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    aria-label={`Move ${team.label} down`}
                    disabled={pending || index === teams.length - 1}
                    onClick={() => run(() => moveTeamAction(team.key, "down"))}
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden />
                  </Button>
                </div>

                {/* Label — read mode (name + rename) or edit mode (input). */}
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <div className="flex items-center gap-2">
                      <InputField
                        label={`Rename ${team.label}`}
                        wrapperClassName="flex-1"
                        value={draftLabel}
                        autoFocus
                        maxLength={40}
                        onChange={(e) => setDraftLabel(e.target.value)}
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
                        <Check className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Cancel rename"
                        disabled={pending}
                        onClick={cancelEdit}
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{team.label}</span>
                      {team.archived && (
                        <Badge variant="outline">Archived</Badge>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={`Rename ${team.label}`}
                        disabled={pending}
                        onClick={() => startEdit(team)}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Archive toggle. */}
                <div className="flex shrink-0 items-center gap-2">
                  <Label
                    htmlFor={`archived-${team.key}`}
                    className="text-caption text-muted-foreground"
                  >
                    Active
                  </Label>
                  <Switch
                    id={`archived-${team.key}`}
                    checked={!team.archived}
                    disabled={pending}
                    aria-label={`${team.label} active`}
                    onCheckedChange={(checked) =>
                      run(
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
        Renaming, reordering, or archiving a team updates the roster right away.
        The sign-up questionnaire keeps its current team names until a later
        update.
      </p>
    </div>
  );
}
