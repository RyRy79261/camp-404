import type { ReactNode } from "react";
import { groupLinesByCategory, groupStepsByPhase } from "@camp404/core";
import {
  RECIPE_NOTE_KINDS,
  type KitchenRecipe,
  type PlateLine,
  type RecipeNote,
  type RecipeStep,
} from "@camp404/types";
import { Badge } from "@camp404/ui/components/badge";
import { cn } from "@camp404/ui/lib/utils";
import {
  CATEGORY_LABEL,
  NOTE_KIND_LABEL,
  formatAmount,
  formatDuration,
  platesLabel,
} from "@/lib/recipe-labels";
import { StepUses } from "./step-uses";

// A recipe as the kitchen reads it (#243): Noble Notations' recipe page
// (recipe-detail.tsx, ingredient-checklist.tsx, step-ingredients.tsx; live at
// noble-notations.com/recipes/gai-yang-isaan-oven), restyled with Camp 404's
// tokens only: foreground, muted-foreground, accent, border, card and muted,
// in Montserrat, dark-first. No serif, no new colours.
//
//  - An aside of ingredients in shop order (groupLinesByCategory), each group
//    under a small uppercase heading, each row its amount (right-aligned,
//    tabular), the name, the preparation and the note.
//  - The method, grouped by phase (groupStepsByPhase): a heading on a
//    hairline with its step count, the steps numbered straight through with
//    the phase's letter, the instruction, its note, the chips of the lines it
//    uses at the chosen plate count, and a Time / Temp / Tools row.
//  - Under both, the cook notes: the recipe's practical notes by kind, and
//    the chosen count's own notes and pots.
//
// This MVP is the recipe alone: no food science, no mass flow, no taxonomy,
// and no tick-off boxes yet. A server component; nothing here is interactive.

/** The phase letter beside a step number: A, B, C (Noble Notations). */
const PHASE_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** A plate count's own notes, shown with the cook notes. */
export interface CountNotes {
  plates: number;
  notes: readonly string[];
  pots: number | null;
}

/** An accent micro-label on a hairline, with a quiet count at the right. */
function SectionHead({
  id,
  title,
  meta,
}: {
  id: string;
  title: string;
  meta?: ReactNode;
}) {
  return (
    <div className="flex w-full items-center gap-3 border-b border-border pb-2">
      <h2
        id={id}
        className="font-mono text-xs uppercase tracking-[0.25em] text-accent"
      >
        {title}
      </h2>
      {meta ? (
        <span className="ml-auto font-mono text-xs uppercase tracking-wider text-muted-foreground tabular-nums">
          {meta}
        </span>
      ) : null}
    </div>
  );
}

