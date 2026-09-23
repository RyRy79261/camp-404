import { Team } from "@camp404/types";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { activeTeams, getTeamsConfig } from "@/lib/camp-config";
import { captainPageGate } from "@/lib/captain-gate";
import { presentTask } from "@/lib/task-board";
import { listAssignableMembers, listBoardTasks } from "@/lib/tasks";
import { getLeadTeams } from "@/lib/users";
import { TaskBoard, type TeamOption } from "./task-board";

export const dynamic = "force-dynamic";

export const metadata = { title: "Tasks — Camp 404" };

// The shared task board (owner, 2026-09-23: "a shared task list where all
// tasks can be seen and ordered by which team and who's responsible, with
// deadlines ... something like a Kanban board"). Every approved member sees
// every task. Captains and team leads add them; a lead only for a team they
// lead ("We also need a way to add tasks if you're a team lead or captain").
// AfrikaBurn's console has no board to copy, so the columns are the owner's
// pick; everything inside them is the kit's cards, badges and dialogs.

export default async function TasksPage() {
  const { campUser, rank } = await captainPageGate("camp_member");
  const isCaptain = rank === "captain";
  const leadTeams =
    rank === "team_lead"
      ? (await getLeadTeams(campUser.id)).filter(
          (t) => Team.safeParse(t).success,
        )
      : [];

  const now = new Date();
  const [tasks, members, config] = await Promise.all([
    listBoardTasks(now),
    listAssignableMembers(),
    getTeamsConfig(),
  ]);
  // Every team's label, archived ones too: an old task keeps its team's name.
  const teamLabels = Object.fromEntries(
    config.teams.map((t) => [t.key, t.label]),
  );
  const viewer = { id: campUser.id, isCaptain, leadTeams };
  const cards = tasks.map((task) =>
    presentTask(task, { viewer, now, teamLabels }),
  );

  // The teams the filter offers: active ones, plus any an old task still has.
  const filterTeams: TeamOption[] = [
    ...activeTeams(config).map((t) => ({ value: t.key, label: t.label })),
    ...[...new Set(cards.map((c) => c.team))]
      .filter(
        (key): key is string =>
          key !== null && !activeTeams(config).some((t) => t.key === key),
      )
      .map((key) => ({ value: key, label: teamLabels[key] ?? key })),
  ];
  // The teams this viewer may add a task for. The action checks it again.
  const addTeams: TeamOption[] = isCaptain
    ? activeTeams(config).map((t) => ({ value: t.key, label: t.label }))
    : activeTeams(config)
        .filter((t) => leadTeams.includes(t.key))
        .map((t) => ({ value: t.key, label: t.label }));

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Camp / Tasks"
        title="Tasks"
        description={
          isCaptain || addTeams.length > 0
            ? "Every task in camp, by team, who is responsible and when it is due. Move a card when the work moves."
            : "Every task in camp, by team, who is responsible and when it is due. Move your own cards when the work moves."
        }
      />
      <TaskBoard
        cards={cards}
        viewerId={campUser.id}
        members={members}
        filterTeams={filterTeams}
        addTeams={addTeams}
        canAddWithoutTeam={isCaptain}
      />
    </div>
  );
}
