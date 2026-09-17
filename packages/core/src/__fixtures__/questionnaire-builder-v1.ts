// FROZEN snapshot of a Camp 404 BUILDER definition — the exact JSON shape the
// in-app builder writes to `questionnaire_definitions.definition` and every
// `questionnaire_versions` snapshot (pages of `blocks`, question wrappers with
// their own `visibleIf`, `imageUrl`/`altText` image blocks), from before the
// unified model existed.
//
// It exists to make the builder → unified conversion a TEST, not a promise:
// stored builder rows are never rewritten, so `fromBuilderQuestionnaire` must
// carry every field across, and the unified runtime must show, require, keep
// and count exactly what the builder's own `visiblePages` /
// `validateBuilderResponses` do. DO NOT "modernise" this fixture. If a change
// here is needed to make a test pass, the change is a compatibility break.
//
// It uses every builder block kind (question, header_break, explainer,
// image_block, divider), all fourteen Camp 404 question kinds, a content page
// with requiredToContinue, page- and block-level visibleIf across every
// operator, every builder role, and short labels.
//
// `unknown`-typed on purpose: it is fed through the parsers exactly as a DB
// read is.

export const BUILDER_V1_QUESTIONNAIRE: unknown = {
  version: "4",
  title: "Getting ready for the burn",
  pages: [
    {
      id: "welcome",
      type: "content",
      title: "Before you start",
      intro: "Ten minutes, and you can save as you go.",
      requiredToContinue: true,
      blocks: [
        {
          id: "welcome_head",
          kind: "header_break",
          headingText: "Welcome back",
          eyebrow: "2027",
          subtext: "A few things so the camp can plan.",
          alignment: "center",
        },
        {
          id: "welcome_note",
          kind: "explainer",
          bodyText: "Only captains see your answers.",
          style: "callout",
        },
        {
          id: "welcome_map",
          kind: "image_block",
          imageUrl:
            "https://camp404.public.blob.vercel-storage.com/maps/site.png",
          caption: "Where we camp",
          altText: "A map of the camp site",
          sizeFit: "fill",
        },
        { id: "welcome_rule", kind: "divider" },
      ],
    },
    {
      id: "about",
      type: "question",
      title: "About you",
      blocks: [
        {
          kind: "question",
          question: {
            id: "photo",
            kind: "image",
            prompt: "A photo so people can find you",
            shortLabel: "Photo",
            required: false,
          },
        },
        {
          kind: "question",
          question: {
            id: "playa_name",
            kind: "short_text",
            prompt: "What do people call you at the burn?",
            shortLabel: "Playa name",
            maxLength: 40,
            format: "alphanumeric",
            required: false,
          },
        },
        {
          kind: "question",
          question: {
            id: "about_you",
            kind: "long_text",
            prompt: "Tell the camp a little about yourself",
            maxLength: 500,
            enableDictation: true,
            required: false,
          },
        },
        {
          kind: "question",
          question: {
            id: "email",
            kind: "email",
            prompt: "Best email for camp news",
            placeholder: "you@example.com",
            required: true,
          },
        },
        {
          kind: "question",
          question: {
            id: "country",
            kind: "combobox",
            prompt: "Where are you travelling from?",
            options: [
              { value: "za", label: "South Africa" },
              { value: "nz", label: "New Zealand" },
              { value: "de", label: "Germany" },
            ],
            placeholder: "Pick a country",
            searchPlaceholder: "Search countries",
            required: true,
          },
        },
      ],
    },
    {
      id: "food",
      type: "question",
      title: "Food",
      intro: "The kitchen plans every meal from this.",
      blocks: [
        {
          kind: "question",
          question: {
            id: "has_allergies",
            kind: "boolean",
            prompt: "Do you have any food allergies?",
            shortLabel: "Allergies?",
            required: false,
          },
        },
        {
          kind: "question",
          question: {
            id: "allergies",
            kind: "short_text",
            prompt: "What are you allergic to?",
            maxLength: 200,
            role: "dietary_allergies",
            required: true,
          },
          visibleIf: { fieldId: "has_allergies", op: "eq", value: true },
        },
        {
          kind: "question",
          question: {
            id: "anaphylactic",
            kind: "boolean",
            prompt: "Could a reaction be life-threatening?",
            role: "dietary_anaphylactic",
            required: false,
          },
          visibleIf: { fieldId: "has_allergies", op: "eq", value: true },
        },
        {
          id: "epipen_warning",
          kind: "explainer",
          bodyText: "Bring two EpiPens and tell your team lead on arrival.",
          style: "warning",
          visibleIf: { fieldId: "anaphylactic", op: "eq", value: true },
        },
        {
          kind: "question",
          question: {
            id: "dietary_notes",
            kind: "long_text",
            prompt: "Anything else the kitchen should know?",
            maxLength: 300,
            role: "dietary_notes",
            required: false,
          },
        },
        {
          kind: "question",
          question: {
            id: "diets",
            kind: "multi_select",
            prompt: "Which of these apply?",
            options: [
              { value: "vegan", label: "Vegan" },
              { value: "vegetarian", label: "Vegetarian" },
              { value: "halal", label: "Halal" },
            ],
            allowOther: true,
            required: false,
          },
        },
        {
          kind: "question",
          question: {
            id: "meal",
            kind: "single_select",
            prompt: "Favourite camp dinner?",
            shortLabel: "Favourite meal",
            options: [
              { value: "braai", label: "Braai" },
              { value: "potjie", label: "Potjie" },
            ],
            allowOther: true,
            required: true,
          },
        },
      ],
    },
    {
      id: "transport",
      type: "question",
      title: "Getting there",
      visibleIf: { fieldId: "country", op: "ne", value: "nz" },
      blocks: [
        {
          kind: "question",
          question: {
            id: "vehicle",
            kind: "toggle",
            prompt: "Are you bringing a vehicle?",
            options: [
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ],
            required: true,
          },
        },
        {
          kind: "question",
          question: {
            id: "driving",
            kind: "boolean",
            prompt: "Will you drive it to the burn yourself?",
            shortLabel: "Driving",
            role: "driving_this_year",
            required: false,
          },
          visibleIf: { fieldId: "vehicle", op: "eq", value: "yes" },
        },
        {
          kind: "question",
          question: {
            id: "arrive",
            kind: "date",
            prompt: "Which day do you arrive?",
            role: "arrival_date",
            required: true,
          },
        },
        {
          kind: "question",
          question: {
            id: "depart",
            kind: "date",
            prompt: "Which day do you leave?",
            role: "departure_date",
            required: false,
          },
        },
        {
          id: "route_map",
          kind: "image_block",
          imageUrl: "/maps/tankwa-route.png",
          altText: "The R355 from Ceres to the gate",
          sizeFit: "fit",
          visibleIf: { fieldId: "driving", op: "eq", value: true },
        },
      ],
    },
    {
      id: "skills",
      type: "question",
      title: "Skills",
      visibleIf: { fieldId: "vehicle", op: "is_answered" },
      blocks: [
        {
          kind: "question",
          question: {
            id: "experience",
            kind: "slider",
            prompt: "How many burns have you done?",
            min: 0,
            max: 20,
            step: 1,
            minLabel: "First one",
            maxLabel: "Lost count",
            display: "continuous",
            required: true,
          },
        },
        {
          kind: "question",
          question: {
            id: "volume",
            kind: "slider",
            prompt: "How loud do you like camp?",
            min: 1,
            max: 5,
            step: 1,
            display: "segmented",
            required: false,
          },
        },
        {
          kind: "question",
          question: {
            id: "kitchen_keen",
            kind: "number",
            prompt: "How keen are you on kitchen shifts?",
            min: 0,
            max: 6,
            minLabel: "Not for me",
            maxLabel: "Sign me up",
            required: false,
          },
          visibleIf: { fieldId: "experience", op: "gte", value: 2 },
        },
        {
          kind: "question",
          question: {
            id: "cooking",
            kind: "scale",
            prompt: "How do you rate your cooking?",
            steps: [
              { value: "lead", label: "I can run a meal for 60" },
              { value: "hands", label: "Happy to chop" },
              { value: "none", label: "Keep me away from the stoves" },
            ],
            required: true,
          },
        },
        {
          id: "lead_head",
          kind: "header_break",
          headingText: "Leading a meal",
          visibleIf: { fieldId: "cooking", op: "eq", value: "lead" },
        },
        {
          kind: "question",
          question: {
            id: "kitchen_plan",
            kind: "long_text",
            prompt: "What would you cook?",
            maxLength: 300,
            required: true,
          },
          visibleIf: { fieldId: "cooking", op: "ne", value: "none" },
        },
        {
          kind: "question",
          question: {
            id: "teams",
            kind: "multi_select",
            prompt: "Which teams interest you?",
            options: [
              { value: "kitchen", label: "Kitchen" },
              { value: "build", label: "Build" },
              { value: "power", label: "Power" },
            ],
            required: true,
          },
        },
        {
          kind: "question",
          question: {
            id: "power_detail",
            kind: "short_text",
            prompt: "What electrical work have you done?",
            maxLength: 100,
            format: "text",
            required: true,
          },
          visibleIf: { fieldId: "teams", op: "includes", value: "power" },
        },
        {
          kind: "question",
          question: {
            id: "build_later",
            kind: "single_select",
            prompt: "Could you help strike the build anyway?",
            options: [
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ],
            required: true,
          },
          visibleIf: { fieldId: "teams", op: "not_includes", value: "build" },
        },
        {
          kind: "question",
          question: {
            id: "buddy_phone",
            kind: "phone",
            prompt: "A kitchen buddy's phone number",
            required: true,
          },
          visibleIf: { fieldId: "kitchen_keen", op: "lt", value: 3 },
        },
        {
          kind: "question",
          question: {
            id: "shade",
            kind: "number",
            prompt: "How many shade poles can you bring?",
            min: 0,
            max: 10,
            required: false,
          },
          visibleIf: { fieldId: "volume", op: "lte", value: 2 },
        },
        {
          kind: "question",
          question: {
            id: "veteran_tip",
            kind: "long_text",
            prompt: "One tip for first-timers?",
            maxLength: 200,
            required: false,
          },
          visibleIf: { fieldId: "experience", op: "gt", value: 5 },
        },
      ],
    },
    {
      id: "no_email",
      type: "content",
      title: "We couldn't reach you",
      visibleIf: { fieldId: "email", op: "is_empty" },
      blocks: [
        {
          id: "no_email_note",
          kind: "explainer",
          bodyText: "Add an email so the camp can reach you.",
          style: "plain",
        },
      ],
    },
  ],
};

/** A complete, valid response set for `BUILDER_V1_QUESTIONNAIRE` in which
 * every conditional question is SHOWN. */
export const BUILDER_V1_ALL_SHOWN: Record<string, unknown> = {
  photo: "/uploads/avatars/ren.png",
  playa_name: "Sparkle",
  about_you: "Third burn, first time building.",
  email: "ren@example.com",
  country: "za",
  has_allergies: true,
  allergies: "Peanuts",
  anaphylactic: true,
  dietary_notes: "No coriander, please.",
  diets: ["vegetarian", "other:pescatarian"],
  meal: "other:shakshuka",
  vehicle: "yes",
  driving: true,
  arrive: "2027-04-26",
  depart: "2027-05-03",
  experience: 6,
  volume: 2,
  kitchen_keen: 1,
  cooking: "lead",
  kitchen_plan: "A giant potjie.",
  teams: ["kitchen", "power"],
  power_detail: "Wired a solar trailer.",
  build_later: "yes",
  buddy_phone: "+27 82 555 0100",
  shade: 4,
  veteran_tip: "Wear goggles.",
};
