import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { canApproveRecipe, sectionText } from "@camp404/core";
import { SOURCE_SECTIONS, type SourceSection } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { captainPageGate } from "@/lib/captain-gate";
import { recipeHistoryPath } from "@/lib/recipe-copy";
import { formatDay, platesLabel } from "@/lib/recipe-labels";
import { getRecipeDetail, listRecipeSources } from "@/lib/recipes";
import { getLeadTeams } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Source version — Camp 404" };

// One version of a recipe's source on its own page (the owner, 2026-09-24):
// the History tab lists the source versions and opens each here, never in
// place. The heading names the recipe and the source version, and says when
// it is the current (newest) one; under it, each section of the text, read
// only, and a link back to History.
//
// The source is the member's words, so only the member who suggested it and
// the Kitchen's reviewers see it (the History tab's rule); anyone else gets a
// 404, decided here on the server.

const SOURCE_SECTION_TITLES: Record<SourceSection, string> = {
  ingredients: "Ingredients",
  equipment: "Equipment",
  steps: "Steps",
  notes: "Notes",
};

/** A version number from the address: a whole number from 1, or null. */
function versionParam(value: string): number | null {
  if (!/^\d{1,6}$/.test(value)) return null;
  const n = Number(value);
  return n >= 1 ? n : null;
}

export default async function RecipeSourceVersionPage({
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
  if (!privileged) notFound();

  const number = versionParam(version);
  const sources = await listRecipeSources(detail.id);
  const shown = sources.find((s) => s.version === number);
  if (!shown) notFound();
  const current = shown.version === Math.max(...sources.map((s) => s.version));
  const meta = [
    shown.authorName ?? "A former member",
    formatDay(shown.createdAt),
    shown.serves !== null ? `Serves ${platesLabel(shown.serves)}` : null,
  ].filter((m): m is string => m !== null);

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <PageHeading
        eyebrow="Kitchen / Recipes"
        title={`${detail.title} — Source version ${shown.version}${current ? " (current)" : ""}`}
        description={meta.join(" · ")}
        actions={
          <Button asChild variant="outline">
            <Link href={recipeHistoryPath(detail.id)}>
              <ArrowLeft aria-hidden />
              Back to History
            </Link>
          </Button>
        }
      />

      <div className="flex min-w-0 flex-col gap-6 text-sm">
        {SOURCE_SECTIONS.map((key) => {
          const text = sectionText(shown.sections[key]);
          return text ? (
            <section
              key={key}
              aria-labelledby={`source-${key}`}
              className="flex min-w-0 flex-col gap-3"
            >
              <div className="flex items-center gap-3 border-b border-border pb-2">
                <h2
                  id={`source-${key}`}
                  className="font-mono text-xs uppercase tracking-[0.25em] text-accent"
                >
                  {SOURCE_SECTION_TITLES[key]}
                </h2>
              </div>
              <p className="whitespace-pre-wrap break-words">{text}</p>
            </section>
          ) : null;
        })}
      </div>
    </div>
  );
}
