import { groupLinesByCategory, groupStepsByPhase } from "@camp404/core";
import {
  RECIPE_NOTE_KINDS,
  resolveUse,
  // Not a React hook: how a step names a line.
  useLabel as lineLabel,
  type KitchenRecipe,
  type PlateLine,
  type RecipeLine,
  type RecipeStep,
} from "@camp404/types";
import { cn } from "@camp404/ui/lib/utils";
import {
  CATEGORY_LABEL,
  NOTE_KIND_LABEL,
  formatAmount,
  formatDuration,
  platesLabel,
} from "@/lib/recipe-labels";

// A recipe from the book at one plate count, as paper (#249): the recipe
// card (app/print/kitchen/recipes/[id]) and each page of the recipe book
// (app/print/kitchen/book) draw it from here, so a dish reads the same on
// both. Noble Notations' layout: the ingredients by shop area, the method
// with what each step uses (at this count's amounts), the cook notes last.
// The amounts are the stored ones for the count; nothing here does maths on
// an amount. The card stacks the parts; a book page sets the ingredients
// beside the method (the owner's approved Option A, 2026-10-02).

/** The plate count's own recipe, as recipe_plate_counts keeps it. */
export interface CardCount {
  plates: number;
  lines: readonly (PlateLine | undefined)[];
  pots: number | null;
  notes: readonly string[];
}

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

/** "For 60 plates · Version 3 · Total 55 min · Hands-on 25 min · 2 pots". */
export function cardSubtitle(
  recipe: KitchenRecipe,
  version: number,
  count: CardCount,
): string {
  const total = formatDuration(recipe.totalTimeMinutes);
  const active = formatDuration(recipe.activeTimeMinutes);
  return [
    `For ${platesLabel(count.plates)}`,
    `Version ${version}`,
    total ? `Total ${total}` : null,
    active ? `Hands-on ${active}` : null,
    count.pots !== null
      ? `${count.pots} ${count.pots === 1 ? "pot" : "pots"}`
      : null,
  ]
    .filter((p): p is string => p !== null)
    .join(" · ");
}

export function RecipeCardBody({
  recipe,
  count,
  layout = "stacked",
  idPrefix = "card",
}: {
  recipe: KitchenRecipe;
  count: CardCount;
  /** The card stacks its parts; a book page sets them side by side. */
  layout?: "stacked" | "columns";
  /** Keeps heading ids apart when a sheet holds many recipes. */
  idPrefix?: string;
}) {
  const amounts = count.lines;
  const columns = layout === "columns";
  const notes = [...recipe.notes].sort(
    (a, b) =>
      (a.kind === "warning" ? -1 : RECIPE_NOTE_KINDS.indexOf(a.kind)) -
      (b.kind === "warning" ? -1 : RECIPE_NOTE_KINDS.indexOf(b.kind)),
  );
  const h2 = columns
    ? "mb-1.5 text-[13px] font-bold normal-case tracking-normal"
    : "mb-2 text-base font-bold";
  const text = columns ? "text-[11.5px]" : "text-sm";
  const small = columns ? "text-[10px]" : "text-xs";

  const ingredients = (
    <section
      aria-labelledby={`${idPrefix}-ingredients`}
      className="flex flex-col"
    >
      <h2 id={`${idPrefix}-ingredients`} className={h2}>
        Ingredients
      </h2>
      <table
        className={cn("w-full border-collapse", text)}
        aria-label="Ingredients"
      >
        <tbody>
          {groupLinesByCategory(recipe.ingredients).map((group) => [
            <tr key={group.category}>
              <th
                colSpan={2}
                className={cn(
                  "text-left font-semibold uppercase text-neutral-600",
                  columns
                    ? "border-b border-neutral-500 px-[5px] pb-[3px] pt-[9px] text-[9.5px] font-bold tracking-[0.12em]"
                    : "pb-1 pt-3 text-xs tracking-widest",
                )}
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
                  <td
                    className={cn(
                      "whitespace-nowrap text-right align-top tabular-nums",
                      columns
                        ? "w-[84px] px-[5px] py-[3px]"
                        : "w-24 py-1.5 pr-4",
                    )}
                  >
                    {amountOf(line, amounts[index]) ??
                      (columns ? "to taste" : "")}
                  </td>
                  <td className={columns ? "px-[5px] py-[3px]" : "py-1.5"}>
                    {line.component ? `${line.component}: ` : ""}
                    <span className="font-semibold">{line.name}</span>
                    {line.optional ? " (optional)" : ""}
                    {line.preparation ? `, ${line.preparation}` : ""}
                    {line.note && (
                      <span className={cn("block text-neutral-700", small)}>
                        {line.note}
                      </span>
                    )}
                    {countNote && countNote !== line.note && (
                      <span className={cn("block text-neutral-700", small)}>
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
  );

  const method = (
    <section
      aria-labelledby={`${idPrefix}-method`}
      className={cn("flex flex-col", columns ? "gap-2" : "gap-3")}
    >
      <h2 id={`${idPrefix}-method`} className={cn(h2, "mb-0")}>
        Method
      </h2>
      {groupStepsByPhase(recipe.steps).map((group, p) => (
        <div key={`${group.phase ?? ""}-${p}`} className="flex flex-col">
          {group.phase && (
            <h3 className="mb-1 text-sm font-semibold uppercase tracking-widest text-neutral-600">
              {group.phase}
            </h3>
          )}
          <ol className={cn("flex flex-col", columns ? "gap-[7px]" : "gap-2")}>
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
              const under = [uses ? `Uses ${uses}` : null, meta]
                .filter((p): p is string => p !== null)
                .join(" · ");
              return (
                <li
                  key={number}
                  data-testid="card-step"
                  className={cn(
                    "flex break-inside-avoid",
                    text,
                    columns ? "gap-[9px]" : "gap-3",
                  )}
                >
                  <span
                    className={cn(
                      "shrink-0 text-right font-bold tabular-nums",
                      columns ? "w-[18px]" : "w-6",
                    )}
                  >
                    {number}.
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p>{step.instruction}</p>
                    {columns ? (
                      under && (
                        <p className={cn("text-neutral-700", small)}>{under}</p>
                      )
                    ) : (
                      <>
                        {uses && (
                          <p className="text-xs text-neutral-700">
                            Uses {uses}
                          </p>
                        )}
                        {meta && (
                          <p className="text-xs text-neutral-700">{meta}</p>
                        )}
                      </>
                    )}
                    {step.note && (
                      <p className={cn("text-neutral-700", small)}>
                        {step.note}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </section>
  );

  const cookNotes =
    count.notes.length > 0 || notes.length > 0 ? (
      <section
        aria-labelledby={`${idPrefix}-notes`}
        className={cn(
          "flex flex-col break-inside-avoid",
          columns ? "mt-3.5 gap-1.5" : "gap-2",
        )}
      >
        <h2 id={`${idPrefix}-notes`} className={cn(h2, "mb-0")}>
          Cook notes
        </h2>
        <ul
          className={cn(
            "flex list-disc flex-col gap-1",
            columns ? "pl-4 text-[11px]" : "pl-5 text-sm",
          )}
        >
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
    ) : null;

  if (columns) {
    return (
      <>
        {recipe.summary && (
          <p className="mb-2.5 text-[11.5px]">{recipe.summary}</p>
        )}
        <div className="grid grid-cols-[1fr_1.25fr] gap-[22px]">
          {ingredients}
          <div className="flex flex-col">
            {method}
            {cookNotes}
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      {recipe.summary && <p className="text-sm">{recipe.summary}</p>}
      {ingredients}
      {method}
      {cookNotes}
    </>
  );
}
