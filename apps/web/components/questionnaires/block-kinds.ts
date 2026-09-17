import {
  AlignLeft,
  Calendar,
  CalendarRange,
  Camera,
  CheckSquare,
  ChevronDown,
  CircleDot,
  Clock,
  Grid3x3,
  Hash,
  Heading,
  Image as ImageIcon,
  Images,
  LayoutGrid,
  ListOrdered,
  Mail,
  Minus,
  Paperclip,
  Phone,
  Rows3,
  SlidersHorizontal,
  SlidersVertical,
  Star,
  StickyNote,
  TextCursorInput,
  TextSearch,
  ToggleLeft,
  ToggleRight,
  Type,
  type LucideIcon,
} from "lucide-react";
import {
  Question,
  isAnswerableBlock,
  pageBlocks,
  type PageBlock,
  type Questionnaire,
  type QuestionnairePage,
} from "@camp404/types";

// The builder's block palette (AfrikaBurn's Builder v2 palette, with Camp 404's
// kinds added). A palette kind is an AUTHORING affordance; several of them map
// onto the same engine kind with a different render variant:
//
//   number        → short_text with format "number"   (AB's typed number)
//   dropdown      → single_select with display "dropdown"
//   image choice  → single_select with display "image_grid"
//   number_picker → the `number` kind (Camp 404's row of whole numbers)
//
// The engine union in @camp404/types stays the single source of truth; nothing
// here invents a kind the runtime cannot render.

export type PaletteKind =
  | "info_block"
  | "image_block"
  | "header_break"
  | "explainer"
  | "divider"
  | "short_text"
  | "long_text"
  | "number"
  | "single_select"
  | "dropdown"
  | "image_choice"
  | "multi_select"
  | "multi_choice_grid"
  | "checkbox_grid"
  | "linear_scale"
  | "rating"
  | "boolean"
  | "date"
  | "time"
  | "email"
  | "phone"
  | "file_link"
  | "years"
  | "slider"
  | "number_picker"
  | "scale"
  | "toggle"
  | "combobox"
  | "image";

export interface PaletteEntry {
  kind: PaletteKind;
  label: string;
  group: "content" | "question";
  icon: LucideIcon;
  /** Shown in the block header pill. */
  short: string;
}

export const PALETTE: readonly PaletteEntry[] = [
  {
    kind: "info_block",
    label: "Info text",
    group: "content",
    icon: Type,
    short: "Info text",
  },
  {
    kind: "header_break",
    label: "Heading",
    group: "content",
    icon: Heading,
    short: "Heading",
  },
  {
    kind: "explainer",
    label: "Note",
    group: "content",
    icon: StickyNote,
    short: "Note",
  },
  {
    kind: "image_block",
    label: "Image",
    group: "content",
    icon: ImageIcon,
    short: "Image",
  },
  {
    kind: "divider",
    label: "Divider",
    group: "content",
    icon: Minus,
    short: "Divider",
  },
  {
    kind: "short_text",
    label: "Short answer",
    group: "question",
    icon: TextCursorInput,
    short: "Short answer",
  },
  {
    kind: "long_text",
    label: "Paragraph",
    group: "question",
    icon: AlignLeft,
    short: "Paragraph",
  },
  {
    kind: "single_select",
    label: "Multiple choice",
    group: "question",
    icon: CircleDot,
    short: "Multiple choice",
  },
  {
    kind: "multi_select",
    label: "Checkboxes",
    group: "question",
    icon: CheckSquare,
    short: "Checkboxes",
  },
  {
    kind: "multi_choice_grid",
    label: "Multiple-choice grid",
    group: "question",
    icon: Grid3x3,
    short: "MC grid",
  },
  {
    kind: "checkbox_grid",
    label: "Checkbox grid",
    group: "question",
    icon: LayoutGrid,
    short: "Checkbox grid",
  },
  {
    kind: "dropdown",
    label: "Dropdown",
    group: "question",
    icon: ChevronDown,
    short: "Dropdown",
  },
  {
    kind: "combobox",
    label: "Searchable list",
    group: "question",
    icon: TextSearch,
    short: "Searchable list",
  },
  {
    kind: "toggle",
    label: "Button choice",
    group: "question",
    icon: Rows3,
    short: "Button choice",
  },
  {
    kind: "image_choice",
    label: "Image choices",
    group: "question",
    icon: Images,
    short: "Image choices",
  },
  {
    kind: "linear_scale",
    label: "Linear scale",
    group: "question",
    icon: SlidersHorizontal,
    short: "Linear scale",
  },
  {
    kind: "scale",
    label: "Labelled scale",
    group: "question",
    icon: ListOrdered,
    short: "Labelled scale",
  },
  {
    kind: "slider",
    label: "Slider",
    group: "question",
    icon: SlidersVertical,
    short: "Slider",
  },
  {
    kind: "rating",
    label: "Rating",
    group: "question",
    icon: Star,
    short: "Rating",
  },
  {
    kind: "boolean",
    label: "Yes / No",
    group: "question",
    icon: ToggleLeft,
    short: "Yes / No",
  },
  {
    kind: "number_picker",
    label: "Number picker",
    group: "question",
    icon: ToggleRight,
    short: "Number picker",
  },
  {
    kind: "number",
    label: "Typed number",
    group: "question",
    icon: Hash,
    short: "Typed number",
  },
  {
    kind: "date",
    label: "Date",
    group: "question",
    icon: Calendar,
    short: "Date",
  },
  {
    kind: "time",
    label: "Time",
    group: "question",
    icon: Clock,
    short: "Time",
  },
  {
    kind: "email",
    label: "Email",
    group: "question",
    icon: Mail,
    short: "Email",
  },
  {
    kind: "phone",
    label: "Phone",
    group: "question",
    icon: Phone,
    short: "Phone",
  },
  {
    kind: "image",
    label: "Photo upload",
    group: "question",
    icon: Camera,
    short: "Photo upload",
  },
  {
    kind: "file_link",
    label: "File link",
    group: "question",
    icon: Paperclip,
    short: "File link",
  },
  {
    kind: "years",
    label: "Years attended",
    group: "question",
    icon: CalendarRange,
    short: "Years attended",
  },
];

