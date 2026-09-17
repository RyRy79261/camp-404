import type {
  BooleanQuestion,
  CheckboxGridQuestion,
  ComboboxQuestion,
  DateQuestion,
  EmailQuestion,
  FileLinkQuestion,
  ImageQuestion,
  LinearScaleQuestion,
  LongTextQuestion,
  MultiChoiceGridQuestion,
  MultiSelectQuestion,
  NumberQuestion,
  PhoneQuestion,
  Question,
  RatingQuestion,
  ScaleQuestion,
  ShortTextQuestion,
  SingleSelectQuestion,
  SliderQuestion,
  TimeQuestion,
  ToggleQuestion,
  YearsQuestion,
} from "../index";

// Ported from AB. One valid question per kind, plus an answer that kind
// accepts. Shared by the exhaustiveness assertions in
// questionnaire-validate-one.test.ts and questionnaire-responses.test.ts
// (isAnswerableBlock must know every kind). Extended with Camp 404's kinds so
// the list still covers the whole unified union; `_kind-samples.ts` is the
// compile-time-pinned twin.
//
// Typed literals rather than `as Question` casts: a blanket cast compiles but
// hides shapes the real schema would refuse.

export const SINGLE_SELECT: SingleSelectQuestion = {
  id: "joining",
  kind: "single_select",
  prompt: "Are you camping with us this year?",
  options: [
    { value: "yes", label: "Yes" },
    { value: "no", label: "No" },
  ],
  required: true,
};

export const MULTI_SELECT: MultiSelectQuestion = {
  id: "shifts",
  kind: "multi_select",
  prompt: "Which shifts can you cover?",
  options: [
    { value: "build", label: "Build week" },
    { value: "strike", label: "Strike" },
    { value: "kitchen", label: "Kitchen" },
  ],
  required: false,
};

export const SHORT_TEXT: ShortTextQuestion = {
  id: "camp_name",
  kind: "short_text",
  prompt: "Camp name",
  maxLength: 120,
  required: true,
};

export const LONG_TEXT: LongTextQuestion = {
  id: "about",
  kind: "long_text",
  prompt: "Tell us about your camp",
  maxLength: 1000,
  required: false,
};

export const DATE: DateQuestion = {
  id: "arrival",
  kind: "date",
  prompt: "When are you arriving?",
  required: true,
};

export const BOOLEAN: BooleanQuestion = {
  id: "generator",
  kind: "boolean",
  prompt: "Are you bringing a generator?",
  required: false,
};

export const EMAIL: EmailQuestion = {
  id: "contact_email",
  kind: "email",
  prompt: "Contact email",
  required: true,
};

export const PHONE: PhoneQuestion = {
  id: "contact_phone",
  kind: "phone",
  prompt: "Contact phone",
  required: true,
};

export const YEARS: YearsQuestion = {
  id: "attended",
  kind: "years",
  prompt: "Which burns have you been to?",
  required: false,
};

export const LINEAR_SCALE: LinearScaleQuestion = {
  id: "noise",
  kind: "linear_scale",
  prompt: "How loud will you be?",
  min: 1,
  max: 5,
  required: true,
};

export const RATING: RatingQuestion = {
  id: "depot",
  kind: "rating",
  prompt: "Rate the Supplier Depot",
  steps: 5,
  required: true,
};

export const TIME: TimeQuestion = {
  id: "quiet_from",
  kind: "time",
  prompt: "When do your quiet hours start?",
  required: true,
};

export const FILE_LINK: FileLinkQuestion = {
  id: "layout",
  kind: "file_link",
  prompt: "Link to your layout diagram",
  required: false,
};

export const MC_GRID: MultiChoiceGridQuestion = {
  id: "shift_grid",
  kind: "multi_choice_grid",
  prompt: "Availability by day",
  rows: [
    { id: "mon", label: "Monday" },
    { id: "tue", label: "Tuesday" },
  ],
  columns: [
    { value: "am", label: "Morning" },
    { value: "pm", label: "Afternoon" },
  ],
  required: true,
};

export const CB_GRID: CheckboxGridQuestion = {
  id: "cover_grid",
  kind: "checkbox_grid",
  prompt: "Which slots can you cover, by area?",
  rows: [
    { id: "kitchen", label: "Kitchen" },
    { id: "gate", label: "Gate" },
  ],
  columns: [
    { value: "am", label: "Morning" },
    { value: "pm", label: "Afternoon" },
    { value: "night", label: "Night" },
  ],
  required: false,
};

// --- Camp 404's kinds ------------------------------------------------------

export const SLIDER: SliderQuestion = {
  id: "burns",
  kind: "slider",
  prompt: "How many burns have you done?",
  min: 0,
  max: 20,
  step: 1,
  required: true,
};

export const NUMBER: NumberQuestion = {
  id: "kitchen_keen",
  kind: "number",
  prompt: "How keen are you on the kitchen?",
  min: 0,
  max: 6,
  required: true,
};

export const SCALE: ScaleQuestion = {
  id: "cooking",
  kind: "scale",
  prompt: "How do you rate your cooking?",
  steps: [
    { value: "lead", label: "I can run a meal" },
    { value: "hands", label: "Happy to chop" },
  ],
  required: true,
};

export const TOGGLE: ToggleQuestion = {
  id: "vehicle",
  kind: "toggle",
  prompt: "Camping in a vehicle?",
  options: [
    { value: "yes", label: "Yes" },
    { value: "no", label: "No" },
  ],
  required: true,
};

export const COMBOBOX: ComboboxQuestion = {
  id: "country",
  kind: "combobox",
  prompt: "Where are you flying in from?",
  options: [
    { value: "za", label: "South Africa" },
    { value: "nz", label: "New Zealand" },
  ],
  required: true,
};

export const IMAGE: ImageQuestion = {
  id: "photo",
  kind: "image",
  prompt: "Profile photo",
  required: false,
};

/** Every question kind with an answer it accepts. */
export const KIND_SAMPLES: readonly { question: Question; answer: unknown }[] =
  [
    { question: SLIDER, answer: 4 },
    { question: NUMBER, answer: 5 },
    { question: SCALE, answer: "hands" },
    { question: TOGGLE, answer: "no" },
    { question: COMBOBOX, answer: "za" },
    { question: IMAGE, answer: "/uploads/photo.png" },
    { question: SINGLE_SELECT, answer: "yes" },
    { question: MULTI_SELECT, answer: ["build"] },
    { question: SHORT_TEXT, answer: "Camp 404" },
    { question: LONG_TEXT, answer: "Dust, lasers, and a very long drop." },
    { question: DATE, answer: "2027-04-26" },
    { question: BOOLEAN, answer: true },
    { question: EMAIL, answer: "alice@example.com" },
    { question: PHONE, answer: "+27 82 123 4567" },
    { question: YEARS, answer: ["2019"] },
    { question: LINEAR_SCALE, answer: 3 },
    { question: RATING, answer: 4 },
    { question: TIME, answer: "23:00" },
    { question: FILE_LINK, answer: "https://example.com/layout.pdf" },
    { question: MC_GRID, answer: { mon: ["am"], tue: ["pm"] } },
    { question: CB_GRID, answer: { kitchen: ["am", "pm"] } },
  ];
