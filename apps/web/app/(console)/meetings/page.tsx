import Link from "next/link";
import { NotebookPen, Plus } from "lucide-react";
import { canWorkInTeam } from "@camp404/core";
import { Team } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { Card, CardContent } from "@camp404/ui/components/card";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { MeetingRow } from "@/components/meetings/meeting-row";
import { activeTeams, getTeamsConfig } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import { listMeetingNotes } from "@/lib/meeting-notes";
import { newMeetingHref, WHOLE_CAMP_MEETINGS } from "@/lib/meeting-notes-view";
import { getMyTeams } from "@/lib/users";
import {
  ALL_MEETINGS,
  MeetingsFilter,
  type MeetingsFilterOption,
} from "./meetings-filter";

export const dynamic = "force-dynamic";

export const metadata = { title: "Meetings — Camp 404" };

// Meeting notes (#268): what each team's meetings, and the whole camp's,
// planned, decided and handed out, newest meeting first, with a team filter.
// Every approved member reads every note. A team's members this year and
// captains write its notes; a whole-camp note is a captain's. The rows are the
// team page's rows and the filter is the Calendar page's.

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const { campUser, rank } = await captainPageGate("camp_member");
  const [config, memberships, { team: requested }] = await Promise.all([
    getTeamsConfig(),
    getMyTeams(campUser.id),
    searchParams,
  ]);
  const myTeams = memberships.map((m) => m.team);
  const labels = Object.fromEntries(config.teams.map((t) => [t.key, t.label]));

  // A team the config names (archived ones too, so an old link still works),
  // or the whole camp; anything else is every meeting.
  const filter: Team | "camp" | undefined =
    requested === WHOLE_CAMP_MEETINGS
      ? "camp"
      : requested &&
          config.teams.some((t) => t.key === requested) &&
          Team.safeParse(requested).success
        ? (requested as Team)
        : undefined;
  const notes = await listMeetingNotes({ team: filter });

  const options: MeetingsFilterOption[] = activeTeams(config).map((t) => ({
    value: t.key,
    label: t.label,
  }));
  if (filter && filter !== "camp" && !options.some((o) => o.value === filter)) {
    options.push({ value: filter, label: labels[filter] ?? filter });
  }

  // "New meeting" where the viewer may write: for the team filtered to, or
  // (unfiltered) for any team they are on, or anything as a captain.
  const newHref =
    filter === undefined
      ? rank === "captain" || myTeams.length > 0
        ? "/meetings/new"
        : null
      : canWorkInTeam(rank, myTeams, filter === "camp" ? null : filter)
        ? newMeetingHref(filter === "camp" ? null : filter)
        : null;

  const scope =
    filter === "camp"
      ? "whole-camp"
      : filter
        ? `${labels[filter] ?? filter}`
        : null;

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Camp / Meetings"
        title="Meetings"
        description="What each meeting planned, decided and handed out, newest first. A team's members write its notes; captains write the whole camp's."
        actions={
          newHref ? (
            <Button asChild>
              <Link href={newHref}>
                <Plus aria-hidden />
                New meeting
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-6">
        <MeetingsFilter
          value={filter ?? ALL_MEETINGS}
          teams={options}
          wholeCamp={WHOLE_CAMP_MEETINGS}
        />

        {notes.length === 0 ? (
          <EmptyState
            icon={<NotebookPen />}
            title={
              scope
                ? `No ${scope} meetings written up yet`
                : "No meetings written up yet"
            }
            description="When a meeting has been written up, it is listed here."
          />
        ) : (
          <Card>
            <CardContent className="py-3">
              <ul aria-label="Meetings" className="divide-y divide-border">
                {notes.map((note) => (
                  <li key={note.id}>
                    <MeetingRow
                      note={note}
                      teamLabel={
                        filter
                          ? undefined
                          : note.team
                            ? (labels[note.team] ?? note.team)
                            : "Whole camp"
                      }
                    />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
