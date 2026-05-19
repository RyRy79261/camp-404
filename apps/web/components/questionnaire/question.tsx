"use client";

import type {
  Question,
  QuestionnaireResponseValue,
} from "@camp404/types";
import { Slider } from "@camp404/ui/components/slider";

interface QuestionFieldProps {
  question: Question;
  value: QuestionnaireResponseValue | undefined;
  onChange: (value: QuestionnaireResponseValue) => void;
  error?: string;
}

export function QuestionField({
  question,
  value,
  onChange,
  error,
}: QuestionFieldProps) {
  const fieldId = `q-${question.id}`;

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={fieldId}
        className="text-sm font-medium text-[color:var(--color-foreground)]"
      >
        {question.prompt}
        {"required" in question && question.required && (
          <span className="ml-1 text-[color:var(--color-primary)]">*</span>
        )}
      </label>
      {question.helper && (
        <p className="text-xs text-[color:var(--color-muted-foreground)]">
          {question.helper}
        </p>
      )}
      <FieldInput
        id={fieldId}
        question={question}
        value={value}
        onChange={onChange}
      />
      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function FieldInput({
  id,
  question,
  value,
  onChange,
}: {
  id: string;
  question: Question;
  value: QuestionnaireResponseValue | undefined;
  onChange: (value: QuestionnaireResponseValue) => void;
}) {
  switch (question.kind) {
    case "slider": {
      const current =
        typeof value === "number"
          ? value
          : Math.round((question.min + question.max) / 2);
      return (
        <Slider
          id={id}
          value={current}
          onValueChange={onChange}
          min={question.min}
          max={question.max}
          step={question.step}
          minLabel={question.minLabel}
          maxLabel={question.maxLabel}
        />
      );
    }
    case "single_select":
      return (
        <select
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.currentTarget.value)}
          className="h-9 rounded-md border border-[color:var(--color-border)] bg-transparent px-3 text-sm"
        >
          <option value="" disabled>
            Choose one…
          </option>
          {question.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "multi_select": {
      const selected = Array.isArray(value) ? new Set(value as string[]) : new Set<string>();
      return (
        <div className="flex flex-col gap-1.5">
          {question.options.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.has(o.value)}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.currentTarget.checked) next.add(o.value);
                  else next.delete(o.value);
                  onChange(Array.from(next));
                }}
              />
              {o.label}
            </label>
          ))}
        </div>
      );
    }
    case "short_text":
      return (
        <input
          id={id}
          type="text"
          maxLength={question.maxLength}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.currentTarget.value)}
          className="h-9 rounded-md border border-[color:var(--color-border)] bg-transparent px-3 text-sm"
        />
      );
    case "long_text":
      return (
        <textarea
          id={id}
          maxLength={question.maxLength}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.currentTarget.value)}
          rows={4}
          className="rounded-md border border-[color:var(--color-border)] bg-transparent p-2 text-sm"
        />
      );
  }
}
