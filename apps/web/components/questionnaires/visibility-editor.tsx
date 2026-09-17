"use client";

import { GitBranch, TriangleAlert } from "lucide-react";
import {
  numberFits,
  visibleIfOpsFor,
  type Question,
  type VisibleIf,
  type VisibleIfOp,
} from "@camp404/types";
import { Input } from "@camp404/ui/components/input";
import { SegmentedControl } from "@camp404/ui/components/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@camp404/ui/components/select";
import { cn } from "@camp404/ui/lib/utils";
import { Labelled, ToggleRow } from "./editor-parts";
import {
  OP_LABELS,
  choiceLabels,
  defaultConditionFor,
  describeVisibleIf,
  isNumericQuestion,
  rangeText,
  takesValue,
  withOperator,
} from "./visibility";

// "Show only when [earlier question] [condition] [answer]" — Camp 404's
// `visibleIf`, in the builder's editor style. One condition over one earlier
// answer; the operators offered are the ones that fit the question
// (`visibleIfOpsFor`), and a number is checked against what the question can
// give (`numberFits`), the same rules publishing applies.

export function VisibilityEditor({
  value,
  fields,
  subject,
  onChange,
}: {
  value: VisibleIf | undefined;
  /** The questions before this block or section, in order. */
  fields: readonly Question[];
  subject: "block" | "section";
  onChange: (next: VisibleIf | undefined) => void;
}) {
  const field = value ? fields.find((f) => f.id === value.fieldId) : undefined;
  const summary = value ? describeVisibleIf(value, fields) : null;
  const noFields = fields.length === 0;
  // A number the question cannot give is a typing slip, not a changed
  // question: say so on the answer box instead of the warning above.
  const numberOutOfRange =
    value !== undefined &&
    field !== undefined &&
    isNumericQuestion(field) &&
    takesValue(value.op) &&
    typeof value.value === "number" &&
    !numberFits(field, value.value);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <ToggleRow
        label="Show only when…"
        hint={
          noFields && value === undefined
            ? subject === "section"
              ? "Add a question in an earlier section to use this."
              : "Add a question above this one to use this."
            : subject === "section"
              ? "Skip this section unless an earlier answer matches."
              : "Hide this unless an earlier answer matches."
        }
        checked={value !== undefined}
        disabled={value === undefined && noFields}
        onCheckedChange={(on) =>
          onChange(on ? defaultConditionFor(fields.at(-1)!) : undefined)
        }
      />

      {value !== undefined ? (
        <>
          {summary?.broken && !numberOutOfRange ? (
            <p className="flex items-start gap-1.5 text-xs text-warning">
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              The question this depends on is missing, below this, or has
              changed. Pick a question again, or turn this off.
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <Labelled label="Question">
              <Select
                value={field ? field.id : ""}
                onValueChange={(id) => {
                  const next = fields.find((f) => f.id === id);
                  if (next) onChange(defaultConditionFor(next));
                }}
              >
                <SelectTrigger aria-label="Question">
                  <SelectValue placeholder="Pick a question" />
                </SelectTrigger>
                <SelectContent>
                  {fields.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.prompt || "Untitled question"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Labelled>

            {field ? (
              <Labelled label="Condition">
                <Select
                  value={value.op}
                  onValueChange={(op) =>
                    onChange(withOperator(value, field, op as VisibleIfOp))
                  }
                >
                  <SelectTrigger aria-label="Condition">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleIfOpsFor(field).map((op) => (
                      <SelectItem key={op} value={op}>
                        {OP_LABELS[op]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Labelled>
            ) : null}

            {field && takesValue(value.op) ? (
              <ValueInput
                field={field}
                value={value.value}
                outOfRange={numberOutOfRange}
                onChange={(v) => onChange({ ...value, value: v })}
              />
            ) : null}
          </div>

          {summary && !summary.broken ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <GitBranch className="h-3 w-3 shrink-0" aria-hidden />
              {summary.text}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function ValueInput({
  field,
  value,
  outOfRange,
  onChange,
}: {
  field: Question;
  value: VisibleIf["value"];
  outOfRange: boolean;
  onChange: (value: string | number | boolean) => void;
}) {
  if (field.kind === "boolean") {
    return (
      <Labelled label="Answer">
        <SegmentedControl
          aria-label="Answer"
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
          value={value === false ? "no" : "yes"}
          onValueChange={(v) => onChange(v === "yes")}
        />
      </Labelled>
    );
  }
  if (isNumericQuestion(field)) {
    const range = rangeText(field);
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          Answer
        </span>
        <Input
          type="number"
          aria-label="Answer"
          min={field.kind === "rating" ? 1 : field.min}
          max={field.kind === "rating" ? field.steps : field.max}
          step={field.kind === "slider" ? field.step : 1}
          aria-invalid={outOfRange ? true : undefined}
          value={typeof value === "number" ? String(value) : ""}
          onChange={(e) => {
            const raw = e.currentTarget.value;
            const n = Number(raw);
            // Clearing the box keeps the previous number.
            if (raw.trim() !== "" && Number.isFinite(n)) onChange(n);
          }}
        />
        <span
          role={outOfRange ? "alert" : undefined}
          className={cn(
            "text-xs",
            outOfRange ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {range}
        </span>
      </div>
    );
  }
  return (
    <Labelled label="Answer">
      <Select
        value={typeof value === "string" ? value : ""}
        onValueChange={(v) => onChange(v)}
      >
        <SelectTrigger aria-label="Answer">
          <SelectValue placeholder="Pick an answer" />
        </SelectTrigger>
        <SelectContent>
          {choiceLabels(field).map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Labelled>
  );
}
