import type { Questionnaire } from "@camp404/types";

// Mandatory burner-profile questionnaire shown right after signup. Real
// copy will evolve — bump `version` whenever the catalogue changes;
// existing responses stay attached to their original version on
// burner_profiles.version so we can re-render them in context later.
//
// NOTE on PII: passport / SA-ID numbers are captured here as ordinary text
// for the skeleton. Before going to production they must be moved to the
// pgcrypto-encrypted columns on `users` (passportEncrypted / saIdEncrypted)
// and stripped from `responses`. See brief §12.
//
// NOTE on voice-to-text: long-form fields (intent, bio) will get a press-
// and-hold dictation button. Brief / reference app coming separately.

export const QUESTIONNAIRE: Questionnaire = {
  version: "2026.05.19-v2",
  pages: [
    {
      id: "about_you",
      title: "About you",
      subtitle: "The boring-but-necessary part. Used for ticket admin.",
      questions: [
        {
          id: "name.first",
          kind: "short_text",
          prompt: "First name",
          maxLength: 80,
          required: true,
        },
        {
          id: "name.last",
          kind: "short_text",
          prompt: "Surname",
          maxLength: 80,
          required: true,
        },
        {
          id: "nationality",
          kind: "short_text",
          prompt: "Nationality",
          helper: "Country on your passport.",
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
            "Stored privately. Used only for the ticket allocation paperwork.",
          maxLength: 40,
          required: true,
        },
        {
          id: "telegram.handle",
          kind: "short_text",
          prompt: "Telegram handle",
          helper: "Without the @. We'll send the camp group link separately.",
          maxLength: 64,
          required: true,
        },
      ],
    },
    {
      id: "burner_history",
      title: "Burner history",
      subtitle:
        "So we know who the dust-veterans are and who's getting their first hug from the playa.",
      questions: [
        {
          id: "history.afrikaburn_years",
          kind: "multi_select",
          prompt: "Which years of Afrikaburn have you attended?",
          helper: "Leave blank if this is your first one — welcome, virgin.",
          options: [
            { value: "pre_2019", label: "Earlier than 2019" },
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
          id: "history.other_burns",
          kind: "long_text",
          prompt: "Other burns or burn-adjacent projects?",
          helper:
            "Burning Man, regional burns, theme camps, art installations, fire-arts collectives — anything dusty.",
          maxLength: 1000,
          required: false,
        },
      ],
    },
    {
      id: "ticketing",
      title: "Ticketing",
      subtitle:
        "Camp 404 receives a small allocation of DDTs (Directed Distribution Tickets) for members who can't get one through the main sale.",
      questions: [
        {
          id: "ticket.assistance",
          kind: "single_select",
          prompt: "Do you need help getting an Afrikaburn ticket?",
          helper:
            "Used to decide who to nominate for the camp's DDT allocation.",
          options: [
            { value: "no", label: "No — I already have a ticket or will buy one" },
            { value: "maybe", label: "Maybe — depends on the main sale" },
            { value: "yes", label: "Yes — please nominate me for a DDT" },
          ],
          required: true,
        },
      ],
    },
    {
      id: "intent",
      title: "What do you want to do this year?",
      subtitle:
        "Cooking, building, performing, vibe-tending, fire-spinning, holding-down-the-fort — tell us what you want to bring.",
      questions: [
        {
          id: "intent.statement",
          kind: "long_text",
          prompt: "Your intent for this burn",
          helper:
            "Voice-to-text coming soon — for now, type it out. A sentence is fine.",
          maxLength: 1200,
          required: true,
        },
      ],
    },
    {
      id: "skills",
      title: "Skills",
      subtitle:
        "Sliders. Be honest — overstating helps nobody when the dust hits.",
      questions: [
        {
          id: "skills.kitchen",
          kind: "slider",
          prompt: "Kitchen / cooking competency",
          helper:
            "0–3 might set the recipe on fire · 4–6 can follow a recipe · 7–8 can teach recipes · 9–10 can create recipes from a pile of ingredients.",
          min: 0,
          max: 10,
          step: 1,
          minLabel: "Sets recipes on fire",
          maxLabel: "Invents recipes",
          required: true,
        },
        {
          id: "skills.vibes",
          kind: "slider",
          prompt: "Ministry of Vibes",
          helper:
            "Art, decor, atmospheric magic. Can you make a corner of the desert feel like a portal?",
          min: 0,
          max: 10,
          step: 1,
          minLabel: "I just appreciate it",
          maxLabel: "I make the vibe",
          required: true,
        },
        {
          id: "skills.memes",
          kind: "slider",
          prompt: "Ministry of Memes",
          helper:
            "People management, culture-keeping, conflict-defusing, in-jokes, holding the camp together socially.",
          min: 0,
          max: 10,
          step: 1,
          minLabel: "I keep to myself",
          maxLabel: "Born facilitator",
          required: true,
        },
        {
          id: "skills.power_lighting",
          kind: "slider",
          prompt: "Power & Lighting",
          helper:
            "Engineering, wiring, generators, inverters, LEDs. Are you the person we call when the camp goes dark?",
          min: 0,
          max: 10,
          step: 1,
          minLabel: "I plug things in",
          maxLabel: "I built the rig",
          required: true,
        },
        {
          id: "skills.other",
          kind: "long_text",
          prompt: "Any other skills?",
          helper:
            "Welding, sewing, medic training, sound, languages, project management, mutant-vehicle wrangling — anything we'd want to know.",
          maxLength: 800,
          required: false,
        },
      ],
    },
    {
      id: "bio",
      title: "A bit about you",
      subtitle:
        "Free-form. Who are you when you're in the dust? This is the bio your team lead reads first.",
      questions: [
        {
          id: "bio.statement",
          kind: "long_text",
          prompt: "Tell us about yourself",
          helper:
            "Voice-to-text coming soon. Anything you want us to know goes here.",
          maxLength: 2000,
          required: true,
        },
      ],
    },
    {
      id: "referral",
      title: "How'd you find us?",
      subtitle: "Closing the loop on how the camp grows.",
      questions: [
        {
          id: "referral.source",
          kind: "single_select",
          prompt: "How did you hear about Camp 404?",
          options: [
            { value: "member", label: "A current member invited me" },
            { value: "past_burn", label: "I met the camp at a previous burn" },
            { value: "online", label: "Online / social media" },
            { value: "fire_jam", label: "Saw the Dance of 1000 Flames" },
            { value: "other", label: "Other" },
          ],
          required: true,
        },
        {
          id: "referral.who",
          kind: "short_text",
          prompt: "Who do you know in the camp?",
          helper:
            "Names of members who can vouch for you. Optional, but it helps.",
          maxLength: 300,
          required: false,
        },
      ],
    },
  ],
};
