import { notFound } from "next/navigation";
import { canApproveRecipe, sourceFromText } from "@camp404/core";
import { Card, CardContent } from "@camp404/ui/components/card";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { captainPageGate } from "@/lib/captain-gate";
import { SOURCE_EDIT_REFUSAL } from "@/lib/recipe-copy";
import {
  getProofreadProgress,
  getRecipeDetail,
  getRecipeSource,
  resetStaleRuns,
} from "@/lib/recipes";
import { getLeadTeams } from "@/lib/users";
import { SourceEditor, type OpenRun } from "./source-editor";

export const dynamic = "force-dynamic";
// "Send for proofreading" runs Claude in after(), inside this page's budget.
export const maxDuration = 300;

export const metadata = { title: "Edit recipe — Camp 404" };

// The recipe's source editor (#243, Kitchen), for a Kitchen lead or a captain:
// how many the source serves, then its four sections (Ingredients, Equipment,
// Steps, Notes), each a Tiptap editor. "Send for proofreading" saves a new
// source version when the content changed and queues Claude's run; the
// loading panel shows the stages the worker writes on the run, and Claude's
// questions open in a dialog. A successful run is in the book, and the editor
// opens the recipe page.
//
// The rank gate is team_lead (clearance is global); canApproveRecipe then
// narrows it to a captain or a lead of Kitchen, so a member or a lead of
// Structures reads the refusal and nothing of the recipe. Each write checks
// both again inside its own transaction.

/** A suggestion not yet approved, or turned down, has no source to edit. */
const NOT_EDITABLE = ["suggested", "changes_requested", "rejected"];

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { campUser, rank } = await captainPageGate("team_lead");

  // Below team_lead, or a lead of another team: the refusal, and not a word
  // of the recipe.
  const leadTeams = rank === "team_lead" ? await getLeadTeams(campUser.id) : [];
  if (!canApproveRecipe(rank, leadTeams)) {
    return (
      <div className="flex flex-col">
        <PageHeading eyebrow="Kitchen / Recipes" title="Edit recipe" />
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {SOURCE_EDIT_REFUSAL}
          </CardContent>
        </Card>
      </div>
    );
  }

  // No cron: a run that stopped is handed back when a Kitchen page loads.
  await resetStaleRuns(new Date());
  const detail = await getRecipeDetail(id);
  if (!detail || NOT_EDITABLE.includes(detail.status)) notFound();
  const [source, progress] = await Promise.all([
    getRecipeSource(detail.id),
    getProofreadProgress(detail.id),
  ]);

  // Only a run on the recipe itself moves the editor; a plate count's run
  // belongs to the recipe page.
  const run: OpenRun | null =
    progress && progress.kind !== "plates"
      ? {
          runId: progress.runId,
          stage: progress.stage,
          outcome: progress.outcome,
          questions: progress.questions,
        }
      : null;

  return (
    <SourceEditor
      recipeId={detail.id}
      title={detail.title}
      basedOnSourceId={source?.id ?? null}
      serves={source?.serves ?? null}
      sections={source?.sections ?? sourceFromText(detail.text ?? "")}
      run={run}
    />
  );
}
