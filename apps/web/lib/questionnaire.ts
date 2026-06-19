import { BuilderQuestionnaire, Questionnaire, type Question } from "@camp404/types";
import { COUNTRIES, countryFlag } from "./countries";

// Render each country option with its flag emoji prefixed, e.g.
// "🇿🇦 South Africa". Stored value stays the ISO alpha-2 code.
const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({
  value: c.value,
  label: `${countryFlag(c.value)} ${c.label}`,
}));

// Mandatory burner-profile questionnaire shown right after signup. Real
// copy will evolve — bump `QUESTIONNAIRE_VERSION` whenever the catalogue
// SHAPE changes; existing responses stay attached to their original version on
// burner_profiles.version so we can re-render them in context later.
//
// NOTE on PII: the government ID number (`id.number`) is split out of
// `responses` at every write boundary and stored encrypted on `users`
// (`passport_encrypted` / `sa_id_encrypted`, keyed off `id.type`); it is
// decrypted back only for the owner and for captains. `id.type` is not
// sensitive and stays in `responses`. Date of birth (`birthday`) intentionally
// stays in `responses` as ordinary profile data — it is not in the
// encrypted-PII class (passport / SA-ID / bank details). See
// docs/superpowers/specs/2026-05-30-pii-at-rest-encryption-design.md.
//
// NOTE on the team-specific questionnaires: the team-interest 0–6 pickers on
// the "Team interests" page drive which follow-up questionnaires the user
// gets activated for (kitchen, structures, …). Those follow-ups are
// separate bespoke pages and not modelled here.

// A team option for the team-interest sliders + the team-lead multi-select.
// Phase 3: these are no longer hardcoded here — the caller supplies them from
// the editable camp config (active teams for a fresh picker; all teams incl.
// archived for validating/displaying an already-stored response). `value` is
// the teamEnum key; `label` is the configured display label.
export type TeamOption = { value: string; label: string };

// Ingredient list used for both the dislike and allergy multi-selects on
// the dietary page. Kept short and recognisable on purpose — anything
// more nuanced goes into the free-text notes field.
const DIETARY_INGREDIENTS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "dairy", label: "Dairy / lactose" },
  { value: "gluten", label: "Gluten / wheat" },
  { value: "eggs", label: "Eggs" },
  { value: "soy", label: "Soy" },
  { value: "peanuts", label: "Peanuts" },
  { value: "tree_nuts", label: "Tree nuts" },
  { value: "shellfish", label: "Shellfish" },
  { value: "fish", label: "Fish" },
  { value: "sesame", label: "Sesame" },
  { value: "alliums", label: "Onion / garlic" },
  { value: "nightshades", label: "Nightshades (tomato, pepper, aubergine)" },
  { value: "spicy", label: "Chilli / heat" },
];

// The questionnaire version. Bump ONLY when the SHAPE changes (a question
// added/removed, or a required flag flipped) — that re-opens the required-action
// gate for every member and forces a re-submit. Relabelling / reordering /
// archiving a team is interpretation, not shape (the response keys are the
// stable enum), so it must NOT bump this. (Adding a brand-new team key is a
// shape change — that's Phase 4, with an enum migration + a version bump.)
export const QUESTIONNAIRE_VERSION = "2026.06.04-v9";

// The two team-bound anchors in the burner questionnaire — the only parts that
// depend on the live camp config. `resolveTeamBindings` injects the configured
// teams into these by id, so a STORED definition (DB-backed builder, later
// phase) can carry placeholder team content and still pick up relabels/archives
// at read time. Kept here next to the builder so the ids stay in lockstep.
export const TEAM_INTERESTS_PAGE_ID = "team_interests";
export const TEAM_LEAD_QUESTION_ID = "team_lead.interests";

/**
 * One team-interest input — a 0–6 whole-number picker per the board (OB-step-06),
 * NOT a slider. The single source for both the builder and the resolver. The
 * value stays a number in [0,6], so switching from the old slider kind is
 * presentation-only — stored answers stay valid and the gate doesn't re-open.
 */
function teamInterestNumber(team: TeamOption): Question {
  return {
    id: `team_interest.${team.value}`,
    kind: "number",
    prompt: team.label,
    min: 0,
    max: 6,
    minLabel: "Not for me",
    maxLabel: "Sign me up",
    required: false,
  };
}

