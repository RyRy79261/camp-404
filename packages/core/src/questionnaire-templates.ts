// Ready-made questionnaires a captain can START FROM (#251). A template is
// only a starting draft: "Start from template" copies it into an ordinary
// builder draft with fresh ids, and from then on it is the captain's to edit,
// publish and send like any other. Nothing here is seeded into the database
// and nothing is sent automatically (owner: questionnaires are in-app
// editable, not seeded).
//
// The post-burn survey's structure follows the camp's own survey (sections
// for shifts, kitchen, water and waste, communication and general; statements
// on a five-point true/false scale with N/A, some for team leads only; a star
// rating per meal; an open question per area). Its words are written fresh:
// no question or answer is imported.
//
// Pure — no I/O, no env.

import {
  starScaleLabels,
  type GridRow,
  MEALS,
  type Meal,
  type MealPlanDay,
  type Question,
  type Questionnaire,
  type QuestionsPage,
} from "@camp404/types";

/** The templates a captain can start a draft from. */
export const QUESTIONNAIRE_TEMPLATES = ["post_burn_survey"] as const;
export type QuestionnaireTemplateKey = (typeof QUESTIONNAIRE_TEMPLATES)[number];

export function isQuestionnaireTemplateKey(
  value: unknown,
): value is QuestionnaireTemplateKey {
  return (QUESTIONNAIRE_TEMPLATES as readonly unknown[]).includes(value);
}

/** The five points of the survey's statements, lowest first, so a higher
 * average means "more true". */
export const TRUE_FALSE_SCALE = [
  "Definitely false",
  "Mostly false",
  "Not sure",
  "Mostly true",
  "Definitely true",
] as const;