function Ingredients({
  recipe,
  amounts,
  headingId,
}: {
  recipe: KitchenRecipe;
  amounts: readonly (PlateLine | undefined)[];
  headingId: string;
}) {
  const groups = groupLinesByCategory(recipe.ingredients);
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <SectionHead
        id={headingId}
        title="Ingredients"
        meta={`${recipe.ingredients.length} ${recipe.ingredients.length === 1 ? "line" : "lines"}`}
      />
      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <div
            key={group.category}
            data-category={group.category}
            className="flex flex-col gap-1"
          >
            <h3 className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
              {CATEGORY_LABEL[group.category]}
            </h3>
            <ul
              aria-label={CATEGORY_LABEL[group.category]}
              className="flex flex-col"
            >
              {group.lines.map(({ line, index }) => {
                const count = amounts[index];
                const amount = count
                  ? formatAmount(count.quantity, count.quantityMax, count.unit)
                  : formatAmount(line.quantity, line.quantityMax, line.unit);
                const countNote = count?.note?.trim() || null;
                return (
                  <li
                    key={index}
                    className="flex items-start gap-3 border-b border-border/60 py-2 last:border-b-0"
                  >
                    <span className="w-24 shrink-0 text-right font-mono text-sm tabular-nums text-foreground">
                      {amount ?? ""}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span>
                          {line.component ? (
                            <span className="text-muted-foreground">
                              {line.component}:{" "}
                            </span>
                          ) : null}
                          <span className="font-medium text-foreground">
                            {line.name}
                          </span>
                        </span>
                        {line.optional ? (
                          <Badge variant="outline" className="text-[0.65rem]">
                            optional
                          </Badge>
                        ) : null}
                      </p>
                      {line.preparation ? (
                        <p className="text-muted-foreground">
                          {line.preparation}
                        </p>
                      ) : null}
                      {line.note ? (
                        <p className="text-xs text-muted-foreground">
                          {line.note}
                        </p>
                      ) : null}
                      {countNote && countNote !== line.note ? (
                        <p className="text-xs text-muted-foreground">
                          {countNote}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function StepMeta({ step }: { step: RecipeStep }) {
  const time = formatDuration(step.durationMinutes, step.durationMaxMinutes);
  const items: { label: string; value: string }[] = [];
  if (time) items.push({ label: "Time", value: time });
  if (step.temperatureC !== null) {
    items.push({ label: "Temp", value: `${step.temperatureC} °C` });
  }
  if (step.equipment.length > 0) {
    items.push({ label: "Tools", value: step.equipment.join(", ") });
  }
  if (items.length === 0) return null;
  return (
    <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline gap-2">
          <dt className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
            {item.label}
          </dt>
          <dd className="text-sm text-muted-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Method({
  recipe,
  amounts,
  headingId,
}: {
  recipe: KitchenRecipe;
  amounts: readonly (PlateLine | undefined)[];
  headingId: string;
}) {
  const phases = groupStepsByPhase(recipe.steps);
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-8">
      <SectionHead
        id={headingId}
        title="Method"
        meta={`${recipe.steps.length} ${recipe.steps.length === 1 ? "step" : "steps"}`}
      />
      {phases.map((group, p) => {
        const letter = group.phase ? (PHASE_LETTERS[p] ?? null) : null;
        return (
          <div
            key={`${group.phase ?? ""}-${p}`}
            className="flex flex-col gap-6"
          >
            {group.phase ? (
              <div className="flex items-center gap-4">
                <h3 className="text-lg font-semibold text-foreground">
                  {group.phase}
                </h3>
                <span aria-hidden className="h-px flex-1 bg-border" />
                <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground tabular-nums">
                  {group.steps.length}{" "}
                  {group.steps.length === 1 ? "step" : "steps"}
                </span>
              </div>
            ) : null}
            <ol
              start={group.steps[0]?.number}
              className="flex list-none flex-col gap-7"
            >
              {group.steps.map(({ step, number }) => (
                <li key={number} className="flex items-start gap-4">
                  <span className="flex w-9 shrink-0 flex-col items-start gap-1">
                    <span className="text-2xl font-semibold leading-none tabular-nums text-foreground">
                      {number}
                    </span>
                    {letter ? (
                      <span className="font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                        {letter}
                      </span>
                    ) : null}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <p className="text-base leading-relaxed text-foreground">
                      {step.instruction}
                    </p>
                    {step.note ? (
                      <p className="text-sm text-muted-foreground">
                        {step.note}
                      </p>
                    ) : null}
                    <StepUses
                      uses={step.uses}
                      lines={recipe.ingredients}
                      amounts={amounts}
                      label={`Step ${number} uses`}
                    />
                    <StepMeta step={step} />
                  </div>
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </section>
  );
}

/** Warnings first, then the other kinds in the contract's order. */
function notesByKind(notes: readonly RecipeNote[]): RecipeNote[] {
  const order = [
    "warning",
    ...RECIPE_NOTE_KINDS.filter((k) => k !== "warning"),
  ];
  return [...notes].sort(
    (a, b) => order.indexOf(a.kind) - order.indexOf(b.kind),
  );
}

function CookNotes({
  recipe,
  count,
  headingId,
}: {
  recipe: KitchenRecipe;
  count: CountNotes | null;
  headingId: string;
}) {
  const hasCount =
    count !== null && (count.notes.length > 0 || count.pots !== null);
  if (recipe.notes.length === 0 && !hasCount) return null;
  const notes = notesByKind(recipe.notes);
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <SectionHead
        id={headingId}
        title="Cook notes"
        meta={recipe.notes.length + (hasCount ? 1 : 0)}
      />
      <div className="grid gap-4 md:grid-cols-2">
        {hasCount && count ? (
          <div className="flex flex-col gap-2 rounded-lg border border-accent/40 bg-card p-4">
            <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
              For {platesLabel(count.plates)}
            </h3>
            {count.pots !== null ? (
              <p className="text-sm text-foreground">
                Cook in {count.pots} {count.pots === 1 ? "pot" : "pots"}.
              </p>
            ) : null}
            {count.notes.length > 0 ? (
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-foreground">
                {count.notes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {notes.map((note, i) => {
          const warning = note.kind === "warning";
          return (
            <div
              key={i}
              data-kind={note.kind}
              className={cn(
                "flex flex-col gap-2 rounded-lg border bg-card p-4",
                warning ? "border-warning/60" : "border-border",
              )}
            >
              <p
                className={cn(
                  "font-mono text-xs uppercase tracking-[0.2em]",
                  warning ? "text-warning" : "text-muted-foreground",
                )}
              >
                {NOTE_KIND_LABEL[note.kind]}
                {note.title ? (
                  <span className="normal-case tracking-normal text-foreground">
                    {" · "}
                    {note.title}
                  </span>
                ) : null}
              </p>
              <p className="whitespace-pre-wrap text-sm text-foreground">
                {note.body}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function RecipeReader({
  recipe,
  amounts,
  count = null,
  idPrefix = "recipe",
  layout = "page",
}: {
  recipe: KitchenRecipe;
  /**
   * The chosen plate count's lines, by the recipe's line index. Left out, the
   * recipe's own amounts are shown.
   */
  amounts?: readonly PlateLine[];
  /** The chosen count's notes and pots, when it has any. */
  count?: CountNotes | null;
  /** Keeps the section ids apart when two readers share a page. */
  idPrefix?: string;
  /** `page`: the aside beside the method on a wide screen. `stacked`: always one column. */
  layout?: "page" | "stacked";
}) {
  const lines: readonly (PlateLine | undefined)[] = amounts ?? [];
  return (
    <div className="flex min-w-0 flex-col gap-12">
      <div
        className={cn(
          "grid min-w-0 gap-10",
          layout === "page" && "lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-12",
        )}
      >
        <aside
          className={cn(
            "min-w-0",
            layout === "page" && "lg:sticky lg:top-6 lg:self-start",
          )}
        >
          <Ingredients
            recipe={recipe}
            amounts={lines}
            headingId={`${idPrefix}-ingredients`}
          />
        </aside>
        <div className="min-w-0">
          <Method
            recipe={recipe}
            amounts={lines}
            headingId={`${idPrefix}-method`}
          />
        </div>
      </div>
      <CookNotes
        recipe={recipe}
        count={count}
        headingId={`${idPrefix}-cook-notes`}
      />
    </div>
  );
}
