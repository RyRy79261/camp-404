import Link from "next/link";
import {
  ClipboardCheck,
  Handshake,
  ListChecks,
  Lock,
  Printer,
} from "lucide-react";
import {
  campDayKey,
  canEditPower,
  fixedSplit,
  fuelForPlan,
  fuelSplit,
  powerTotals,
  splitLitres,
} from "@camp404/core";
import { POWER_WORK_PLAN_TEMPLATE } from "@camp404/types";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { cn } from "@camp404/ui/lib/utils";
import { PowerTabs } from "@/components/power/power-tabs";
import {
  AddReadinessItemForm,
  AddWorkPlanButton,
  ReadinessItemRow,
  SharingForm,
  StartChecklistButton,
} from "@/components/power/readiness-controls";
import { captainPageGate } from "@/lib/captain-gate";
import {
  getGenerator,
  getPowerPlan,
  listGenerators,
  listPowerLoads,
  type GeneratorRow,
} from "@/lib/power";
import {
  POWER_REFUSAL,
  PRINT_SHARING_PATH,
  formatNumber,
  litres,
} from "@/lib/power-copy";
import {
  getSharingAgreement,
  listReadinessItems,
  listWorkPlanTasks,
  previousWorkPlanCycle,
  type ReadinessItemRow as ItemRow,
} from "@/lib/power-site";
import { listAssignableMembers } from "@/lib/tasks";
import { getLeadTeams } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Generator readiness — Camp 404" };

// Before the burn (#257). Every approved member reads it; a captain or a
// Power & Lighting lead edits it. Three cards, as the power lead's plan has
// them: each generator's readiness checklist (owner, due day, done), the
// team's work plan on the task board, and a year's agreement to share a
// generator with a neighbouring camp, with the fuel split by each camp's
// share of the energy.
//
// The agreement names a camp and a contact ROLE, never a person's phone or
// email, and splits fuel in percent and litres, never money. It is shown
// inside the app only; the paper summary is for handing over on site.

const REFUSAL_ID = "power-readiness-refusal";

const TASK_STATUS: Record<string, string> = {
  open: "To do",
  in_progress: "In progress",
  done: "Done",
};