/** The team-lead multi-select options — shared by the builder and the resolver. */
function teamLeadOptions(
  teams: ReadonlyArray<TeamOption>,
): { value: string; label: string }[] {
  return teams.map((team) => ({ value: team.value, label: team.label }));
}

/**
 * Build the burner-profile questionnaire. `teams` populates the team-interest
 * sliders + the team-lead multi-select; the caller decides which teams to pass:
 * active teams for a fresh picker, or all teams (incl. archived) when validating
 * or displaying an already-stored response — so an archived pick still validates
 * and still renders its label rather than the raw key. Pure (no DB / config
 * import) so it's unit-testable; the server resolver lives in questionnaire-config.ts.
 */
export function buildQuestionnaire(
  teams: ReadonlyArray<TeamOption>,
): Questionnaire {
  return {
    version: QUESTIONNAIRE_VERSION,
    pages: [
      {
        id: "profile_photo",
        kind: "questions",
        title: "Add a profile photo",
        subtitle:
          "Optional — helps the camp put a face to your name. You can skip and add it later from your profile.",
        questions: [
          {
            id: "profile.image",
            kind: "image",
            prompt: "Profile photo",
            helper: "A clear photo of your face works best.",
            required: false,
          },
        ],
      },
      {
        id: "about_you",
        kind: "questions",
        title: "About you",
        subtitle:
          "Name and email come from your sign-in account — we won't ask for them again.",
        questions: [
          {
            id: "birthday",
            kind: "date",
            prompt: "Date of birth",
            helper: "Used to confirm you're old enough to attend.",
            required: true,
          },
          {
            id: "phone",
            kind: "short_text",
            prompt: "Phone number",
            helper: "Include the country code, e.g. +27 82 555 1234.",
            maxLength: 40,
            required: true,
          },
          {
            id: "country",
            kind: "combobox",
            prompt: "Country you're flying from",
            helper: "Where you'll be travelling to Afrikaburn from.",
            options: COUNTRY_OPTIONS,
            placeholder: "Pick your country…",
            searchPlaceholder: "Search countries…",
            required: true,
          },
          {
            id: "id.type",
            kind: "toggle",
            prompt: "ID document",
            options: [
              { value: "passport", label: "Passport" },
              { value: "sa_id", label: "South African ID" },
            ],
            required: true,
          },
          {
            id: "id.number",
            kind: "short_text",
            prompt: "Document number",
            helper:
              "SA ID: 13 digits. SA passport: a letter then 8 digits (e.g. A12345678). Stored privately for ticket allocation only.",
            maxLength: 40,
            required: true,
          },
        ],
      },
      {
        id: "bio",
        kind: "questions",
        title: "A bit about you",
        subtitle:
          "Free-form. Tap the mic to dictate if typing on a phone isn't your thing.",
        questions: [
          {
            id: "bio.statement",
            kind: "long_text",
            prompt: "Tell us about yourself",
            helper:
              "Who you are when you're in the dust — this is the bio your team lead reads first.",
            maxLength: 2000,
            required: true,
          },
        ],
      },
      {
        id: "burn_ideas",
        kind: "questions",
        title: "Your ideas for this year's burn",
        subtitle:
          "Workshops, art, performances, vibe projects — anything you want to bring or build.",
        questions: [
          {
            id: "ideas.this_year",
            kind: "long_text",
            prompt: "What do you want to make happen?",
            helper:
              "Rough is fine — the dust shapes the plan. Tap the mic to dictate.",
            maxLength: 2000,
            required: false,
          },
        ],
      },
      {
        id: "team_interests_intro",
        kind: "intro",
        heading: "Indicate your interest in whichever teams you want.",
        body: "It's okay not to know yet — leave the sliders at zero for anything you're unsure about. None of these are required. You can revisit them later as the camp comes into focus.",
      },
      {
        id: "team_interests",
        kind: "questions",
        title: "Team interests",
        subtitle:
          "Slide each team based on how keen you are to help. If you nudge a team above zero we'll send you their team-specific questionnaire later.",
        questions: teams.map(teamInterestNumber),
      },
      {
        id: "cooking_competency",
        kind: "questions",
        title: "Cooking competency",
        subtitle: "Be honest — overstating helps nobody when the dust hits.",
        questions: [
          {
            id: "competency.cooking",
            kind: "scale",
            prompt: "How would you describe your cooking?",
            steps: [
              { value: "create", label: "Good cook — I can create recipes" },
              { value: "teach", label: "Adequate — I can teach recipes" },
              { value: "follow", label: "I can follow recipes" },
              { value: "burn", label: "I might burn recipes" },
            ],
            required: true,
          },
        ],
      },
      {
        id: "leadership_logistics",
        kind: "questions",
        title: "Leadership & logistics",
        subtitle:
          "You can change any of these later — this is a starting picture.",
        questions: [
          {
            id: "team_lead.interests",
            kind: "multi_select",
            prompt: "I would like to be a team lead of…",
            helper: "Pick none if you'd rather just be in the trenches.",
            options: teamLeadOptions(teams),
            required: false,
          },
          {
            id: "logistics.driving",
            kind: "single_select",
            prompt: "Will you be driving a car to the burn?",
            options: [
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
              { value: "maybe", label: "Maybe — still working it out" },
            ],
            required: true,
          },
          {
            id: "logistics.onsite_before",
            kind: "single_select",
            prompt: "Can you be on-site BEFORE the burn for build week?",
            options: [
              { value: "yes_full", label: "Yes — the whole build week" },
              { value: "yes_partial", label: "Some of build week" },
              { value: "no", label: "No — I'll arrive on opening day" },
            ],
            required: true,
          },
          {
            id: "logistics.onsite_after",
            kind: "single_select",
            prompt: "Can you stay on-site AFTER the burn for strike / clean-up?",
            options: [
              { value: "yes_full", label: "Yes — through to MOOP sweep" },
              { value: "yes_partial", label: "A day or two" },
              { value: "no", label: "No — I'm out the morning after" },
            ],
            required: true,
          },
        ],
      },
      {
        id: "burn_history",
        kind: "questions",
        title: "Burn history",
        subtitle:
          "So we know who the dust-veterans are and who's getting their first hug from the playa.",
        questions: [
          {
            id: "history.camp404_years",
            kind: "multi_select",
            prompt: "Which years have you been with Camp 404?",
            helper: "Leave blank if this would be your first year with us.",
            options: [
              { value: "2019", label: "2019" },
              { value: "2022", label: "2022" },
              { value: "2023", label: "2023" },
              { value: "2024", label: "2024" },
              { value: "2025", label: "2025" },
              { value: "2026", label: "2026" },
            ],
            required: false,
          },
          {
            id: "history.afrikaburn_count",
            kind: "single_select",
            prompt: "How many Afrikaburns have you been to?",
            options: [
              { value: "0", label: "None — first one" },
              { value: "1_2", label: "1–2" },
              { value: "3_5", label: "3–5" },
              { value: "6_plus", label: "6 or more" },
            ],
            required: true,
          },
          {
            id: "history.other_burns",
            kind: "long_text",
            prompt: "Other burns you've been to?",
            helper:
              "Burning Man, regional burns, theme camps, fire-arts collectives — anything dusty.",
            maxLength: 1000,
            required: false,
          },
        ],
      },
      {
        id: "burn_intent",
        kind: "questions",
        title: "Coming to burn this year?",
        subtitle:
          "Drives camp planning — we'd rather hear 'unsure' than nothing.",
        questions: [
          {
            id: "intent.this_year",
            kind: "scale",
            prompt: "How likely are you coming to burn this year?",
            steps: [
              { value: "definite", label: "100% coming" },
              { value: "want", label: "Definitely want to" },
              { value: "try", label: "Will try" },
              { value: "unsure", label: "Unsure" },
              { value: "unlikely", label: "Not likely" },
              { value: "not_coming", label: "Definitely not" },
            ],
            required: true,
          },
        ],
      },
      {
        id: "dietary",
        kind: "questions",
        title: "Dietary requirements",
        subtitle:
          "Splitting dislikes from allergies so the kitchen knows what's preference and what's life-or-death.",
        questions: [
          {
            id: "dietary.dislikes",
            kind: "multi_select",
            prompt: "Ingredients I dislike",
            helper:
              "Things you'd rather not eat. The kitchen will try to avoid these, but they won't kill you.",
            options: [...DIETARY_INGREDIENTS],
            required: false,
          },
          {
            id: "dietary.allergies",
            kind: "multi_select",
            prompt: "Ingredients I'm allergic / intolerant to",
            helper:
              "Hard rules — these can't be in your food. Flag anaphylactic ones in the notes below.",
            options: [...DIETARY_INGREDIENTS],
            required: false,
          },
          {
            id: "dietary.notes",
            kind: "long_text",
            prompt: "Anything else the kitchen should know?",
            helper:
              "Anaphylaxis, religious requirements, eating-disorder triggers, fasting windows — anything that doesn't fit a checkbox.",
            maxLength: 1000,
            required: false,
          },
        ],
      },
    ],
  };
}

