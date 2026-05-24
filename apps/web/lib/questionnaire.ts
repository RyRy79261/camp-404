import type { Questionnaire } from "@camp404/types";

// Mandatory burner-profile questionnaire shown right after signup. Real
// copy will evolve — bump `version` whenever the catalogue changes;
// existing responses stay attached to their original version on
// burner_profiles.version so we can re-render them in context later.
//
// NOTE on PII: passport / SA-ID numbers and date of birth are captured
// here as ordinary text for the skeleton. Before going to production they
// must be moved to the pgcrypto-encrypted columns on `users`
// (passportEncrypted / saIdEncrypted) and stripped from `responses`.
// See brief §12.
//
// NOTE on the team-specific questionnaires: the team-interest sliders on
// the "Team interests" page drive which follow-up questionnaires the user
// gets activated for (kitchen, structures, …). Those follow-ups are
// separate bespoke pages and not modelled here.

const TEAMS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "kitchen", label: "Kitchen" },
  { value: "structures", label: "Structures" },
  { value: "power_and_lighting", label: "Power & Lighting" },
  { value: "sanitation_and_water", label: "Sanitation & Water" },
  { value: "health_and_safety", label: "Health & Safety" },
  { value: "art_and_activities", label: "Art & Activities" },
  { value: "ministry_of_memes", label: "Ministry of Memes" },
  { value: "ministry_of_vibes", label: "Ministry of Vibes" },
];

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

export const QUESTIONNAIRE: Questionnaire = {
  version: "2026.05.24-v4",
  pages: [
    {
      id: "about_you",
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
          kind: "short_text",
          prompt: "Country you're flying from",
          helper: "Where you'll be travelling to Afrikaburn from.",
          maxLength: 80,
          required: true,
        },
        {
          id: "id.type",
          kind: "single_select",
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
            "Stored privately — only used for the ticket allocation paperwork.",
          maxLength: 40,
          required: true,
        },
      ],
    },
    {
      id: "team_interests",
      title: "Team interests",
      subtitle:
        "Slide each team based on how keen you are to help. If you nudge a team above zero we'll send you their team-specific questionnaire later.",
      questions: TEAMS.map((t) => ({
        id: `team_interest.${t.value}`,
        kind: "slider" as const,
        prompt: t.label,
        min: 0,
        max: 5,
        step: 1,
        minLabel: "Not for me",
        maxLabel: "Sign me up",
        required: true,
      })),
    },
    {
      id: "cooking_competency",
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
      id: "hardware_competency",
      title: "Hardware competency",
      subtitle:
        "Building, wiring, fixing — the camp lives or dies on this stuff.",
      questions: [
        {
          id: "competency.hardware",
          kind: "scale",
          prompt: "How would you describe your hardware skills?",
          steps: [
            { value: "design", label: "I design and build rigs from scratch" },
            { value: "build", label: "I can build to a plan" },
            { value: "assist", label: "I can hold the torch and pass tools" },
            { value: "novice", label: "I'd rather not be near the power tools" },
          ],
          required: true,
        },
      ],
    },
    {
      id: "leadership_logistics",
      title: "Leadership & logistics",
      subtitle:
        "You can change any of these later — this is a starting picture.",
      questions: [
        {
          id: "team_lead.interests",
          kind: "multi_select",
          prompt: "I would like to be a team lead of…",
          helper: "Pick none if you'd rather just be in the trenches.",
          options: [...TEAMS],
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
      title: "Burn history",
      subtitle:
        "So we know who the dust-veterans are and who's getting their first hug from the playa.",
      questions: [
        {
          id: "history.camp404_before",
          kind: "single_select",
          prompt: "Have you been with Camp 404 before?",
          options: [
            { value: "no", label: "No — this would be my first year" },
            { value: "yes_once", label: "Yes — one previous year" },
            { value: "yes_multi", label: "Yes — multiple years" },
          ],
          required: true,
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
      id: "dietary",
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
