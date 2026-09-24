import Link from "next/link";
import {
  canApproveRecipe,
  canRunProofread,
  defaultPlates,
} from "@camp404/core";
import { MEALS } from "@camp404/types";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { PageHeading } from "@camp404/ui/components/page-heading";
import {
  ResponsiveDataTable,
  type ResponsiveColumn,
} from "@camp404/ui/components/responsive-data-table";
import { RecipeStatusBadge } from "@/components/recipes/recipe-status-badge";
import { captainPageGate } from "@/lib/captain-gate";
import { REVIEW_REFUSAL, recipePath } from "@/lib/recipe-copy";
import {
  SOURCE_LABEL,
  formatCount,
  formatDay,
  formatWhen,
} from "@/lib/recipe-labels";
import {
  getKitchenSettings,
  listAwaitingAcceptance,
  listProofreadRuns,
  listReadyToProofread,
  listReviewQueue,
  proofreadTokenTotals,
  resetStaleRuns,
  type AwaitingAcceptance,
  type KitchenSettings,
  type ProofreadRunRow,
  type ReviewQueueEntry,
} from "@/lib/recipes";
import { getLeadTeams } from "@/lib/users";
import { ProofreadBatch, type MealPlates } from "./proofread-batch";

export const dynamic = "force-dynamic";

// Run proofreading's after() work runs inside this page's time budget.
export const maxDuration = 300;

export const metadata = { title: "Review recipes — Camp 404" };

// The Kitchen's review queue (#243), laid out like the AfrikaBurn console's
// registrations list: each section a heading, a count and a table in a card
// from md up. Suggestions, the recipes ready for Claude with the picker and
// the plate counts, and the older drafts still waiting to be accepted go to a
// Kitchen lead or a captain (sending to Claude is theirs too, the owner's
// decision 2A). The token usage goes to captains alone, and is neither read
// nor sent for anyone else. No run counter is shown: the daily cap is a
// silent cost guard on the server.
//
// The rank gate is team_lead (clearance is global); canApproveRecipe then
// narrows it to a captain or a lead of Kitchen, so a lead of Structures sees a
// refusal and no rows.

const RUN_OUTCOME: Record<ProofreadRunRow["outcome"], string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Proofread",
  failed: "Failed",
};

const SUGGESTION_COLUMNS: ResponsiveColumn<ReviewQueueEntry>[] = [
  {
    id: "name",
    header: "Recipe",
    role: "title",
    cellClassName: "font-medium",
    cell: (r) => (
      <Link href={recipePath(r.id)} className="hover:text-accent">
        {r.title}
      </Link>
    ),
  },
  {
    id: "status",
    header: "Status",
    role: "badge",
    cell: (r) => <RecipeStatusBadge status={r.status} />,
  },
  {
    id: "by",
    header: "Suggested by",
    cell: (r) => r.submitterName ?? "A former member",
  },
  {
    id: "source",
    header: "Source",
    cellClassName: "text-muted-foreground",
    cell: (r) => SOURCE_LABEL[r.source],
  },
  {
    id: "date",
    header: "Suggested",
    cellClassName: "text-muted-foreground tabular-nums",
    cell: (r) => formatDay(r.createdAt),
  },
];

const AWAITING_COLUMNS: ResponsiveColumn<AwaitingAcceptance>[] = [
  {
    id: "name",
    header: "Recipe",
    role: "title",
    cellClassName: "font-medium",
    cell: (r) => (
      <Link href={recipePath(r.id)} className="hover:text-accent">
        {r.title}
      </Link>
    ),
  },
  {
    id: "kind",
    header: "For",
    cellClassName: "text-muted-foreground",
    cell: (r) => (r.acceptedVersionId ? "A new version" : "The first version"),
  },
  {
    id: "finished",
    header: "From Claude",
    cellClassName: "text-muted-foreground tabular-nums",
    cell: (r) => (r.finishedAt ? formatWhen(r.finishedAt) : "—"),
  },
];

const RUN_COLUMNS: ResponsiveColumn<ProofreadRunRow>[] = [
  {
    id: "recipe",
    header: "Recipe",
    role: "title",
    cellClassName: "font-medium",
    cell: (r) => (
      <Link href={recipePath(r.recipeId)} className="hover:text-accent">
        {r.recipeTitle}
      </Link>
    ),
  },
  {
    id: "outcome",
    header: "Outcome",
    role: "badge",
    cell: (r) => RUN_OUTCOME[r.outcome],
  },
  {
    id: "by",
    header: "Sent by",
    cell: (r) => r.requestedByName ?? "A former member",
  },
  {
    id: "when",
    header: "When",
    cellClassName: "text-muted-foreground tabular-nums",
    cell: (r) => formatWhen(r.requestedAt),
  },
  {
    id: "prompt",
    header: "Prompt",
    cellClassName: "font-mono text-xs text-muted-foreground",
    cell: (r) => r.promptVersion,
  },
  {
    id: "model",
    header: "Model",
    cellClassName: "font-mono text-xs text-muted-foreground",
    cell: (r) => r.model,
  },
  {
    id: "input",
    header: "Input tokens",
    align: "right",
    cellClassName: "tabular-nums",
    cell: (r) => (r.inputTokens === null ? "—" : formatCount(r.inputTokens)),
  },
  {
    id: "output",
    header: "Output tokens",
    align: "right",
    cellClassName: "tabular-nums",
    cell: (r) => (r.outputTokens === null ? "—" : formatCount(r.outputTokens)),
  },
  {
    id: "error",
    header: "Error",
    cellClassName: "max-w-xs text-xs text-destructive",
    cell: (r) => r.error ?? "",
  },
];

