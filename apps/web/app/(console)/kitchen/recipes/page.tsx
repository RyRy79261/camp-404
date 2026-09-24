import Link from "next/link";
import { BookOpen, CalendarDays, ClipboardCheck, Download } from "lucide-react";
import { canApproveRecipe } from "@camp404/core";
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
import {
  ResponsiveDataTable,
  type ResponsiveColumn,
} from "@camp404/ui/components/responsive-data-table";
import { RecipeStatusBadge } from "@/components/recipes/recipe-status-badge";
import { captainPageGate } from "@/lib/captain-gate";
import { MEAL_PLAN_PATH, recipePath } from "@/lib/recipe-copy";
import { formatDay } from "@/lib/recipe-labels";
import {
  listAwaitingAcceptance,
  listMySuggestions,
  listRecipeBook,
  listReviewQueue,
  resetStaleRuns,
  type RecipeBookEntry,
} from "@/lib/recipes";
import { getLeadTeams } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Recipe book — Camp 404" };

// The camp's recipe book (#243): every recipe with an accepted version, the
// viewer's own suggestions, and, for a Kitchen lead or a captain, the way into
// the review queue. Laid out like the AfrikaBurn console's registrations list:
// the heading, a count line, the table in a card from md up (the phone gets the
// table's own cards), and an empty note when there is nothing yet.
//
// Every approved member opens it. The review count is read only for someone
// who may review, so nobody else is sent even the number.

function platesLabel(n: number): string {
  return `${n} plate${n === 1 ? "" : "s"}`;
}

/** The ready plate counts, the recipe's own count first, then smallest up. */
function readyInOrder(entry: {
  plates: number;
  readyPlates: number[];
}): number[] {
  if (!entry.readyPlates.includes(entry.plates)) return entry.readyPlates;
  return [entry.plates, ...entry.readyPlates.filter((n) => n !== entry.plates)];
}

const BOOK_COLUMNS: ResponsiveColumn<RecipeBookEntry>[] = [
  {
    id: "recipe",
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
    id: "plates",
    header: "Written for",
    cellClassName: "tabular-nums text-muted-foreground",
    cell: (r) => platesLabel(r.plates),
  },
  {
    id: "ready",
    header: "Ready for",
    cell: (r) => (
      <span className="flex flex-wrap gap-1">
        {readyInOrder(r).map((n) => (
          <Badge key={n} variant="outline" className="tabular-nums">
            {n}
          </Badge>
        ))}
      </span>
    ),
  },
  {
    id: "version",
    header: "Version",
    cellClassName: "tabular-nums text-muted-foreground",
    cell: (r) => `v${r.version}`,
  },
  {
    id: "updated",
    header: "Updated",
    cellClassName: "tabular-nums text-muted-foreground",
    cell: (r) => formatDay(r.versionCreatedAt),
  },
];

export default async function RecipeBookPage() {
  // Every approved member; the gate resolves the lead flag for the review link.
  const { campUser, rank } = await captainPageGate("camp_member");
  const leadTeams = rank === "team_lead" ? await getLeadTeams(campUser.id) : [];
  const reviewer = canApproveRecipe(rank, leadTeams);
  // No cron: a run that stopped, or never started, is handed back here.
  await resetStaleRuns(new Date());

  const [book, mine, queue, awaiting] = await Promise.all([
    listRecipeBook(),
    listMySuggestions(campUser.id),
    reviewer ? listReviewQueue() : Promise.resolve(null),
    reviewer ? listAwaitingAcceptance() : Promise.resolve(null),
  ]);
  // What waits on a reviewer: suggestions to decide and proofread recipes to
  // accept. One sent back for changes waits on its member, so it is left out.
  const waiting =
    (queue?.filter((r) => r.status === "suggested").length ?? 0) +
    (awaiting?.length ?? 0);

  return (
    <div className="flex flex-col">
      <PageHeadingWithActions reviewCount={reviewer ? waiting : null} />

      {book.length === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title="No recipes in the book yet"
          description="A recipe lands here once a Kitchen lead or a captain accepts a version of it. Import one to start."
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            {book.length} {book.length === 1 ? "recipe" : "recipes"} in the book
          </p>
          <div className="md:rounded-xl md:border md:bg-card md:text-card-foreground md:shadow-sm">
            <ResponsiveDataTable
              columns={BOOK_COLUMNS}
              data={book}
              getRowKey={(r) => r.id}
              label="Recipe book"
            />
          </div>
        </>
      )}

      <Card role="article" aria-labelledby="your-suggestions" className="mt-8">
        <CardHeader>
          <CardTitle id="your-suggestions" className="text-base">
            Your suggestions
          </CardTitle>
          <CardDescription>
            What you suggested and where it stands. A Kitchen lead or a captain
            decides each one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mine.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You haven&apos;t suggested a recipe yet.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {mine.map((s) => (
                <li key={s.id} className="flex flex-col gap-1 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      href={recipePath(s.id)}
                      className="font-medium hover:text-accent"
                    >
                      {s.title}
                    </Link>
                    <span className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatDay(s.createdAt)}
                      </span>
                      <RecipeStatusBadge status={s.status} />
                    </span>
                  </div>
                  {s.status === "changes_requested" && s.changesNote && (
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground">
                        What to change:
                      </span>{" "}
                      {s.changesNote}
                    </p>
                  )}
                  {s.status === "rejected" && s.rejectionReason && (
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground">Why:</span>{" "}
                      {s.rejectionReason}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PageHeadingWithActions({
  reviewCount,
}: {
  /** Null for a viewer who does not review. */
  reviewCount: number | null;
}) {
  return (
    <PageHeading
      eyebrow="Kitchen"
      title="Recipe book"
      description="The camp's recipes, each at its accepted version and the plate counts it is ready for. Anyone can import one; a Kitchen lead or a captain checks it."
      actions={
        <>
          <Button asChild variant="outline">
            <Link href={MEAL_PLAN_PATH}>
              <CalendarDays aria-hidden />
              Meal plan
            </Link>
          </Button>
          {reviewCount !== null && (
            <Button asChild variant="outline">
              <Link href="/kitchen/recipes/review">
                <ClipboardCheck aria-hidden />
                Review ({reviewCount})
              </Link>
            </Button>
          )}
          <Button asChild>
            <Link href="/kitchen/recipes/new">
              <Download aria-hidden />
              Import a recipe
            </Link>
          </Button>
        </>
      }
    />
  );
}