// The camp does no lunch (the owner, 2026-10-01): breakfast and dinner.
const MEAL_WORD: Record<Meal, string> = {
  breakfast: "breakfast",
  dinner: "dinner",
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Mon 27 Apr" for day `n` (1-based) of a plan whose day 1 is `firstDay`. */
function dayDate(firstDay: string, n: number): string | null {
  const start = Date.parse(`${firstDay}T00:00:00.000Z`);
  if (Number.isNaN(start)) return null;
  const date = new Date(start + (n - 1) * DAY_MS);
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * One rating row per meal the year's meal plan serves (a meal with plates
 * above 0), in day order: "Day 3 dinner (Tue 28 Apr)". The row id names the
 * slot (`meal_d3_dinner`), so filling the rows again from the same plan keeps
 * the ids, and answers stay on their meal.
 */
export function mealPlanRatingRows(plan: {
  days: readonly MealPlanDay[];
  firstDay: string | null;
}): GridRow[] {
  const rows: GridRow[] = [];
  plan.days.forEach((day, index) => {
    const n = index + 1;
    const date = plan.firstDay ? dayDate(plan.firstDay, n) : null;
    for (const meal of MEALS) {
      if (day[meal] <= 0) continue;
      rows.push({
        id: `meal_d${n}_${meal}`,
        label: `Day ${n} ${MEAL_WORD[meal]}${date ? ` (${date})` : ""}`,
      });
    }
  });
  return rows;
}

/** The meal rows to use when the year's meal plan serves nothing yet. */
export const FALLBACK_MEAL_ROWS: readonly GridRow[] = [
  { id: "meal_breakfasts", label: "Breakfasts" },
  { id: "meal_dinners", label: "Dinners" },
];

function statements(
  id: string,
  prompt: string,
  rows: [string, string][],
  extra: { leadsOnly?: boolean; helper?: string } = {},
): Question {
  return {
    id,
    kind: "rating_grid",
    prompt,
    ...(extra.helper ? { helper: extra.helper } : {}),
    rows: rows.map(([rowId, label]) => ({ id: rowId, label })),
    scale: [...TRUE_FALSE_SCALE],
    allowNa: true,
    required: false,
    ...(extra.leadsOnly ? { leadsOnly: true } : {}),
  };
}

function openQuestion(id: string, prompt: string): Question {
  return { id, kind: "long_text", prompt, maxLength: 2000, required: false };
}

function section(
  id: string,
  title: string,
  subtitle: string,
  questions: Question[],
): QuestionsPage {
  return {
    id,
    kind: "questions",
    title,
    subtitle,
    pageType: "question",
    questions,
  };
}

/**
 * The post-burn survey, ready to edit. `mealRows` are the rows of its meal
 * rating (from `mealPlanRatingRows`); with none, the survey rates breakfasts,
 * lunches and dinners as a whole. Ids are readable here; the caller gives the
 * draft fresh ones (`regenerateQuestionnaireIds`).
 */
export function postBurnSurveyTemplate(
  mealRows: readonly GridRow[] = [],
): Questionnaire {
  const meals = mealRows.length > 0 ? mealRows : FALLBACK_MEAL_ROWS;
  return {
    version: "1",
    title: "Post-burn survey",
    pages: [
      section(
        "shifts",
        "Shifts",
        "How did your shifts go? Skip anything that doesn't apply to you.",
        [
          statements("shifts_member", "How true are these for you?", [
            ["times", "My shifts were at times that suited me"],
            ["knew", "I knew when and where my shifts were"],
            ["fair", "The work was shared fairly"],
            ["tools", "I had what I needed to do my shifts"],
          ]),
          statements(
            "shifts_leads",
            "For team leads",
            [
              ["enough", "My team had enough people"],
              ["help", "I got help from the captains when I asked"],
            ],
            {
              leadsOnly: true,
              helper: "Only team leads and captains see this.",
            },
          ),
          openQuestion("shifts_notes", "Anything else about shifts?"),
        ],
      ),
      section(
        "kitchen",
        "Kitchen",
        "Tell the kitchen what worked. Your ratings help plan next year's menu.",
        [
          {
            id: "kitchen_meals",
            kind: "rating_grid",
            prompt: "Rate the meals",
            helper:
              'One to five stars. Pick "Didn\'t eat it" if you missed one.',
            display: "stars",
            rows: meals.map((row) => ({ ...row })),
            scale: starScaleLabels(5),
            allowNa: true,
            naLabel: "Didn't eat it",
            required: false,
          },
          statements("kitchen_member", "How true are these for you?", [
            ["enough", "There was enough food"],
            ["diet", "My dietary needs were met"],
            ["clean", "The kitchen was clean and safe"],
          ]),
          openQuestion(
            "kitchen_notes",
            "What should the kitchen do again, or change?",
          ),
        ],
      ),
      section(
        "water",
        "Water and waste",
        "Water, showers and what we took home.",
        [
          statements("water_member", "How true are these for you?", [
            ["drink", "There was always water to drink"],
            ["showers", "The showers worked well"],
            ["sorting", "I knew how to sort our waste"],
            ["trace", "We left no trace"],
          ]),
          openQuestion("water_notes", "Anything else about water and waste?"),
        ],
      ),
      section(
        "communication",
        "Communication",
        "How well did news reach you, before and during the burn?",
        [
          statements("comms_member", "How true are these for you?", [
            ["before", "I got the news I needed before the burn"],
            ["ask", "I knew who to ask when I had a question"],
            ["clear", "Camp messages were clear"],
          ]),
          statements(
            "comms_leads",
            "For team leads",
            [["informed", "The captains kept leads up to date"]],
            {
              leadsOnly: true,
              helper: "Only team leads and captains see this.",
            },
          ),
          openQuestion("comms_notes", "Anything else about communication?"),
        ],
      ),
      section("general", "General", "The burn as a whole.", [
        {
          id: "general_rating",
          kind: "rating",
          prompt: "How was your burn with Camp 404?",
          steps: 5,
          glyph: "star",
          required: false,
        },
        {
          id: "general_again",
          kind: "single_select",
          prompt: "Would you camp with us again?",
          options: [
            { value: "yes", label: "Yes" },
            { value: "maybe", label: "Maybe" },
            { value: "no", label: "No" },
          ],
          required: false,
          display: "radio",
        },
        openQuestion("general_best", "What was the best part?"),
        openQuestion("general_change", "What should we change next year?"),
      ]),
    ],
  };
}

/** A starting definition for a template key. */
export function questionnaireTemplate(
  key: QuestionnaireTemplateKey,
  context: { mealRows?: readonly GridRow[] } = {},
): Questionnaire {
  switch (key) {
    case "post_burn_survey":
      return postBurnSurveyTemplate(context.mealRows);
  }
}
