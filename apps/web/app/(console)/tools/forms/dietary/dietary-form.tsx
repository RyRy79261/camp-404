"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ALLERGEN_LABELS,
  DIETS,
  DIET_LABELS,
  FOOD_REACTION_LABELS,
  KITCHEN_ALLERGENS,
  type Diet,
  type FoodReaction,
  type KitchenAllergen,
} from "@camp404/types";
import type { MyDietary } from "@camp404/db/dietary";
import { cn } from "@camp404/ui/lib/utils";
import { CheckboxCardGroup } from "@camp404/ui/components/option-card-group";
import { toast } from "@camp404/ui/components/toast";
import { FilterToggle, Spin } from "@/components/kitchen/kit";
import { PIXEL_LABEL } from "@/components/kitchen/labels";
import { DIETARY_SAVED, UNREACHABLE } from "@/lib/recipe-copy";
import { saveDietaryAction } from "./actions";

// The dietary pick-list: one row per food with how it affects the member
// (nothing, an allergy, an intolerance or anaphylaxis), then their diet, then
// Save. The old form's words, when there are any, sit on top to pick again.
// A refused save shows above the button.

type Choice = "none" | FoodReaction;

const CHOICES: { value: Choice; label: string }[] = [
  { value: "none", label: "No" },
  { value: "allergy", label: FOOD_REACTION_LABELS.allergy },
  { value: "intolerance", label: FOOD_REACTION_LABELS.intolerance },
  { value: "anaphylaxis", label: FOOD_REACTION_LABELS.anaphylaxis },
];

export function DietaryForm({ mine }: { mine: MyDietary }) {
  const router = useRouter();
  const [foods, setFoods] = useState<Record<KitchenAllergen, Choice>>(() => {
    const out = Object.fromEntries(
      KITCHEN_ALLERGENS.map((a) => [a, "none"]),
    ) as Record<KitchenAllergen, Choice>;
    for (const f of mine.foods) out[f.food] = f.reaction;
    return out;
  });
  const [diets, setDiets] = useState<string[]>(mine.diets);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const result = await saveDietaryAction({
        foods: KITCHEN_ALLERGENS.filter((a) => foods[a] !== "none").map(
          (a) => ({ food: a, reaction: foods[a] }),
        ),
        diets: DIETS.filter((d) => diets.includes(d)),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(DIETARY_SAVED);
      router.refresh();
    } catch {
      setError(UNREACHABLE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-os-private>
      {mine.old && (
        <section
          aria-label="What you wrote before"
          className="border border-warning/40 bg-warning/10 p-4 text-sm"
        >
          <h2 className="font-sans! text-sm font-semibold! tracking-normal! normal-case!">
            What you wrote on the old form
          </h2>
          <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
            {mine.old.allergies && (
              <>
                <dt className="text-muted-foreground">Allergies</dt>
                <dd className="m-0 break-words">{mine.old.allergies}</dd>
              </>
            )}
            {mine.old.isAnaphylactic && (
              <>
                <dt className="text-muted-foreground">Anaphylactic</dt>
                <dd className="m-0">Yes</dd>
              </>
            )}
            {mine.old.notes && (
              <>
                <dt className="text-muted-foreground">Notes</dt>
                <dd className="m-0 break-words">{mine.old.notes}</dd>
              </>
            )}
          </dl>
          <p className="mt-2 text-[13px] text-muted-foreground">
            Pick these below: the kitchen&apos;s check reads only the list.
          </p>
        </section>
      )}

      <section
        aria-labelledby="dietary-foods"
        className="border border-border bg-card"
      >
        <h2
          id="dietary-foods"
          className={cn(
            PIXEL_LABEL,
            "border-b border-border px-4 py-3 text-foreground",
          )}
        >
          Foods
        </h2>
        <ul className="m-0 list-none p-0">
          {KITCHEN_ALLERGENS.map((food) => (
            <li
              key={food}
              className="flex flex-col gap-2 border-t border-border px-4 py-2.5 first:border-t-0 page-md:flex-row page-md:items-center page-md:justify-between"
            >
              <span className="text-sm font-medium">
                {ALLERGEN_LABELS[food]}
              </span>
              <FilterToggle
                label={ALLERGEN_LABELS[food]}
                className="h-9 page-md:w-[440px]"
                value={foods[food]}
                onChange={(v) => setFoods((f) => ({ ...f, [food]: v }))}
                options={CHOICES}
              />
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="dietary-diet"
        className="border border-border bg-card p-4"
      >
        <h2
          id="dietary-diet"
          className={cn(PIXEL_LABEL, "mb-3 text-foreground")}
        >
          Diet
        </h2>
        <CheckboxCardGroup
          aria-label="Diet"
          className="grid grid-cols-2 gap-2 page-md:grid-cols-5"
          values={diets}
          onValuesChange={(v) => setDiets(v as Diet[])}
          options={DIETS.map((d) => ({ value: d, label: DIET_LABELS[d] }))}
        />
      </section>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="inline-flex h-9 items-center gap-2 bg-primary px-6 text-sm font-bold text-primary-foreground hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
        >
          {busy && <Spin />}
          Save
        </button>
      </div>
    </div>
  );
}
