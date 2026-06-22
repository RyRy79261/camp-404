import type { Question } from "@camp404/types";
import {
  Calendar,
  ChevronDown,
  CircleDot,
  FileText,
  Hash,
  Image as ImageIcon,
  ListChecks,
  Mail,
  Phone,
  SlidersHorizontal,
  ToggleRight,
  Type,
  type LucideIcon,
} from "lucide-react";

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

export interface BuilderFieldMeta {
  kind: BuilderFieldKind;
  label: string;
  icon: LucideIcon;
  desc: string;
}

// Single source of truth for the builder palette (order + label + icon + desc).
// The editor's field-type <select>, the add-block catalog tiles, and the canvas
// block-row metadata all derive from this one table.
export const BUILDER_FIELD_KINDS: BuilderFieldMeta[] = [
  { kind: "short_text", label: "Short text", icon: Type, desc: "Single line answer" },
  { kind: "long_text", label: "Long text", icon: FileText, desc: "Multi-line paragraph" },
  { kind: "email", label: "Email", icon: Mail, desc: "An email address" },
  { kind: "phone", label: "Phone", icon: Phone, desc: "A phone number" },
  { kind: "number", label: "Number", icon: Hash, desc: "A number in a range" },
  { kind: "slider", label: "Scale / slider", icon: SlidersHorizontal, desc: "Rate on a numeric range" },
  { kind: "single_select", label: "Single select", icon: CircleDot, desc: "Choose one option" },
  { kind: "multi_select", label: "Multi select", icon: ListChecks, desc: "Choose several options" },
  { kind: "combobox", label: "Dropdown", icon: ChevronDown, desc: "Searchable single choice" },
  { kind: "date", label: "Date", icon: Calendar, desc: "Pick a calendar date" },
  { kind: "boolean", label: "Yes / no", icon: ToggleRight, desc: "An on/off switch" },
  { kind: "image", label: "Image upload", icon: ImageIcon, desc: "Upload a photo" },
];

export const CHOICE_KINDS = [
  "single_select",
  "multi_select",
  "combobox",
] as const;

/** Narrows to the question kinds that carry an `options` array. */
export function isChoiceKind(
  q: Question,
): q is Extract<Question, { kind: (typeof CHOICE_KINDS)[number] }> {
  return (CHOICE_KINDS as readonly string[]).includes(q.kind);
}

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
