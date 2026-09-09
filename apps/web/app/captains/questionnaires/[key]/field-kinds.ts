import type { Question, TextFormat } from "@camp404/types";
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
  // The single way to ask for a number — see TEXT_FORMATS below.
  { kind: "number", label: "Number", icon: Hash, desc: "A whole number in a range" },
  { kind: "slider", label: "Scale / slider", icon: SlidersHorizontal, desc: "Rate on a numeric range" },
  { kind: "single_select", label: "Single select", icon: CircleDot, desc: "Choose one option" },
  { kind: "multi_select", label: "Multi select", icon: ListChecks, desc: "Choose several options" },
  { kind: "combobox", label: "Dropdown", icon: ChevronDown, desc: "Searchable single choice" },
  { kind: "date", label: "Date", icon: Calendar, desc: "Pick a calendar date" },
  { kind: "boolean", label: "Yes / no", icon: ToggleRight, desc: "An on/off switch" },
  { kind: "image", label: "Image upload", icon: ImageIcon, desc: "Upload a photo" },
];

// --- Text formats the palette offers on a Short text field ---------------
//
// THE DECISION, recorded where the palette can be read: there is exactly ONE
// way to ask for a number, and it is the **Number** card above — NOT a
// `format: "number"` on Short text. The two would have stored different types
// (a real number vs a numeric string) and aggregated differently, so the
// closed `TextFormat` enum in packages/types deliberately omits `number` and
// `integer`. If a captain wants a number, they pick Number.
//
// Email and Phone keep both routes on purpose, and the difference is what the
// author is choosing: the Email / Phone CARDS are dedicated fields (their own
// input affordance and keyboard); the formats here are a refinement of a short
// text field that happens to hold one. Prefer the card; the format exists so a
// short text answer can still be constrained.
export interface TextFormatMeta {
  format: TextFormat;
  label: string;
  desc: string;
}

export const TEXT_FORMATS: TextFormatMeta[] = [
  { format: "text", label: "Any text", desc: "No format check" },
  { format: "email", label: "Email address", desc: "name@example.com" },
  { format: "url", label: "Link", desc: "Starts with http:// or https://" },
  { format: "phone", label: "Phone number", desc: "7–15 digits" },
  {
    format: "alphanumeric",
    label: "Letters and numbers",
    desc: "No punctuation or symbols",
  },
];

export const CHOICE_KINDS = [
  "single_select",
  "multi_select",
  "combobox",
] as const;

// The choice kinds that can offer an "Other…" free-text answer (stored in band
// as `other:<typed text>`). `combobox` is excluded: it is a lookup over a long
// list, where a free-text escape hatch defeats the point.
export const ALLOW_OTHER_KINDS = ["single_select", "multi_select"] as const;

/** True when the palette lets this kind offer an "Other…" free-text answer. */
export function supportsAllowOther(
  q: Question,
): q is Extract<Question, { kind: (typeof ALLOW_OTHER_KINDS)[number] }> {
  return (ALLOW_OTHER_KINDS as readonly string[]).includes(q.kind);
}

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
      // Carry "Other…" across the two kinds that support it — flipping single
      // to multi shouldn't silently drop the free-text escape hatch.
      return {
        id,
        kind,
        prompt,
        helper,
        required,
        options,
        allowOther: supportsAllowOther(q) ? q.allowOther : undefined,
      };
    case "combobox":
      return { id, kind, prompt, helper, required, options };
  }
}