export const PALETTE_BY_KIND = Object.fromEntries(
  PALETTE.map((p) => [p.kind, p]),
) as Record<PaletteKind, PaletteEntry>;

/** The palette kind a stored block presents as (drives the type selector). */
export function blockPaletteKind(block: PageBlock): PaletteKind {
  switch (block.kind) {
    case "single_select":
      if (block.display === "dropdown") return "dropdown";
      if (block.display === "image_grid") return "image_choice";
      return "single_select";
    case "short_text":
      return block.format === "number" || block.format === "integer"
        ? "number"
        : "short_text";
    case "number":
      return "number_picker";
    default:
      return block.kind;
  }
}

/**
 * What to call a block in a button's name or a dialog ("Delete Diet"): its
 * question, heading or text, else its place on the section.
 */
export function blockLabel(block: PageBlock, blockIndex: number): string {
  const fallback = `block ${blockIndex + 1}`;
  const words = (() => {
    if (isAnswerableBlock(block)) return block.prompt;
    switch (block.kind) {
      case "info_block":
        return block.heading || block.body;
      case "header_break":
        return block.headingText;
      case "explainer":
        return block.bodyText;
      case "image_block":
        return block.caption || block.alt;
      default:
        return "";
    }
  })().trim();
  if (!words) return fallback;
  return words.length > 60 ? `${words.slice(0, 57)}…` : words;
}

/** True for the palette kinds that take no answer. */
export function isContentKind(kind: PaletteKind): boolean {
  return PALETTE_BY_KIND[kind].group === "content";
}

// --- id allocation -------------------------------------------------------
// Question ids key the response map, so they are allocated ONCE, at insert,
// and never recomputed. Reordering moves the object; the id rides along.
//
// Camp 404 difference: AB hands out the next free `prefix_n`. Here the suffix
// is random, because a published questionnaire keeps its answers under the
// question's id: a deleted `q_2` whose number was handed to a new question
// would attach last year's answers to a different question.

/** Every id already claimed in a draft (page ids + block ids share a namespace). */
export function takenIds(draft: Questionnaire): Set<string> {
  const taken = new Set<string>();
  for (const page of draft.pages) {
    taken.add(page.id);
    for (const block of pageBlocks(page)) taken.add(block.id);
  }
  return taken;
}

