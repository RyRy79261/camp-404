"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChefHat, Loader2 } from "lucide-react";
import { KitchenSettingsInput } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { InputField } from "@camp404/ui/components/input-field";
import { toast } from "@camp404/ui/components/toast";
import { setKitchenSettingsAction } from "../../kitchen/recipes/actions";

// The Kitchen card on Camp settings (#243): the kitchen's size, which Claude
// uses to work out how much one pot cooks. The plates at each meal moved to
// the Kitchen's meal plan (2026-09-24), and the old daily limit is gone: the
// card sends neither, and the write keeps the stored values. Captain-only:
// the page renders it only
// for a captain, and the action and the write both check again. Drawn like
// the page's other cards; a problem with a value shows beside that field, as
// on every captain form.

type Field = "kitchenLargestPotLitres" | "kitchenBurnerCount";

type Values = Record<Field, string>;
type Errors = Partial<Record<Field, string>>;

export type KitchenSettingsValues = Pick<
  KitchenSettingsInput,
  "kitchenLargestPotLitres" | "kitchenBurnerCount"
>;

const WHOLE_NUMBER = /^\d+$/;

function toValues(settings: KitchenSettingsValues): Values {
  return {
    kitchenLargestPotLitres: settings.kitchenLargestPotLitres?.toString() ?? "",
    kitchenBurnerCount: settings.kitchenBurnerCount?.toString() ?? "",
  };
}

/** The form's text back as settings, or the sentence for each wrong field. */
function parse(
  values: Values,
):
  | { ok: true; settings: KitchenSettingsValues }
  | { ok: false; errors: Errors } {
  const errors: Errors = {};
  // Every field is optional: an empty one is "not known yet".
  const number = (field: Field): number | null => {
    const text = values[field].trim();
    if (text === "") return null;
    if (!WHOLE_NUMBER.test(text)) {
      errors[field] = "Use a whole number.";
      return null;
    }
    return Number(text);
  };
  const candidate = {
    kitchenLargestPotLitres: number("kitchenLargestPotLitres"),
    kitchenBurnerCount: number("kitchenBurnerCount"),
  };
  // The bounds are checked too, so every wrong field is named at once; a
  // field that already has a problem keeps its own sentence.
  const parsed = KitchenSettingsInput.safeParse(candidate);
  if (parsed.success && Object.keys(errors).length === 0) {
    return {
      ok: true,
      settings: {
        kitchenLargestPotLitres: parsed.data.kitchenLargestPotLitres,
        kitchenBurnerCount: parsed.data.kitchenBurnerCount,
      },
    };
  }
  for (const issue of parsed.error?.issues ?? []) {
    const field = issue.path[0] as Field;
    errors[field] ??= issue.message;
  }
  return { ok: false, errors };
}

export function KitchenSettingsCard({
  settings,
}: {
  settings: KitchenSettingsValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(() => toValues(settings));
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function change(field: Field, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
    setFormError(null);
  }

  function save(event: FormEvent) {
    event.preventDefault();
    const parsed = parse(values);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setFormError(null);
    startTransition(async () => {
      const result = await setKitchenSettingsAction(parsed.settings);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setValues(toValues(result.data.settings));
      toast.success("Kitchen settings saved");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ChefHat className="h-4 w-4 text-accent" aria-hidden />
          Kitchen
        </CardTitle>
        <CardDescription>
          The kitchen&apos;s size, which Claude uses to work out how much one
          pot can cook. The plates at each meal are on the Kitchen&apos;s meal
          plan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="flex flex-col gap-4" noValidate>
          <InputField
            label="Largest pot (litres)"
            helper="Leave it empty if you don't know yet."
            inputMode="numeric"
            value={values.kitchenLargestPotLitres}
            error={errors.kitchenLargestPotLitres}
            disabled={pending}
            onChange={(e) => change("kitchenLargestPotLitres", e.target.value)}
          />
          <InputField
            label="Number of burners"
            helper="Leave it empty if you don't know yet."
            inputMode="numeric"
            value={values.kitchenBurnerCount}
            error={errors.kitchenBurnerCount}
            disabled={pending}
            onChange={(e) => change("kitchenBurnerCount", e.target.value)}
          />
          {formError && (
            <p className="text-xs text-destructive" role="alert">
              {formError}
            </p>
          )}
          <div>
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              disabled={pending}
            >
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              Save kitchen settings
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
