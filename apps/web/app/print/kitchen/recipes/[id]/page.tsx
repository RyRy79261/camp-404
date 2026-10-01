import Link from "next/link";
import { notFound } from "next/navigation";
import { groupLinesByCategory, groupStepsByPhase } from "@camp404/core";
import {
  MAX_PLATES,
  RECIPE_NOTE_KINDS,
  resolveUse,
  // Not a React hook: how a step names a line.
  useLabel as lineLabel,
  type PlateLine,
  type RecipeLine,
  type RecipeStep,
} from "@camp404/types";
import { PrintRefusal, PrintSheet } from "@/components/print/print-sheet";
import { captainPageGate } from "@/lib/captain-gate";
import { recipeCardPlates } from "@/lib/print";
import { recipeCardPath, recipePath } from "@/lib/recipe-copy";
import {
  CATEGORY_LABEL,
  NOTE_KIND_LABEL,
  formatAmount,
  formatDuration,
  platesLabel,
} from "@/lib/recipe-labels";
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
// It names no member. The recipe has no allergen or vegan data yet, so there
// are no chips (they wait for that data).

const ROW = "border-b border-neutral-300 align-top";

function amountOf(line: RecipeLine, count: PlateLine | undefined) {
  return count
    ? formatAmount(count.quantity, count.quantityMax, count.unit)
    : formatAmount(line.quantity, line.quantityMax, line.unit);
}

function stepMeta(step: RecipeStep): string | null {
  const parts: string[] = [];
  const time = formatDuration(step.durationMinutes, step.durationMaxMinutes);
  if (time) parts.push(time);
  if (step.temperatureC !== null) parts.push(`${step.temperatureC} °C`);
  if (step.equipment.length > 0) parts.push(step.equipment.join(", "));
  return parts.length > 0 ? parts.join(" · ") : null;
}

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

  const recipe = current.recipe;
  const amounts: readonly (PlateLine | undefined)[] = count.lines;
  const total = formatDuration(recipe.totalTimeMinutes);
  const active = formatDuration(recipe.activeTimeMinutes);
  const subtitle = [
    `For ${platesLabel(count.plates)}`,
    `Version ${current.version}`,
    total ? `Total ${total}` : null,
    active ? `Hands-on ${active}` : null,
    count.pots !== null
      ? `${count.pots} ${count.pots === 1 ? "pot" : "pots"}`
      : null,
  ]
    .filter((p): p is string => p !== null)
    .join(" · ");
  const notes = [...recipe.notes].sort(
    (a, b) =>
      (a.kind === "warning" ? -1 : RECIPE_NOTE_KINDS.indexOf(a.kind)) -
      (b.kind === "warning" ? -1 : RECIPE_NOTE_KINDS.indexOf(b.kind)),
  );

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
      {recipe.summary && <p className="text-sm">{recipe.summary}</p>}

      <section aria-labelledby="card-ingredients" className="flex flex-col">
        <h2 id="card-ingredients" className="mb-2 text-base font-bold">
          Ingredients
        </h2>
        <table
          className="w-full border-collapse text-sm"
          aria-label="Ingredients"
        >
          <tbody>
            {groupLinesByCategory(recipe.ingredients).map((group) => [
              <tr key={group.category}>
                <th
                  colSpan={2}
                  className="pb-1 pt-3 text-left text-xs font-semibold uppercase tracking-widest text-neutral-600"
                >
                  {CATEGORY_LABEL[group.category]}
                </th>
              </tr>,
              ...group.lines.map(({ line, index }) => {
                const countNote = amounts[index]?.note?.trim() || null;
                return (
                  <tr
                    key={`${group.category}-${index}`}
                    data-testid="card-line"
                    className={ROW}
                  >
                    <td className="w-32 py-1.5 pr-3 text-right font-mono tabular-nums">
                      {amountOf(line, amounts[index]) ?? ""}
                    </td>
                    <td className="py-1.5">
                      {line.component ? `${line.component}: ` : ""}
                      <span className="font-semibold">{line.name}</span>
                      {line.optional ? " (optional)" : ""}
                      {line.preparation ? `, ${line.preparation}` : ""}
                      {line.note && (
                        <span className="block text-xs text-neutral-700">
                          {line.note}
                        </span>
                      )}
                      {countNote && countNote !== line.note && (
                        <span className="block text-xs text-neutral-700">
                          {countNote}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              }),
            ])}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="card-method" className="flex flex-col gap-3">
        <h2 id="card-method" className="text-base font-bold">
          Method
        </h2>
        {groupStepsByPhase(recipe.steps).map((group, p) => (
          <div key={`${group.phase ?? ""}-${p}`} className="flex flex-col">
            {group.phase && (
              <h3 className="mb-1 text-sm font-semibold uppercase tracking-widest text-neutral-600">
                {group.phase}
              </h3>
            )}
            <ol className="flex flex-col gap-2">
              {group.steps.map(({ step, number }) => {
                const meta = stepMeta(step);
                const uses = step.uses
                  .map((used) => {
                    const index = resolveUse(recipe.ingredients, used);
                    if (typeof index !== "number") return used;
                    const amount = amountOf(
                      recipe.ingredients[index]!,
                      amounts[index],
                    );
                    const name = lineLabel(recipe.ingredients, index);
                    return amount ? `${amount} ${name}` : name;
                  })
                  .join(", ");
                return (
                  <li
                    key={number}
                    data-testid="card-step"
                    className="flex gap-3 break-inside-avoid text-sm"
                  >
                    <span className="w-6 shrink-0 text-right font-bold tabular-nums">
                      {number}.
                    </span>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <p>{step.instruction}</p>
                      {uses && (
                        <p className="text-xs text-neutral-700">Uses {uses}</p>
                      )}
                      {meta && (
                        <p className="text-xs text-neutral-700">{meta}</p>
                      )}
                      {step.note && (
                        <p className="text-xs text-neutral-700">{step.note}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </section>

      {(count.notes.length > 0 || notes.length > 0) && (
        <section
          aria-labelledby="card-notes"
          className="flex flex-col gap-2 break-inside-avoid"
        >
          <h2 id="card-notes" className="text-base font-bold">
            Cook notes
          </h2>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {count.notes.map((note, i) => (
              <li key={`count-${i}`}>
                <span className="font-semibold">
                  For {platesLabel(count.plates)}:
                </span>{" "}
                {note}
              </li>
            ))}
            {notes.map((note, i) => (
              <li key={`note-${i}`}>
                <span className="font-semibold">
                  {NOTE_KIND_LABEL[note.kind]}
                  {note.title ? ` · ${note.title}` : ""}:
                </span>{" "}
                <span className="whitespace-pre-wrap">{note.body}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PrintSheet>
  );
}
