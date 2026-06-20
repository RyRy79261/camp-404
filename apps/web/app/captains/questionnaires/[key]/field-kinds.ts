import type { Question } from "@camp404/types";

// The input kinds the builder palette exposes (the legacy categorical `scale` /
// segmented-string `toggle` kinds are not authored here — see
// docs/questionnaire-builder.md §3).
export type BuilderFieldKind =
  | "short_text"
  | "long_text"
  | "email"
  | "phone"
  | "number"
  | "slider"
  | "single_select"
  | "multi_select"
  | "combobox"
  | "date"
  | "boolean"
  | "image";

export const BUILDER_FIELD_KINDS: { kind: BuilderFieldKind; label: string }[] = [
  { kind: "short_text", label: "Short text" },
  { kind: "long_text", label: "Long text" },
  { kind: "email", label: "Email" },
  { kind: "phone", label: "Phone" },
  { kind: "number", label: "Number" },
  { kind: "slider", label: "Scale / slider" },
  { kind: "single_select", label: "Single select" },
  { kind: "multi_select", label: "Multi select" },
  { kind: "combobox", label: "Dropdown" },
  { kind: "date", label: "Date" },
  { kind: "boolean", label: "Yes / no" },
  { kind: "image", label: "Image upload" },
];

const DEFAULT_OPTIONS = [
  { value: "option-1", label: "Option 1" },
  { value: "option-2", label: "Option 2" },
];

/**
 * Change a question's kind, preserving id / prompt / helper / required (so the
 * stable join key + copy survive), reusing the option set across choice kinds,
 * and resetting other kind-specific params to sensible defaults.
 */
export function morphQuestion(q: Question, kind: BuilderFieldKind): Question {
  const { id, prompt, helper, required } = q;
  const options =
    "options" in q && q.options.length >= 2 ? q.options : DEFAULT_OPTIONS;
  switch (kind) {
    case "short_text":
      return { id, kind, prompt, helper, required, maxLength: 120 };
    case "long_text":
      return { id, kind, prompt, helper, required, maxLength: 1000 };
    case "email":
    case "phone":
    case "date":
    case "boolean":
    case "image":
      return { id, kind, prompt, helper, required };
    case "number":
      return { id, kind, prompt, helper, required, min: 0, max: 6 };
    case "slider":
      return { id, kind, prompt, helper, required, min: 1, max: 5, step: 1 };
    case "single_select":
    case "multi_select":
    case "combobox":
      return { id, kind, prompt, helper, required, options };
  }
}
