import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { canApproveRecipe } from "@camp404/core";
import { Button } from "@camp404/ui/components/button";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { RecipeReader } from "@/components/recipes/recipe-reader";
import { captainPageGate } from "@/lib/captain-gate";
import { recipeHistoryPath } from "@/lib/recipe-copy";
import { formatDay } from "@/lib/recipe-labels";
import { getRecipeDetail } from "@/lib/recipes";
import { getLeadTeams } from "@/lib/users";
import { AddLesson } from "../../recipe-actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Recipe version — Camp 404" };

// One version of a recipe on its own page (the owner, 2026-09-24): the
// History tab lists the versions and opens each here, never in place. The
// heading names the recipe and the version, and says when it is the current
// one; the recipe is the Recipe tab's reader, read only; under it, Notes: the
// lessons learned cooking this version, newest first, and the add-a-lesson
// form, which adds to this version. Any approved member adds one, as before.
//
// Who sees it is the recipe page's rule, decided here on the server: the
// member who suggested it and the Kitchen's reviewers at any status, every
// other approved member once the recipe is in the book, and anyone else a
// 404.

/** A version number from the address: a whole number from 1, or null. */
function versionParam(value: string): number | null {
  if (!/^\d{1,6}$/.test(value)) return null;
  const n = Number(value);
  return n >= 1 ? n : null;
}

export default async function RecipeVersionPage({
  params,
}: {
  params: Promise<{ id: string; version: string }>;
}) {
  const { id, version } = await params;
  const { campUser, rank } = await captainPageGate("camp_member");
  const leadTeams = rank === "team_lead" ? await getLeadTeams(campUser.id) : [];
  const detail = await getRecipeDetail(id);
  if (!detail) notFound();
  const privileged =
    detail.submitterId === campUser.id || canApproveRecipe(rank, leadTeams);
  if (!privileged && detail.acceptedVersionId === null) notFound();

  const number = versionParam(version);
  const shown = detail.versions.find((v) => v.version === number);
  if (!shown) notFound();
  const current = shown.id === detail.acceptedVersionId;
  const lessons = detail.lessons.filter((l) => l.versionId === shown.id);

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <PageHeading
        eyebrow="Kitchen / Recipes"
        title={`${detail.title} — Version ${shown.version}${current ? " (current)" : ""}`}
        description={shown.recipe.summary ?? undefined}
        actions={
          <Button asChild variant="outline">
            <Link href={recipeHistoryPath(detail.id)}>
              <ArrowLeft aria-hidden />
              Back to History
            </Link>
          </Button>
        }
      />

      <RecipeReader recipe={shown.recipe} />

      <section
        aria-labelledby="version-notes"
        className="flex min-w-0 flex-col gap-4"
      >
        <div className="flex items-center gap-3 border-b border-border pb-2">
          <h2
            id="version-notes"
            className="font-mono text-xs uppercase tracking-[0.25em] text-accent"
          >
            Notes
          </h2>
        </div>
        {lessons.length > 0 && (
          <ul className="flex flex-col divide-y divide-border">
            {lessons.map((l) => (
              <li key={l.id} className="flex flex-col gap-0.5 py-2.5 text-sm">
                <span className="whitespace-pre-wrap break-words">
                  {l.body}
                </span>
                <span className="text-xs text-muted-foreground">
                  {l.authorName ?? "A former member"} · Burn {l.cycle} ·{" "}
                  {formatDay(l.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="max-w-2xl">
          <AddLesson recipeId={detail.id} versionId={shown.id} />
        </div>
      </section>
    </div>
  );
}