// The 8 founding teams as picker options, mirroring DEFAULT_TEAMS in
// @camp404/db/camp-config (a test guards the two against drift). Used only to
// freeze BURNER_PROFILE_TEMPLATE; the stored definition's team anchors are
// overwritten from the live config on read, so these labels never surface.
export const DEFAULT_TEAM_OPTIONS: ReadonlyArray<TeamOption> = [
  { value: "kitchen", label: "Kitchen" },
  { value: "structures", label: "Structures" },
  { value: "power_and_lighting", label: "Power and Lighting" },
  { value: "sanitation_and_water", label: "Sanitation and Water" },
  { value: "health_and_safety", label: "Health and Safety" },
  { value: "art_and_activities", label: "Art and Activities" },
  { value: "ministry_of_memes", label: "Ministry of Memes" },
  { value: "ministry_of_vibes", label: "Ministry of Vibes" },
];

// The stored-shaped burner-profile definition — what the DB-backed accessor
// serves when no edited row exists yet (and the seed the in-app builder will
// start from). Its team anchors hold the default teams as placeholders;
// resolveTeamBindings replaces them with the live config on every read.
export const BURNER_PROFILE_TEMPLATE: Questionnaire =
  buildQuestionnaire(DEFAULT_TEAM_OPTIONS);

