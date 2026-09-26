import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarDays,
  Circle,
  CircleCheck,
  ClipboardList,
  Gavel,
  ListChecks,
  NotebookPen,
  Pencil,
  User,
  Users,
} from "lucide-react";
import { canWorkInTeam } from "@camp404/core";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { MarkdownBody } from "@/components/announcements/markdown-body";
import { getTeamsConfig } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import { getMeetingNote } from "@/lib/meeting-notes";
import {
  actionItemDue,
  meetingsHref,
  meetingWhen,
  TASK_STATUS_LABEL,
} from "@/lib/meeting-notes-view";
import { getLeadTeams, getMyTeams } from "@/lib/users";
import { MakeTaskButton } from "./make-task-button";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const note = await getMeetingNote(id);
  return { title: note ? `${note.title} — Camp 404` : "Meeting — Camp 404" };
}

// One meeting note in full (#268): the agenda, the notes, what was decided and
// who does what next, with who was there beside them. The composition is the
// team page's: the main cards on the left, the people beside. Every approved
// member reads it; the team's members and captains get Edit, and a captain or
// a lead of the team gets "Add to tasks" on each action item (the task
// board's own rule, checked again inside the write).

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof NotebookPen;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-accent" aria-hidden />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default async function MeetingNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { campUser, rank } = await captainPageGate("camp_member");
  const { id } = await params;
  const note = await getMeetingNote(id);
  if (!note) notFound();

  const [config, memberships, leadTeams] = await Promise.all([
    getTeamsConfig(),
    getMyTeams(campUser.id),
    rank === "team_lead" ? getLeadTeams(campUser.id) : Promise.resolve([]),
  ]);
  const teamLabel = note.team
    ? (config.teams.find((t) => t.key === note.team)?.label ?? note.team)
    : "Whole camp";
  const canEdit = canWorkInTeam(
    rank,
    memberships.map((m) => m.team),
    note.team,
  );
  // The task board's rule: a captain, or a lead of the note's team.
  const canMakeTasks =
    rank === "captain" || (note.team !== null && leadTeams.includes(note.team));

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Camp / Meetings"
        title={note.title}
        description={`${meetingWhen(note.heldAt)} · ${teamLabel}`}
        actions={
          canEdit ? (
            <Button asChild variant="outline">
              <Link href={`/meetings/${note.id}/edit`}>
                <Pencil aria-hidden />
                Edit
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="-mt-3 mb-6 flex flex-wrap gap-2" aria-label="Meeting">
        <Link href={meetingsHref(note.team)} className="rounded-md">
          <Badge variant="outline" className="hover:border-accent/60">
            {note.team ? `${teamLabel} meetings` : "Whole-camp meetings"}
          </Badge>
        </Link>
        {note.calendarEventId ? (
          <Badge variant="outline" className="gap-1">
            <CalendarDays className="h-3 w-3" aria-hidden />
            On the calendar
            {note.calendarEventTitle ? `: ${note.calendarEventTitle}` : ""}
          </Badge>
        ) : null}
        {note.createdByName ? (
          <Badge variant="outline">Written up by {note.createdByName}</Badge>
        ) : null}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 page-lg:grid-cols-3">
        <div className="flex flex-col gap-6 page-lg:col-span-2">
          <Section title="Agenda" icon={ClipboardList}>
            {note.agenda ? (
              <MarkdownBody className="text-sm text-foreground">
                {note.agenda}
              </MarkdownBody>
            ) : (
              <p className="text-sm text-muted-foreground">
                No agenda written.
              </p>
            )}
          </Section>

          <Section title="Notes" icon={NotebookPen}>
            {note.notes ? (
              <MarkdownBody className="text-sm text-foreground">
                {note.notes}
              </MarkdownBody>
            ) : (
              <p className="text-sm text-muted-foreground">No notes yet.</p>
            )}
          </Section>

          <Section title="Decisions" icon={Gavel}>
            {note.decisions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing decided on record.
              </p>
            ) : (
              <ol
                aria-label="Decisions"
                className="-my-3 divide-y divide-border"
              >
                {note.decisions.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-start gap-3 py-3 text-sm [overflow-wrap:anywhere]"
                  >
                    <CircleCheck
                      className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                      aria-hidden
                    />
                    {d.text}
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <Section title="Action items" icon={ListChecks}>
            {note.actionItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No action items.</p>
            ) : (
              <ul
                aria-label="Action items"
                className="-my-3 divide-y divide-border"
              >
                {note.actionItems.map((item) => {
                  const meta = [
                    item.assigneeName ?? "Nobody yet",
                    item.dueOn ? actionItemDue(item.dueOn) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <li
                      key={item.id}
                      className="grid grid-cols-[1rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 py-3 sm:grid-cols-[1rem_minmax(0,1fr)_auto]"
                    >
                      <Circle
                        className="h-4 w-4 text-muted-foreground"
                        aria-hidden
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium [overflow-wrap:anywhere]">
                          {item.text}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {meta}
                        </span>
                      </span>
                      {item.task ? (
                        <span className="col-start-2 flex sm:col-start-3 sm:row-start-1 sm:justify-end">
                          <Link href="/tasks" className="rounded-md">
                            <Badge
                              variant={
                                item.task.status === "done"
                                  ? "default"
                                  : "outline"
                              }
                            >
                              Task · {TASK_STATUS_LABEL[item.task.status]}
                            </Badge>
                          </Link>
                        </span>
                      ) : canMakeTasks ? (
                        <span className="col-start-2 flex sm:col-start-3 sm:row-start-1 sm:justify-end">
                          <MakeTaskButton itemId={item.id} text={item.text} />
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>

        <Card className="self-start">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-accent" aria-hidden />
              Who was there
            </CardTitle>
          </CardHeader>
          <CardContent>
            {note.attendees.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nobody ticked yet.
              </p>
            ) : (
              <ul aria-label="Attendees" className="divide-y divide-border">
                {note.attendees.map((person) => (
                  <li
                    key={person.id}
                    className="flex items-center gap-3 py-2.5"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
                      <User className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {person.displayName}
                      {person.id === campUser.id ? (
                        <span className="text-muted-foreground"> (you)</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
