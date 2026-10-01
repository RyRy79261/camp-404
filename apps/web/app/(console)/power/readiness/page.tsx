import Link from "next/link";
import { CAMP_TIME_ZONE, campDayKey } from "@camp404/core";
import { POWER_WORK_PLAN_TEMPLATE } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { PowerFrame } from "@/components/power/power-frame";
import {
  CardHead,
  Chip,
  EmptyNote,
  GroupHead,
  PowerCard,
  Row,
  RowName,
  SectionHead,
  TONE_TEXT,
  Verdict,
  narrow,
  wide,
} from "@/components/power/power-ui";
import {
  AddCheckButton,
  AddWorkPlanButton,
  ItemEdit,
  ItemTick,
  StartChecklistButton,
  type MemberOption,
} from "@/components/power/readiness-controls";
import { getGenerator, type GeneratorRow } from "@/lib/power";
import { GENERATOR_OWNER_LABELS, formatNumber } from "@/lib/power-copy";
import { getPowerOverview, powerViewer } from "@/lib/power-overview";
import {
  listWorkPlanTasks,
  previousWorkPlanCycle,
  type ReadinessItemRow as ItemRow,
} from "@/lib/power-site";
import { listAssignableMembers } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export const metadata = { title: "Readiness — Camp 404" };

// Before the burn (#257) in the Power program's answer rail: the plan's
// generator's checklist (who sees to each check and by when), any other
// generator's folded under it, and the team's work plan on the task board.
// Every approved member reads it; a captain or a Power & Lighting lead ticks
// and edits it. Sharing with a neighbouring camp is its own section now.

const TASK_STATUS: Record<
  string,
  { label: string; tone: "info" | "mute" | "ok" }
> = {
  open: { label: "To do", tone: "mute" },
  in_progress: { label: "Doing", tone: "info" },
  done: { label: "Done", tone: "ok" },
};

/** "15 Apr" from a YYYY-MM-DD day. */
function dayText(day: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

/** "12 Mar" from an instant, in camp time. */
function doneText(at: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: CAMP_TIME_ZONE,
  }).format(at);
}

const COLS = {
  edit: "grid-cols-[24px_minmax(0,1fr)_56px] page-sm:grid-cols-[24px_minmax(0,1fr)_128px_88px_64px]",
  read: "grid-cols-[24px_minmax(0,1fr)] page-sm:grid-cols-[24px_minmax(0,1fr)_128px_88px]",
};

function CheckRow({
  item,
  members,
  canEdit,
  today,
}: {
  item: ItemRow;
  members: MemberOption[];
  canEdit: boolean;
  today: string;
}) {
  const done = item.doneAt !== null;
  const overdue = !done && item.dueOn !== null && item.dueOn < today;
  const who = done ? (item.doneByName ?? item.ownerName) : item.ownerName;
  const when = done
    ? `done ${doneText(item.doneAt!)}`
    : item.dueOn
      ? `${overdue ? "was due" : "by"} ${dayText(item.dueOn)}`
      : null;
  const whenNode = when ? (
    <span className={overdue ? TONE_TEXT.bad : undefined}>{when}</span>
  ) : null;
  const editable = {
    id: item.id,
    version: item.version,
    label: item.label,
    ownerUserId: item.ownerUserId,
    dueOn: item.dueOn,
    done,
  };
  return (
    <Row cols={canEdit ? COLS.edit : COLS.read} label={item.label}>
      <div className="flex items-center justify-center">
        {canEdit ? (
          <ItemTick item={editable} />
        ) : done ? (
          <span aria-label="Done" className="font-extrabold text-success">
            ✓
          </span>
        ) : (
          <span
            aria-label="Not done"
            className="block size-5 border border-dashed border-border"
          />
        )}
      </div>
      <RowName
        muted={done}
        name={item.label}
        sub={
          who || whenNode ? (
            <span className={narrow}>
              {who}
              {who && whenNode ? " · " : ""}
              {whenNode}
            </span>
          ) : undefined
        }
      />
      <div className={`truncate text-muted-foreground ${wide}`}>{who}</div>
      <div className={`whitespace-nowrap text-muted-foreground ${wide}`}>
        {whenNode}
      </div>
      {canEdit && (
        <div className="flex justify-end">
          <ItemEdit item={editable} members={members} />
        </div>
      )}
    </Row>
  );
}