/** "Fri 10 Apr" from a YYYY-MM-DD day. */
function dayText(day: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

function ItemDetails({ item, today }: { item: ItemRow; today: string }) {
  const done = item.doneAt !== null;
  const overdue = !done && item.dueOn !== null && item.dueOn < today;
  return (
    <>
      <span
        className={cn("text-sm", done && "text-muted-foreground line-through")}
      >
        {item.label}
      </span>
      <span className="text-xs text-muted-foreground">
        {item.ownerName ?? "Nobody yet"}
        {" · "}
        {item.dueOn ? (
          <span className={cn(overdue && "font-medium text-destructive")}>
            {overdue ? "overdue, was due " : "due "}
            {dayText(item.dueOn)}
          </span>
        ) : (
          "no due day"
        )}
        {done && item.doneByName ? ` · done by ${item.doneByName}` : ""}
      </span>
    </>
  );
}

export default async function PowerReadinessPage() {
  // Every approved member reads it.
  const { campUser, rank } = await captainPageGate("camp_member");
  const leadTeams = rank === "team_lead" ? await getLeadTeams(campUser.id) : [];
  const canEdit = canEditPower(rank, leadTeams);

  const [
    generators,
    plan,
    items,
    workPlan,
    earlierPlan,
    agreement,
    loads,
    members,
  ] = await Promise.all([
    listGenerators(),
    getPowerPlan(),
    listReadinessItems(),
    listWorkPlanTasks(),
    previousWorkPlanCycle(),
    getSharingAgreement(),
    listPowerLoads(),
    // Only an editor gives an item to someone.
    canEdit ? listAssignableMembers() : Promise.resolve([]),
  ]);

  // The plan's generator first, then the rest; a generator archived since
  // its checklist was started still shows this year's items.
  const byId = new Map(generators.map((g) => [g.id, g]));
  const archivedIds = [...new Set(items.map((i) => i.generatorId))].filter(
    (id) => !byId.has(id),
  );
  const archived = (
    await Promise.all(archivedIds.map((id) => getGenerator(id)))
  ).filter((g): g is GeneratorRow => g !== null);
  const shown = [...generators, ...archived].sort(
    (a, b) =>
      Number(b.id === plan.generatorId) - Number(a.id === plan.generatorId),
  );
  const today = campDayKey(new Date());

  // The sharing split: each camp's kWh from the load list, neighbours' loads
  // theirs and the rest ours.
  const theirLoads = loads.filter((l) => l.owner === "neighbour");
  const ourLoads = loads.filter((l) => l.owner !== "neighbour");
  const ourKwh = powerTotals(
    ourLoads,
    plan.daysOnSite,
    plan.powerFactor,
  ).burnKwh;
  const theirKwh = powerTotals(
    theirLoads,
    plan.daysOnSite,
    plan.powerFactor,
  ).burnKwh;
  const proposed = fuelSplit(ourKwh, theirKwh);
  const split =
    agreement?.partnerFuelPct != null
      ? fixedSplit(agreement.partnerFuelPct)
      : proposed;
  const shareGenerator =
    agreement?.generatorSource === "ours" && agreement.generatorId
      ? (byId.get(agreement.generatorId) ??
        (await getGenerator(agreement.generatorId)))
      : null;
  const fuel =
    shareGenerator && loads.length > 0
      ? fuelForPlan({
          loads,
          generator: shareGenerator,
          plan: {
            powerFactor: plan.powerFactor,
            daysOnSite: plan.daysOnSite,
            lowLoadFactor: plan.lowLoadFactor,
            safetyMarginPct: plan.safetyMarginPct,
          },
          schedule: { fromHour: plan.runFromHour, toHour: plan.runToHour },
        })
      : null;
  const shared = fuel ? splitLitres(fuel.litresWithMargin, split) : null;

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Power & Lighting"
        title="Generator readiness"
        description="Getting the generator ready before the burn, the team's work plan, and sharing a generator with a neighbouring camp. Everyone can read it; captains and Power & Lighting leads edit it."
      />
      <PowerTabs tab="readiness" />

      <div className="flex flex-col gap-6">
        {!canEdit && (
          <p
            id={REFUSAL_ID}
            className="flex items-start gap-2 rounded-lg border border-border bg-card/40 px-3 py-2.5 text-xs text-muted-foreground"
          >
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {POWER_REFUSAL}
          </p>
        )}

        <section aria-labelledby="readiness" className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 id="readiness" className="text-base font-semibold">
              Readiness checklist
            </h2>
            <p className="text-xs text-muted-foreground">
              For each generator, this year: what to check before the burn, who
              sees to it and by when.
            </p>
          </div>
          {shown.length === 0 ? (
            <EmptyState
              icon={<ClipboardCheck />}
              title="No generators yet"
              description="Add the camp's generator on the fuel estimate, then start its checklist here."
            />
          ) : (
            shown.map((gen) => {
              const mine = items.filter((i) => i.generatorId === gen.id);
              const done = mine.filter((i) => i.doneAt !== null).length;
              return (
                <Card
                  key={gen.id}
                  role="article"
                  aria-labelledby={`readiness-${gen.id}`}
                >
                  <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                    <div className="flex flex-col gap-1">
                      <CardTitle
                        id={`readiness-${gen.id}`}
                        className="text-base"
                      >
                        {gen.model}
                      </CardTitle>
                      <CardDescription>
                        {mine.length === 0
                          ? "Not started this year."
                          : `${done} of ${mine.length} done`}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {gen.id === plan.generatorId && (
                        <Badge variant="outline">In the plan</Badge>
                      )}
                      {gen.archivedAt !== null && (
                        <Badge variant="outline">Archived</Badge>
                      )}
                      {mine.length > 0 && done === mine.length && (
                        <Badge variant="success">Ready</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-0 pb-2">
                    {mine.length === 0 ? (
                      <div className="px-6 pb-4">
                        {gen.archivedAt === null && (
                          <StartChecklistButton
                            generatorId={gen.id}
                            model={gen.model}
                            canEdit={canEdit}
                            refusalId={REFUSAL_ID}
                          />
                        )}
                      </div>
                    ) : (
                      <>
                        <ul
                          aria-label={`${gen.model} checklist`}
                          className="divide-y divide-border border-y border-border"
                        >
                          {mine.map((item) => (
                            <ReadinessItemRow
                              key={`${item.id}:${item.version}`}
                              item={{
                                id: item.id,
                                version: item.version,
                                label: item.label,
                                ownerUserId: item.ownerUserId,
                                dueOn: item.dueOn,
                                done: item.doneAt !== null,
                              }}
                              members={members}
                              canEdit={canEdit}
                              refusalId={REFUSAL_ID}
                            >
                              <ItemDetails item={item} today={today} />
                            </ReadinessItemRow>
                          ))}
                        </ul>
                        {gen.archivedAt === null && (
                          <AddReadinessItemForm
                            generatorId={gen.id}
                            canEdit={canEdit}
                            refusalId={REFUSAL_ID}
                          />
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </section>

        <Card role="article" aria-labelledby="work-plan">
          <CardHeader>
            <CardTitle id="work-plan" className="text-base">
              Work plan
            </CardTitle>
            <CardDescription>
              The Power & Lighting team&apos;s jobs for the year, as tasks on
              the task board.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {workPlan.length === 0 ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {earlierPlan === null
                    ? `Not on the task board yet. It starts as ${POWER_WORK_PLAN_TEMPLATE.length} tasks: ${POWER_WORK_PLAN_TEMPLATE.map((t) => t.title.split(":")[0]).join(", ")}.`
                    : `Not on the task board yet. It copies ${earlierPlan}'s tasks as the team left them.`}
                </p>
                <div>
                  <AddWorkPlanButton
                    fromCycle={earlierPlan}
                    canEdit={canEdit}
                    refusalId={REFUSAL_ID}
                  />
                </div>
              </>
            ) : (
              <>
                <ul
                  aria-label="Work plan tasks"
                  className="flex flex-col gap-2"
                >
                  {workPlan.map((t) => (
                    <li
                      key={t.taskId}
                      className="flex flex-wrap items-center justify-between gap-2 text-sm"
                    >
                      <span
                        className={cn(
                          t.status === "done" &&
                            "text-muted-foreground line-through",
                        )}
                      >
                        {t.title}
                      </span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {t.assigneeName ?? "Nobody yet"}
                        <Badge
                          variant={t.status === "done" ? "success" : "outline"}
                        >
                          {TASK_STATUS[t.status] ?? t.status}
                        </Badge>
                      </span>
                    </li>
                  ))}
                </ul>
                <div>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/tasks">
                      <ListChecks aria-hidden />
                      Open the task board
                    </Link>
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card role="article" aria-labelledby="sharing">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
            <div className="flex flex-col gap-1">
              <CardTitle id="sharing" className="text-base">
                Sharing with a neighbouring camp
              </CardTitle>
              <CardDescription>
                For a year the camp shares a generator: who, whose generator,
                the fuel split and the watches. Litres only; how they pay for
                their share is agreed between the camps.
              </CardDescription>
            </div>
            {agreement && (
              <Button asChild variant="outline" size="sm">
                <a href={PRINT_SHARING_PATH} target="_blank" rel="noopener">
                  <Printer aria-hidden />
                  Paper summary
                </a>
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {agreement ? (
              <dl
                aria-label="Fuel split"
                className="grid gap-3 rounded-lg border border-border bg-muted/30 p-4 page-sm:grid-cols-3"
              >
                <div>
                  <dt className="text-xs text-muted-foreground">Our share</dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {formatNumber(split.ourPct, 1)}%
                  </dd>
                  {shared && (
                    <dd className="text-xs tabular-nums">
                      {litres(shared.ours, 1)}
                    </dd>
                  )}
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {agreement.partnerCamp}&apos;s share
                  </dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {formatNumber(split.theirPct, 1)}%
                  </dd>
                  {shared && (
                    <dd className="text-xs tabular-nums">
                      {litres(shared.theirs, 1)}
                    </dd>
                  )}
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">How</dt>
                  <dd className="text-sm">
                    {agreement.partnerFuelPct != null
                      ? "Set by the team"
                      : "By each camp's share of the energy"}
                  </dd>
                  <dd className="text-xs text-muted-foreground">
                    {shared && fuel
                      ? `of ${litres(fuel.litresWithMargin, 1)} for the burn with margin`
                      : "Litres show when the generator is ours and has an estimate."}
                  </dd>
                </div>
              </dl>
            ) : (
              !canEdit && (
                <EmptyState
                  icon={<Handshake />}
                  title="No sharing this year"
                  description="The camp runs its generator for itself this year."
                />
              )
            )}
            {(canEdit || agreement) && (
              <SharingForm
                key={agreement?.version ?? 0}
                agreement={
                  agreement
                    ? {
                        partnerCamp: agreement.partnerCamp,
                        contactRole: agreement.contactRole,
                        generatorSource: agreement.generatorSource,
                        generatorId: agreement.generatorId,
                        theirGenerator: agreement.theirGenerator,
                        partnerFuelPct: agreement.partnerFuelPct,
                        watchCover: agreement.watchCover,
                        version: agreement.version,
                      }
                    : null
                }
                generators={generators.map((g) => ({
                  id: g.id,
                  label: g.model,
                }))}
                proposedTheirPct={proposed.theirPct}
                canEdit={canEdit}
                refusalId={REFUSAL_ID}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
