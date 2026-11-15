import {
  ALLERGEN_CHECKER,
  MEAL_PLAN_EDITOR,
  PREP_EDITOR,
  SHOPPING_PRICER,
  type Rule,
} from "@camp404/core";
import {
  ALLERGENS_REFUSAL,
  MEAL_PLAN_REFUSAL,
  MENU_REFUSAL,
  PLAN_REFUSAL,
  PREP_REFUSAL,
  PRICE_REFUSAL,
  SNACK_REFUSAL,
} from "../../recipe-copy";
import { byRule, GATES, type Gate, type ToolCapability } from "../gates";

// The meal plan's and the shopping list's writes over MCP: each gate is the
// rule its page's action asks at the door (kitchen/meal-plan/actions.ts,
// kitchen/shopping/actions.ts), with that action's own refusal. The rules are
// the same people today (a captain or a Kitchen lead); each gate names its
// own so a change to one rule follows here.

const kitchenGate = (rule: Rule, refusal: string): Gate => ({
  who: "Captains and Kitchen leads",
  allows: byRule(rule),
  refusal,
});

const mealPlan = kitchenGate(MEAL_PLAN_EDITOR, MEAL_PLAN_REFUSAL);
const menu = kitchenGate(MEAL_PLAN_EDITOR, MENU_REFUSAL);
const snacks = kitchenGate(MEAL_PLAN_EDITOR, SNACK_REFUSAL);
const plan = kitchenGate(ALLERGEN_CHECKER, PLAN_REFUSAL);
const allergens = kitchenGate(ALLERGEN_CHECKER, ALLERGENS_REFUSAL);
const prep = kitchenGate(PREP_EDITOR, PREP_REFUSAL);
const price = kitchenGate(SHOPPING_PRICER, PRICE_REFUSAL);

const MEAL_PLAN_PAGE = "/kitchen/meal-plan";
const SHOPPING_PAGE = "/kitchen/shopping";

export const KITCHEN_PLAN_CAPABILITIES: Readonly<
  Record<string, ToolCapability>
> = {
  get_meal_plan_for_editing: {
    kind: "read",
    area: "Kitchen",
    gate: mealPlan,
    does: "The meal plan as its editors see it: the version, menu item ids, snack ids, allergy flags (counts only), plans, prep steps and the recipe book to pick from.",
    page: MEAL_PLAN_PAGE,
  },
  set_meal_plan_plates: {
    kind: "write",
    area: "Kitchen",
    gate: mealPlan,
    does: "Change the plates at breakfast or dinner on some days, on the meal plan version you read.",
    page: MEAL_PLAN_PAGE,
  },
  add_menu_item: {
    kind: "write",
    area: "Kitchen",
    gate: menu,
    does: "Put a recipe from the book on a meal of the menu.",
    page: MEAL_PLAN_PAGE,
  },
  remove_menu_item: {
    kind: "write",
    area: "Kitchen",
    gate: menu,
    does: "Take a recipe off a meal (not one with prep steps or an allergy plan: that is on the page).",
    page: MEAL_PLAN_PAGE,
  },
  add_snack: {
    kind: "write",
    area: "Kitchen",
    gate: snacks,
    does: "Add a snack to the year's list.",
    page: MEAL_PLAN_PAGE,
  },
  remove_snack: {
    kind: "write",
    area: "Kitchen",
    gate: snacks,
    does: "Take a snack off the year's list.",
    page: MEAL_PLAN_PAGE,
  },
  record_allergen_plan: {
    kind: "write",
    area: "Kitchen",
    gate: plan,
    does: "Record or change the kitchen's plan for an anaphylaxis on a recipe on a meal, on the plan version you read.",
    page: MEAL_PLAN_PAGE,
  },
  correct_recipe_allergens: {
    kind: "write",
    area: "Kitchen",
    gate: allergens,
    does: "Correct which allergens a recipe's book version holds, on the revision you read.",
    page: MEAL_PLAN_PAGE,
  },
  add_prep_step: {
    kind: "write",
    area: "Kitchen",
    gate: prep,
    does: "Add a prep step under a recipe on a meal; one due before we leave goes on the task board.",
    page: MEAL_PLAN_PAGE,
  },
  list_shopping_lines: {
    kind: "read",
    area: "Kitchen",
    gate: GATES.member,
    does: "The shopping list's lines with the key and amount a tick names (captains and Kitchen leads also get each price's version).",
    page: SHOPPING_PAGE,
  },
  set_shopping_ticks: {
    kind: "write",
    area: "Kitchen",
    gate: GATES.member,
    does: "Tick or untick lines of the shopping list for the whole camp, at the amounts you read.",
    page: SHOPPING_PAGE,
  },
  set_shopping_price: {
    kind: "write",
    area: "Kitchen",
    gate: price,
    does: "Set a shopping line's shop and price (rands), on the version you read.",
    page: SHOPPING_PAGE,
  },
};