function randomSuffix(): string {
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A free `prefix_<random>` id, claimed in `taken` so a batch never repeats. */
export function allocateId(prefix: string, taken: Set<string>): string {
  let id = `${prefix}_${randomSuffix()}`;
  while (taken.has(id)) id = `${prefix}_${randomSuffix()}`;
  taken.add(id);
  return id;
}

/** The id prefix for a new block of this palette kind. */
export function idPrefixFor(kind: PaletteKind): string {
  return isContentKind(kind) ? "block" : "q";
}

// --- factories -----------------------------------------------------------

function defaultOptions(): { value: string; label: string }[] {
  return [
    { value: "option_1", label: "" },
    { value: "option_2", label: "" },
  ];
}

function defaultGridRows(): { id: string; label: string }[] {
  return [
    { id: "row_1", label: "" },
    { id: "row_2", label: "" },
  ];
}

function defaultGridColumns(): { value: string; label: string }[] {
  return [
    { value: "col_1", label: "" },
    { value: "col_2", label: "" },
    { value: "col_3", label: "" },
  ];
}

function defaultSteps(): { value: string; label: string }[] {
  return [
    { value: "step_1", label: "" },
    { value: "step_2", label: "" },
    { value: "step_3", label: "" },
  ];
}

/** A brand-new block of the given palette kind, with `id` already fixed. */
export function createBlock(kind: PaletteKind, id: string): PageBlock {
  switch (kind) {
    // Empty required strings on purpose: the validator flags them as issues,
    // which is exactly the feedback an author should get before saving.
    case "info_block":
      return { id, kind: "info_block", heading: "", body: "" };
    case "image_block":
      return { id, kind: "image_block", url: "", alt: "" };
    case "header_break":
      return { id, kind: "header_break", headingText: "" };
    case "explainer":
      return { id, kind: "explainer", bodyText: "", style: "plain" };
    case "divider":
      return { id, kind: "divider" };
    case "short_text":
      return {
        id,
        kind: "short_text",
        prompt: "",
        maxLength: 200,
        required: false,
      };
    case "number":
      return {
        id,
        kind: "short_text",
        prompt: "",
        maxLength: 20,
        required: false,
        format: "number",
      };
    case "long_text":
      return {
        id,
        kind: "long_text",
        prompt: "",
        maxLength: 2000,
        required: false,
      };
    case "single_select":
      return {
        id,
        kind: "single_select",
        prompt: "",
        options: defaultOptions(),
        required: false,
        display: "radio",
      };
    case "dropdown":
      return {
        id,
        kind: "single_select",
        prompt: "",
        options: defaultOptions(),
        required: false,
        display: "dropdown",
      };
    case "image_choice":
      return {
        id,
        kind: "single_select",
        prompt: "",
        options: defaultOptions(),
        required: false,
        display: "image_grid",
      };
    case "multi_select":
      return {
        id,
        kind: "multi_select",
        prompt: "",
        options: defaultOptions(),
        required: false,
        display: "checkbox",
      };
    case "multi_choice_grid":
      return {
        id,
        kind: "multi_choice_grid",
        prompt: "",
        rows: defaultGridRows(),
        columns: defaultGridColumns(),
        required: false,
      };
    case "checkbox_grid":
      return {
        id,
        kind: "checkbox_grid",
        prompt: "",
        rows: defaultGridRows(),
        columns: defaultGridColumns(),
        required: false,
      };
    case "linear_scale":
      return {
        id,
        kind: "linear_scale",
        prompt: "",
        min: 1,
        max: 5,
        required: false,
      };
    case "rating":
      return {
        id,
        kind: "rating",
        prompt: "",
        steps: 5,
        glyph: "star",
        required: false,
      };
    case "boolean":
      return { id, kind: "boolean", prompt: "", required: false };
    case "date":
      return { id, kind: "date", prompt: "", required: false };
    case "time":
      return { id, kind: "time", prompt: "", required: false };
    case "email":
      return { id, kind: "email", prompt: "", required: false };
    case "phone":
      return { id, kind: "phone", prompt: "", required: false };
    case "file_link":
      return { id, kind: "file_link", prompt: "", required: false };
    case "years":
      return { id, kind: "years", prompt: "", required: false };
    case "slider":
      return {
        id,
        kind: "slider",
        prompt: "",
        min: 1,
        max: 5,
        step: 1,
        required: false,
      };
    case "number_picker":
      return {
        id,
        kind: "number",
        prompt: "",
        min: 0,
        max: 6,
        required: false,
      };
    case "scale":
      return {
        id,
        kind: "scale",
        prompt: "",
        steps: defaultSteps(),
        required: false,
      };
    case "toggle":
      return {
        id,
        kind: "toggle",
        prompt: "",
        options: defaultOptions(),
        required: false,
      };
    case "combobox":
      return {
        id,
        kind: "combobox",
        prompt: "",
        options: defaultOptions(),
        required: false,
      };
    case "image":
      return { id, kind: "image", prompt: "", required: false };
  }
}

type LabelledValue = { value: string; label: string };

/** The authored choices a block carries — options, or a scale's steps. */
function choicesOf(block: PageBlock): readonly LabelledValue[] | null {
  if ("options" in block) return block.options;
  if (block.kind === "scale") return block.steps;
  return null;
}

/** The main words of a content block, so a retype keeps them. */
function contentText(block: PageBlock): { heading?: string; body: string } {
  switch (block.kind) {
    case "info_block":
      return { heading: block.heading, body: block.body };
    case "header_break":
      return { heading: block.headingText, body: block.subtext ?? "" };
    case "explainer":
      return { body: block.bodyText };
    case "image_block":
      return { body: block.caption ?? "" };
    default:
      return { body: "" };
  }
}

/**
 * Change a block's type in place. The id is PRESERVED — responses already
 * collected stay attached to it — as are prompt, helper, required, short label,
 * the show-when condition and (where both sides have them) the choices. A role
 * survives only when the new kind may hold it.
 */
export function convertBlock(block: PageBlock, kind: PaletteKind): PageBlock {
  const next = createBlock(kind, block.id);
  const visibleIf = block.visibleIf ? { visibleIf: block.visibleIf } : {};

  if (!isAnswerableBlock(next)) {
    const text = isAnswerableBlock(block)
      ? { heading: block.prompt, body: block.helper ?? "" }
      : contentText(block);
    switch (next.kind) {
      case "info_block":
        return {
          ...next,
          heading: text.heading || undefined,
          body: text.body,
          ...visibleIf,
        };
      case "header_break":
        return {
          ...next,
          headingText: text.heading || text.body,
          ...visibleIf,
        };
      case "explainer":
        return {
          ...next,
          bodyText: [text.heading, text.body].filter(Boolean).join("\n\n"),
          ...visibleIf,
        };
      default:
        return { ...next, ...visibleIf };
    }
  }

  const source = isAnswerableBlock(block) ? block : null;
  const carried: Record<string, unknown> = {
    ...next,
    prompt: source?.prompt ?? contentText(block).heading ?? "",
    helper: source?.helper,
    required: source?.required ?? false,
    shortLabel: source?.shortLabel,
    ...visibleIf,
  };

  const from = choicesOf(block);
  if (from && from.length >= 2) {
    if (next.kind === "single_select" || next.kind === "multi_select") {
      // Branch targets are dropped: they are only legal on single choice, and
      // a converted question's options may no longer mean the same thing.
      carried.options = from.map((o) => ({
        value: o.value,
        label: o.label,
        ...("imageUrl" in o && o.imageUrl ? { imageUrl: o.imageUrl } : {}),
        ...("imageAlt" in o && o.imageAlt ? { imageAlt: o.imageAlt } : {}),
      }));
    } else if (next.kind === "toggle" || next.kind === "combobox") {
      carried.options = from.map((o) => ({ value: o.value, label: o.label }));
    } else if (next.kind === "scale") {
      carried.steps = from.map((o) => ({ value: o.value, label: o.label }));
    }
  }
  if (
    source &&
    "allowOther" in source &&
    (next.kind === "single_select" || next.kind === "multi_select")
  ) {
    carried.allowOther = source.allowOther;
    carried.otherLabel = source.otherLabel;
  }
  if (source?.kind === "long_text" && next.kind === "long_text") {
    carried.enableDictation = source.enableDictation;
  }

  if (source && "role" in source && source.role) {
    if (roleFits(next.kind, source.role)) carried.role = source.role;
  }
  return withoutUndefined(carried);
}

/** Whether a question of this kind may carry this role (read off the schema). */
export function roleFits(kind: Question["kind"], role: string): boolean {
  const schema = Question.options.find((o) => o.shape.kind.value === kind);
  const roleSchema = (
    schema?.shape as
      | { role?: { safeParse(v: unknown): { success: boolean } } }
      | undefined
  )?.role;
  return roleSchema !== undefined && roleSchema.safeParse(role).success;
}

/** Drop `undefined` members so a retyped block serialises like a fresh one. */
function withoutUndefined(value: Record<string, unknown>): PageBlock {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as PageBlock;
}

/** A fresh empty section (page). */
export function createSection(id: string, index: number): QuestionnairePage {
  return {
    id,
    kind: "questions",
    title: `Section ${index + 1}`,
    pageType: "question",
    questions: [],
  };
}

/**
 * Duplicate a block under a fresh id (the copy is a NEW question). Camp 404
 * addition: a role the app copies into a table sits on one question only, so
 * the copy does not take it — except the emergency contact roles, which repeat
 * by design.
 */
export function duplicateBlock(block: PageBlock, id: string): PageBlock {
  const copy = { ...block, id } as PageBlock;
  if (
    "role" in copy &&
    copy.role &&
    !copy.role.startsWith("emergency_contact_")
  ) {
    const { role: _role, ...rest } = copy;
    return rest as PageBlock;
  }
  return copy;
}