/** The meals whose plates Camp settings holds, in meal order. */
function mealPlates(settings: KitchenSettings): MealPlates[] {
  const byMeal = {
    breakfast: settings.kitchenPlatesBreakfast,
    lunch: settings.kitchenPlatesLunch,
    dinner: settings.kitchenPlatesDinner,
  };
  return MEALS.flatMap((meal) => {
    const plates = byMeal[meal];
    return plates === null ? [] : [{ meal, plates }];
  });
}

function Section({
  id,
  title,
  description,
  count,
  empty,
  children,
}: {
  id: string;
  title: string;
  description: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {count === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {empty}
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {count} {count === 1 ? "recipe" : "recipes"}
          </p>
          <div className="md:rounded-xl md:border md:bg-card md:text-card-foreground md:shadow-sm">
            {children}
          </div>
        </>
      )}
    </section>
  );
}

export default async function RecipeReviewPage() {
  const { campUser, rank, cleared } = await captainPageGate("team_lead");
  const now = new Date();
  // No cron: a run that stopped, or was queued and never started, goes back
  // to its recipe with the reason every time a Kitchen page loads.
  await resetStaleRuns(now);

  const heading = (
    <PageHeading
      eyebrow="Kitchen / Recipes"
      title="Review recipes"
      description="Suggestions to decide, and approved recipes to send to Claude. Older drafts from Claude wait here to be accepted."
    />
  );

  if (!cleared) {
    return (
      <div className="flex flex-col">
        {heading}
        <CaptainLock
          title="Kitchen leads and captains"
          message="Recipe review is for a Kitchen lead or a captain. Your rank doesn't have clearance for this."
        />
      </div>
    );
  }

  const leadTeams = rank === "captain" ? [] : await getLeadTeams(campUser.id);
  if (!canApproveRecipe(rank, leadTeams)) {
    return (
      <div className="flex flex-col">
        {heading}
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {REVIEW_REFUSAL}
          </CardContent>
        </Card>
      </div>
    );
  }

  const isCaptain = rank === "captain";
  const canRun = canRunProofread(rank, leadTeams);
  const [queue, ready, awaiting, kitchen, captainData] = await Promise.all([
    listReviewQueue(),
    listReadyToProofread(),
    listAwaitingAcceptance(),
    canRun ? getKitchenSettings() : Promise.resolve(null),
    isCaptain
      ? Promise.all([
          listProofreadRuns({ limit: 20 }),
          proofreadTokenTotals(now),
        ])
      : Promise.resolve(null),
  ]);
  const run = kitchen && {
    meals: mealPlates(kitchen),
    defaultPlates: defaultPlates(kitchen),
  };

  return (
    <div className="flex flex-col gap-10">
      {heading}

      <Section
        id="suggestions"
        title="Suggestions"
        description="Approve a suggestion, ask for changes, or reject it. Open one to decide. One sent back for changes waits for its member to edit it."
        count={queue.length}
        empty="No suggestions are waiting."
      >
        <ResponsiveDataTable
          columns={SUGGESTION_COLUMNS}
          data={queue}
          getRowKey={(r) => r.id}
          label="Suggestions"
        />
      </Section>

      <ProofreadBatch candidates={ready} run={run} />

      <Section
        id="drafts"
        title="Drafts to check"
        description="Recipes Claude wrote before its recipes went straight into the book. Open one to check it against the original and accept it."
        count={awaiting.length}
        empty="No draft is waiting to be checked."
      >
        <ResponsiveDataTable
          columns={AWAITING_COLUMNS}
          data={awaiting}
          getRowKey={(r) => r.id}
          label="Drafts to check"
        />
      </Section>

      {captainData && (
        <Card role="article" aria-labelledby="proofreading-usage">
          <CardHeader>
            <CardTitle id="proofreading-usage" className="text-base">
              Proofreading usage
            </CardTitle>
            <CardDescription>
              The most recent runs and the tokens each one used. Failed runs
              used tokens too.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm">
              <span className="font-medium">This month:</span>{" "}
              <span className="tabular-nums">
                {formatCount(captainData[1].inputTokens)} input tokens,{" "}
                {formatCount(captainData[1].outputTokens)} output tokens
              </span>
            </p>
            {captainData[0].length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No recipe has been proofread yet.
              </p>
            ) : (
              <ResponsiveDataTable
                columns={RUN_COLUMNS}
                data={captainData[0]}
                getRowKey={(r) => r.id}
                label="Recent proofreading runs"
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
