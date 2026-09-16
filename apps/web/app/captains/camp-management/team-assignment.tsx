"use client";

import { useState, useTransition } from "react";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { Checkbox } from "@camp404/ui/components/checkbox";
import { Label } from "@camp404/ui/components/label";
import { Spinner } from "@camp404/ui/components/spinner";
import { Switch } from "@camp404/ui/components/switch";
import { teamLabel } from "./roster-presentation";
import {
  assignTeamAction,
  removeTeamAction,
  setTeamLeadAction,
  type AssignableTeam,
  type TeamAssignmentResult,
  type TeamMembership,
} from "./actions";

// Team assignment, inside the captain's member-profile panel (WP6, item 2.2).
// A captain ticks a team to put the member on it FOR THIS YEAR, and flips the
// Lead switch to make them its lead. Both go through the captain-gated actions
// in ./actions, which resolve the burn year server-side — nothing about the
// year namespace is a client concern.
//
// The pickable set is `assignableTeams`, which the action already narrowed to
// the camp config's ACTIVE teams: an archived team is not offered here, and the
// server refuses one anyway if a stale panel submits it. A membership on a
// since-archived team still renders below, with a Remove — archiving a team
// must not strand the members left on it.
//
// Every action answers with the member's refreshed membership list, so this
// re-renders from the server's truth rather than guessing at the outcome of a
// write it did not perform.

function labelFor(
  key: string,
  assignable: readonly AssignableTeam[],
  teamLabels: Record<string, string>,
): string {
  return (
    assignable.find((t) => t.key === key)?.label ??
    teamLabels[key] ??
    teamLabel(key)
  );
}

export function TeamAssignment({
  userId,
  teams,
  assignableTeams,
  teamLabels = {},
  onChange,
}: {
  userId: string;
  /** The member's memberships for the camp's current year. */
  teams: TeamMembership[];
  /** Active teams a captain may assign to (archived already filtered out). */
  assignableTeams: AssignableTeam[];
  /** key → configured label, incl. archived teams, for the leftover rows. */
  teamLabels?: Record<string, string>;
  /** Hand the refreshed membership list back to the panel. */
  onChange: (teams: TeamMembership[]) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const membership = new Map(teams.map((t) => [t.team as string, t]));
  // Memberships that no longer correspond to an active team — the team was
  // archived after this member joined it. Removable, never re-assignable.
  const archived = teams.filter(
    (t) => !assignableTeams.some((a) => a.key === t.team),
  );

  function run(action: () => Promise<TeamAssignmentResult>) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onChange(res.teams);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className="font-mono text-micro font-bold uppercase tracking-wide text-muted-foreground">
          Teams
        </h3>
        {isPending && <Spinner size="sm" />}
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {assignableTeams.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No active teams to assign. Add one in camp settings.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {assignableTeams.map((team) => {
            const current = membership.get(team.key);
            const isMember = current !== undefined;
            return (
              <li
                key={team.key}
                className="flex items-center gap-3 rounded-md px-1 py-1.5"
              >
                <Checkbox
                  id={`team-${team.key}`}
                  checked={isMember}
                  disabled={isPending}
                  onCheckedChange={(checked) =>
                    run(() =>
                      checked === true
                        ? assignTeamAction(userId, team.key)
                        : removeTeamAction(userId, team.key),
                    )
                  }
                />
                <Label
                  htmlFor={`team-${team.key}`}
                  className="flex-1 cursor-pointer text-sm text-foreground"
                >
                  {team.label}
                </Label>
                {isMember && (
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor={`lead-${team.key}`}
                      className="font-mono text-micro uppercase tracking-wide text-muted-foreground"
                    >
                      Lead
                    </Label>
                    <Switch
                      id={`lead-${team.key}`}
                      checked={current.isLead}
                      disabled={isPending}
                      onCheckedChange={(checked) =>
                        run(() =>
                          setTeamLeadAction(userId, team.key, checked === true),
                        )
                      }
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {archived.length > 0 && (
        <ul className="flex flex-col gap-1 border-t pt-2">
          {archived.map((t) => (
            <li key={t.team} className="flex items-center gap-3 px-1 py-1.5">
              <span className="flex-1 text-sm text-muted-foreground">
                {labelFor(t.team, assignableTeams, teamLabels)}
              </span>
              <Badge variant="outline">Archived</Badge>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isPending}
                onClick={() => run(() => removeTeamAction(userId, t.team))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <p className="font-mono text-micro text-muted-foreground">
        Teams and lead roles are set per burn year — they start empty each year
        and last year&apos;s stay on file.
      </p>
    </div>
  );
}