/**
 * Inject the live camp teams into a stored questionnaire definition's two
 * team-bound anchors (the team-interest sliders page + the team-lead
 * multi-select), leaving every other page/question untouched. The caller picks
 * the team set — active for a fresh picker, all (incl. archived) for validating
 * or displaying a stored response. Pure, so it runs identically client/server
 * and in tests. For the default template this reproduces buildQuestionnaire(teams)
 * exactly (asserted in questionnaire-definitions.test.ts), so persisting the
 * definition is behaviour-preserving.
 */
/**
 * Validate a raw stored definition (untyped JSONB) against the schema, falling
 * back to a known-good definition when it's absent or malformed — so a
 * half-written / older-shape row never renders a broken questionnaire. Pure (no
 * DB / server-only), so the data facade stays a thin DB+E2E wrapper around it.
 */
export function parseStoredDefinition(
  raw: unknown,
  fallback: Questionnaire | null,
): Questionnaire | null {
  const parsed = Questionnaire.safeParse(raw);
  return parsed.success ? parsed.data : fallback;
}

/**
 * Validate a raw stored BUILDER definition (the in-app, data-only kind). There
 * is no code fallback — builder questionnaires exist only as data, so a
 * malformed/absent row (or a legacy code definition, which has pages with
 * `questions` not `blocks`) yields null. Pure, so the data facade stays a thin
 * DB wrapper around it.
 */
export function parseStoredBuilderDefinition(
  raw: unknown,
): BuilderQuestionnaire | null {
  const parsed = BuilderQuestionnaire.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function resolveTeamBindings(
  definition: Questionnaire,
  teams: ReadonlyArray<TeamOption>,
): Questionnaire {
  return {
    ...definition,
    pages: definition.pages.map((page) => {
      if (page.kind !== "questions") return page;
      if (page.id === TEAM_INTERESTS_PAGE_ID) {
        return { ...page, questions: teams.map(teamInterestNumber) };
      }
      return {
        ...page,
        questions: page.questions.map((question) =>
          question.id === TEAM_LEAD_QUESTION_ID &&
          question.kind === "multi_select"
            ? { ...question, options: teamLeadOptions(teams) }
            : question,
        ),
      };
    }),
  };
}