function Checklist({
  items,
  members,
  canEdit,
  today,
}: {
  items: ItemRow[];
  members: MemberOption[];
  canEdit: boolean;
  today: string;
}) {
  const todo = items.filter((i) => i.doneAt === null);
  const done = items.filter((i) => i.doneAt !== null);
  const plural = (n: number) => `${n} check${n === 1 ? "" : "s"}`;
  return (
    <>
      <CardHead title="To do" meta={plural(todo.length)} />
      <div role="list" aria-label="To do">
        {todo.map((item) => (
          <CheckRow
            key={`${item.id}:${item.version}`}
            item={item}
            members={members}
            canEdit={canEdit}
            today={today}
          />
        ))}
      </div>
      {done.length > 0 && (
        <>
          <GroupHead label="Done" figure={plural(done.length)} />
          <div role="list" aria-label="Done">
            {done.map((item) => (
              <CheckRow
                key={`${item.id}:${item.version}`}
                item={item}
                members={members}
                canEdit={canEdit}
                today={today}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}

async function ReadinessSection() {
  const [{ canEdit }, o] = await Promise.all([
    powerViewer(),
    getPowerOverview(),
  ]);
  const [workPlan, earlierPlan, members] = await Promise.all([
    listWorkPlanTasks(),
    previousWorkPlanCycle(),
    // Only an editor gives a check to someone.
    canEdit ? listAssignableMembers() : Promise.resolve([]),
  ]);

  // A generator archived since its checklist was started still shows this
  // year's checks.
  const byId = new Map(o.generators.map((g) => [g.id, g]));
  const archivedIds = [...new Set(o.items.map((i) => i.generatorId))].filter(
    (id) => !byId.has(id) && id !== o.generator?.id,
  );
  const archived = (
    await Promise.all(archivedIds.map((id) => getGenerator(id)))
  ).filter((g): g is GeneratorRow => g !== null);
  const main = o.generator;
  const others = [...o.generators, ...archived].filter(
    (g) => g.id !== main?.id,
  );
  const today = campDayKey(new Date());
  const mine = main ? o.items.filter((i) => i.generatorId === main.id) : [];
  const doneCount = mine.filter((i) => i.doneAt !== null).length;
  const memberOptions = members.map((m) => ({
    id: m.id,
    displayName: m.displayName,
  }));

  return (
    <>
      <SectionHead
        title="Readiness"
        sentence="Getting the generator ready before the burn."
        actions={
          canEdit && main && mine.length > 0 && main.archivedAt === null ? (
            <AddCheckButton generatorId={main.id} model={main.model} />
          ) : undefined
        }
      />

      {!main ? (
        <PowerCard label="The answer">
          <EmptyNote title="No generator chosen yet.">
            Choose the camp&apos;s generator in the fuel estimate&apos;s plan,
            and its checklist starts here.
          </EmptyNote>
        </PowerCard>
      ) : mine.length === 0 ? (
        <PowerCard label="The answer">
          <EmptyNote
            title={`The ${main.model}'s checklist is not started.`}
            action={
              canEdit && main.archivedAt === null ? (
                <StartChecklistButton
                  generatorId={main.id}
                  model={main.model}
                />
              ) : undefined
            }
          >
            It starts with the usual checks: oil, spark plug, a test run under
            load, transport and the rest.
          </EmptyNote>
        </PowerCard>
      ) : (
        <>
          <Verdict
            gauge={{
              pct: (doneCount / mine.length) * 100,
              tone: doneCount === mine.length ? "ok" : "neutral",
              label: `${formatNumber((doneCount / mine.length) * 100, 0)}%`,
            }}
          >
            <b>
              {doneCount} of {mine.length} checks
            </b>{" "}
            done on the {main.model}.
          </Verdict>
          <PowerCard label={`${main.model} checklist`}>
            <Checklist
              items={mine}
              members={memberOptions}
              canEdit={canEdit}
              today={today}
            />
          </PowerCard>
        </>
      )}

      {others.map((gen) => {
        const items = o.items.filter((i) => i.generatorId === gen.id);
        const done = items.filter((i) => i.doneAt !== null).length;
        return (
          <details key={gen.id} className="mb-4 border border-border bg-card">
            <summary className="cursor-pointer p-4 text-sm font-semibold">
              {gen.model} ({GENERATOR_OWNER_LABELS[gen.owner].toLowerCase()})
              {gen.archivedAt !== null ? " · archived" : " · spare"} ·{" "}
              {items.length === 0
                ? "not started"
                : `${done} of ${items.length} done`}
            </summary>
            {items.length === 0 ? (
              <EmptyNote
                title="Not started this year."
                action={
                  canEdit && gen.archivedAt === null ? (
                    <StartChecklistButton
                      generatorId={gen.id}
                      model={gen.model}
                    />
                  ) : undefined
                }
              >
                It only matters if the camp ends up running this one.
              </EmptyNote>
            ) : (
              <>
                <Checklist
                  items={items}
                  members={memberOptions}
                  canEdit={canEdit}
                  today={today}
                />
                {canEdit && gen.archivedAt === null && (
                  <div className="border-t border-border p-3 page-sm:px-4">
                    <AddCheckButton
                      generatorId={gen.id}
                      model={gen.model}
                      variant="outline"
                    />
                  </div>
                )}
              </>
            )}
          </details>
        );
      })}

      <PowerCard label="Work plan">
        <CardHead
          title="Work plan"
          meta="The team's tasks on the task board"
          actions={
            workPlan.length > 0 ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/tasks">Open the task board</Link>
              </Button>
            ) : canEdit ? (
              <AddWorkPlanButton fromCycle={earlierPlan} />
            ) : undefined
          }
        />
        {workPlan.length === 0 ? (
          <EmptyNote title="Not on the task board yet.">
            {earlierPlan === null
              ? `It starts as ${POWER_WORK_PLAN_TEMPLATE.length} tasks: ${POWER_WORK_PLAN_TEMPLATE.map((t) => t.title.split(":")[0]).join(", ")}.`
              : `It copies ${earlierPlan}'s tasks as the team left them.`}
          </EmptyNote>
        ) : (
          <div role="list" aria-label="Work plan tasks">
            {workPlan.map((t) => {
              const status = TASK_STATUS[t.status] ?? {
                label: t.status,
                tone: "mute" as const,
              };
              return (
                <Row
                  key={t.taskId}
                  label={t.title}
                  cols="grid-cols-1 page-sm:grid-cols-[minmax(0,1fr)_128px_88px]"
                >
                  <RowName
                    muted={t.status === "done"}
                    name={t.title}
                    sub={
                      <span className={`flex items-center gap-2 ${narrow}`}>
                        {t.assigneeName && <span>{t.assigneeName}</span>}
                        <Chip tone={status.tone}>{status.label}</Chip>
                      </span>
                    }
                  />
                  <div className={`truncate text-muted-foreground ${wide}`}>
                    {t.assigneeName}
                  </div>
                  <div className={`text-right ${wide}`}>
                    <Chip tone={status.tone}>{status.label}</Chip>
                  </div>
                </Row>
              );
            })}
          </div>
        )}
      </PowerCard>
    </>
  );
}

export default function PowerReadinessPage() {
  return (
    <PowerFrame section="readiness">
      <ReadinessSection />
    </PowerFrame>
  );
}
