import type { Questionnaire } from "@camp404/types";

// Skeleton questionnaire. Real content will be configured later — for now
// just enough pages to exercise the multi-page wizard + slider rendering.
// Bump `version` whenever the question catalogue changes; existing responses
// stay attached to their original version on burner_profiles.version.

export const QUESTIONNAIRE: Questionnaire = {
  version: "2026.05.19-skeleton",
  pages: [
    {
      id: "kitchen",
      title: "Kitchen",
      subtitle:
        "Camp 404 runs on radical vegan hospitality. Tell us how you cook.",
      questions: [
        {
          id: "chef.create",
          kind: "slider",
          prompt: "Can you create recipes?",
          helper: "Inventing dishes from a pile of ingredients and a vibe.",
          min: 0,
          max: 10,
          step: 1,
          minLabel: "Never tried",
          maxLabel: "I write cookbooks",
          required: true,
        },
        {
          id: "chef.teach",
          kind: "slider",
          prompt: "Can you teach recipes?",
          helper: "Walking another camper through a cook in the dust.",
          min: 0,
          max: 10,
          step: 1,
          minLabel: "Solo only",
          maxLabel: "Born instructor",
          required: true,
        },
        {
          id: "chef.execute",
          kind: "slider",
          prompt: "Can you execute recipes?",
          helper: "Hand you a recipe — can you cook it for 40 people?",
          min: 0,
          max: 10,
          step: 1,
          minLabel: "I cremate toast",
          maxLabel: "Line-cook ready",
          required: true,
        },
        {
          id: "chef.burn",
          kind: "slider",
          prompt: "Can you burn recipes?",
          helper:
            "Honest answer — how often does the pot leave the fire blackened?",
          min: 0,
          max: 10,
          step: 1,
          minLabel: "Never",
          maxLabel: "Constantly",
          required: true,
        },
      ],
    },
    {
      id: "build",
      title: "Build & Fire",
      subtitle: "Camp infrastructure, fire performance, the mutant vehicle.",
      questions: [
        {
          id: "build.power_tools",
          kind: "slider",
          prompt: "Comfort with power tools",
          min: 0,
          max: 10,
          step: 1,
          minLabel: "Never used one",
          maxLabel: "Own a workshop",
          required: true,
        },
        {
          id: "fire.experience",
          kind: "single_select",
          prompt: "Fire-performance experience?",
          options: [
            { value: "none", label: "None — happy to spectate" },
            { value: "spinner", label: "I spin poi / staff / fans" },
            { value: "fire_safety", label: "I'm a trained fire safety" },
            { value: "performer", label: "I perform in fire jams" },
          ],
          required: true,
        },
      ],
    },
    {
      id: "extras",
      title: "Anything else?",
      subtitle: "Optional — share anything we should know about the burner you are.",
      questions: [
        {
          id: "extras.note",
          kind: "long_text",
          prompt: "Tell us about your burn-self",
          helper: "Skills, quirks, gifts, things you'd love to teach.",
          maxLength: 800,
          required: false,
        },
      ],
    },
  ],
};
