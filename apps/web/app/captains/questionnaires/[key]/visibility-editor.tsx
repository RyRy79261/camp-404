"use client";

import { useId } from "react";
import { TriangleAlert } from "lucide-react";
import {
  choiceValues,
  visibleIfOpsFor,
  type Question,
  type VisibleIf,
  type VisibleIfOp,
} from "@camp404/types";
import { Alert } from "@camp404/ui/components/alert";
import { InputField } from "@camp404/ui/components/input-field";
import { Label } from "@camp404/ui/components/label";
import { SegmentedControl } from "@camp404/ui/components/segmented-control";
import { Switch } from "@camp404/ui/components/switch";
import {
  OP_LABELS,
  defaultConditionFor,
  describeVisibleIf,
  takesValue,
  withOperator,
} from "./visibility";

// The "show this when [earlier question] [condition] [answer]" editor (Phase F,
// docs/questionnaire-builder.md §2.1). No board draws it: it is built from the
// form parts the block editor already uses, with native selects like its
// field-type picker.

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-border bg-muted px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function optionLabel(field: Question): { value: string; label: string }[] {
  if ("options" in field) return field.options;
  if (field.kind === "scale") return field.steps;
  return (choiceValues(field) ?? []).map((value) => ({ value, label: value }));
}

export function VisibilityEditor({
  value,
  fields,
  subject,
  onChange,
}: {
  value: VisibleIf | undefined;
  /** The questions before this block or page, in order. */
  fields: readonly Question[];
  subject: "block" | "page";
  onChange: (next: VisibleIf | undefined) => void;
}) {
  const switchId = useId();
  const fieldId = useId();
  const opId = useId();
  const valueId = useId();
  const field = value ? fields.find((f) => f.id === value.fieldId) : undefined;
  const summary = value ? describeVisibleIf(value, fields) : null;
  const noFields = fields.length === 0;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <Label htmlFor={switchId}>Show only when…</Label>
          <p className="text-xs text-muted-foreground">
            {subject === "page"
              ? "Hide this page unless an earlier answer matches."
              : "Hide this unless an earlier answer matches."}
          </p>
        </div>
        <Switch
          id={switchId}
          checked={value !== undefined}
          disabled={value === undefined && noFields}
          onCheckedChange={(on) =>
            onChange(on ? defaultConditionFor(fields.at(-1)!) : undefined)
          }
        />
      </div>

      {value === undefined && noFields && (
        <p className="text-xs text-muted-foreground">
          {subject === "page"
            ? "Add a question on an earlier page to use this."
            : "Add a question above this one to use this."}
        </p>
      )}

      {value !== undefined && (
        <>
          {summary?.broken && (
            <Alert variant="warning">
              <TriangleAlert aria-hidden />
              <span>
                The question this depends on is missing, below this, or has
                changed. Pick a question again, or turn this off.
              </span>
            </Alert>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={fieldId}>Question</Label>
            <select
              id={fieldId}
              className={SELECT_CLASS}
              value={field ? field.id : ""}
              onChange={(e) => {
                const next = fields.find((f) => f.id === e.currentTarget.value);
                if (next) onChange(defaultConditionFor(next));
              }}
            >
              {!field && (
                <option value="" disabled>
                  Pick a question
                </option>
              )}
              {fields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.prompt}
                </option>
              ))}
            </select>
          </div>

          {field && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={opId}>Condition</Label>
              <select
                id={opId}
                className={SELECT_CLASS}
                value={value.op}
                onChange={(e) =>
                  onChange(
                    withOperator(
                      value,
                      field,
                      e.currentTarget.value as VisibleIfOp,
                    ),
                  )
                }
              >
                {visibleIfOpsFor(field).map((op) => (
                  <option key={op} value={op}>
                    {OP_LABELS[op]}
                  </option>
                ))}
              </select>
            </div>
          )}

          {field && takesValue(value.op) && (
            <ValueInput
              id={valueId}
              field={field}
              value={value.value}
              onChange={(v) => onChange({ ...value, value: v })}
            />
          )}

          {summary && !summary.broken && (
            <p className="text-xs text-muted-foreground">{summary.text}</p>
          )}
        </>
      )}
    </div>
  );
}

function ValueInput({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: Question;
  value: VisibleIf["value"];
  onChange: (value: string | number | boolean) => void;
}) {
  if (field.kind === "boolean") {
    return (
      <div className="flex flex-col gap-1.5">
        <Label>Answer</Label>
        <SegmentedControl
          aria-label="Answer"
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
          value={value === false ? "no" : "yes"}
          onValueChange={(v) => onChange(v === "yes")}
        />
      </div>
    );
  }
  if (field.kind === "number" || field.kind === "slider") {
    return (
      <InputField
        id={id}
        label="Answer"
        type="number"
        value={typeof value === "number" ? String(value) : ""}
        onChange={(e) => {
          const raw = e.currentTarget.value;
          const n = Number(raw);
          // Clearing the box keeps the previous number, like the field editor.
          if (raw.trim() !== "" && Number.isFinite(n)) onChange(n);
        }}
      />
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Answer</Label>
      <select
        id={id}
        className={SELECT_CLASS}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.currentTarget.value)}
      >
        {optionLabel(field).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
