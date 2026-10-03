import Link from "next/link";
import { notFound } from "next/navigation";
import { MAX_PLATES } from "@camp404/types";
import { PrintRefusal, PrintSheet } from "@/components/print/print-sheet";
import { RecipeCardBody, cardSubtitle } from "@/components/print/recipe-card";
import { captainPageGate } from "@/lib/captain-gate";
import { recipeCardPlates } from "@/lib/print";
import { recipeCardPath, recipePath } from "@/lib/recipe-copy";
import { platesLabel } from "@/lib/recipe-labels";
import { getPlateCount, getRecipeDetail } from "@/lib/recipes";

export const dynamic = "force-dynamic";

export const metadata = { title: "Recipe card — Camp 404" };

// A recipe card to print (#249): a recipe from the book at one plate count,
// for the kitchen on site, where there is no signal. A print, not a Kitchen
// screen: it is drawn in the shared print shell, and the Kitchen's own pages
// only link to it.
//
// The same gate as the recipe's page: any approved member reads a recipe once
// it is in the book (an accepted version), and a recipe that is not is a 404,
// as if it did not exist. Food does not scale by multiplying, so the card
// prints only a count the version has a checked result for
// (recipe_plate_counts); any other count is refused, with the counts there
// are. The amounts are the stored ones; nothing here does maths on an amount.
// It names no member. The card's body is shared with the recipe book
// (components/print/recipe-card.tsx).

export default async function RecipeCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ plates?: string | string[] }>;
}) {
  await captainPageGate("camp_member");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const detail = await getRecipeDetail(id);
  const current = detail?.currentVersion;
  if (!detail || !current) notFound();

  const verified = detail.plateCounts.map((c) => c.plates);
  const pick = recipeCardPlates(
    query.plates,
    verified,
    current.plates,
    MAX_PLATES,
  );
  const count = pick.ok ? await getPlateCount(current.id, pick.plates) : null;
  if (!pick.ok || !count) {
    return (
      <PrintRefusal>
        <h1 className="text-2xl font-bold">{detail.title}</h1>
        <p className="mt-3" data-testid="card-refusal">
          There is no checked recipe for{" "}
          {pick.ok ? platesLabel(pick.plates) : `${pick.asked} plates`}. Food
          does not scale by multiplying, so a card prints only a count the
          Kitchen has checked.
        </p>
        {verified.length > 0 && (
          <p className="mt-3">
            Print it for{" "}
            {verified.map((plates, i) => (
              <span key={plates}>
                {i > 0 && (i === verified.length - 1 ? " or " : ", ")}
                <Link
                  href={recipeCardPath(detail.id, plates)}
                  className="underline"
                >
                  {platesLabel(plates)}
                </Link>
              </span>
            ))}
            .
          </p>
        )}
        <p className="mt-3">
          <Link href={recipePath(detail.id)} className="underline">
            Back to the recipe
          </Link>
        </p>
      </PrintRefusal>
    );
  }

  const subtitle = cardSubtitle(current.recipe, current.version, count);

  const options = (
    <>
      <Link href={recipePath(detail.id)} className="underline">
        Back to the recipe
      </Link>
      {verified.length > 1 && (
        <>
          <span aria-hidden>·</span>
          {verified.map((plates) => (
            <Link
              key={plates}
              href={recipeCardPath(detail.id, plates)}
              aria-current={plates === count.plates ? "page" : undefined}
              className={
                plates === count.plates ? "font-semibold" : "underline"
              }
            >
              {platesLabel(plates)}
            </Link>
          ))}
        </>
      )}
    </>
  );

  return (
    <PrintSheet
      area="Kitchen"
      title={detail.title}
      subtitle={subtitle}
      options={options}
    >
      <RecipeCardBody recipe={current.recipe} count={count} />
    </PrintSheet>
  );
}
