import "server-only";

import * as dietary from "@camp404/db/dietary";
import type { MenuDietary } from "@camp404/db/dietary";
import * as meals from "@camp404/db/kitchen-meals";
import type {
  AllergenPlan,
  MealChecks,
  PrepStep,
} from "@camp404/db/kitchen-meals";
import * as db from "@camp404/db/kitchen-menu";
import * as prices from "@camp404/db/kitchen-prices";
import type { ShoppingPrice } from "@camp404/db/kitchen-prices";
import type {
  KitchenMenu,
  KitchenMenuWriteResult,
  KitchenSnack,
  MenuBookRecipe,
  ShoppingFacts,
} from "@camp404/db/kitchen-menu";
import { dietaryTestStore } from "./test-store-dietary";
import { kitchenExtrasTestStore } from "./test-store-kitchen-extras";
import { kitchenMenuTestStore } from "./test-store-kitchen-menu";
import { twin } from "./twin";

// The Kitchen's menu, snacks and shopping list ticks (#244, #245), and its
// prices, allergy plans and prep steps (#245), from the database or, under
// E2E, the test store's twins. The checks both sides apply live once in
// @camp404/core (menuSlotProblem, shoppingPriceInput, allergenPlanInput,
// prepStepInput); lib/__tests__/kitchen-menu-agreement.test.ts and
// kitchen-extras-agreement.test.ts hold the rest equal. Each write re-checks
// the actor itself, so a caller passes only who is acting. Each read that
// holds a price or a count takes the viewer and answers null to anyone but a
// captain or a Kitchen lead.

export type {
  AllergenPlan,
  MealChecks,
  MenuDietary,
  PrepStep,
  ShoppingPrice,
  KitchenMenu,
  KitchenMenuWriteResult,
  KitchenSnack,
  MenuBookRecipe,
  ShoppingFacts,
};

const menu = twin(db, kitchenMenuTestStore, [
  "getKitchenMenu",
  "listMenuBook",
  "getSnacks",
  "getShoppingFacts",
  "addMenuItem",
  "removeMenuItem",
  "addSnack",
  "removeSnack",
  "setShoppingTicks",
]);

const priced = twin(prices, kitchenExtrasTestStore, [
  "getShoppingPricesFor",
  "setShoppingPrice",
]);

const checks = twin(meals, kitchenExtrasTestStore, [
  "getMealChecks",
  "recordAllergenPlan",
  "correctRecipeAllergens",
  "addPrepStep",
  "removePrepStep",
  "listSheetPrepSteps",
]);

const counts = twin(dietary, dietaryTestStore, ["getMenuDietaryFor"]);

// --- The menu, the snacks and the ticks ---------------------------------------

/** This year's menu. */
export const getKitchenMenu = menu.getKitchenMenu;
/** The recipe book as the menu's picker lists it. */
export const listMenuBook = menu.listMenuBook;
/** This year's snacks. */
export const getSnacks = menu.getSnacks;
/** Everything this year's shopping list is worked out from. */
export const getShoppingFacts = menu.getShoppingFacts;
/** A captain or a Kitchen lead puts a recipe on a meal. */
export const addMenuItem = menu.addMenuItem;
/** A captain or a Kitchen lead takes a recipe off a meal. */
export const removeMenuItem = menu.removeMenuItem;
/** A captain or a Kitchen lead adds a snack. */
export const addSnack = menu.addSnack;
/** A captain or a Kitchen lead takes a snack off. */
export const removeSnack = menu.removeSnack;
/** Any approved member ticks lines for the whole camp. */
export const setShoppingTicks = menu.setShoppingTicks;

// --- #245: prices, the dietary check, plans and prep steps --------------------

/** This year's shops and prices, or null: the viewer may not see prices. */
export const getShoppingPricesFor = priced.getShoppingPricesFor;
/** A captain or a Kitchen lead sets a line's shop and price. */
export const setShoppingPrice = priced.setShoppingPrice;
/** The meal plan's dietary counts, or null: the viewer may not see them. */
export const getMenuDietaryFor = counts.getMenuDietaryFor;
/** This year's allergy plans and prep steps. */
export const getMealChecks = checks.getMealChecks;
/** A captain or a Kitchen lead records a plan for an anaphylaxis. */
export const recordAllergenPlan = checks.recordAllergenPlan;
/** A captain or a Kitchen lead corrects what a recipe holds. */
export const correctRecipeAllergens = checks.correctRecipeAllergens;
/** A captain or a Kitchen lead adds a prep step under a recipe on a meal. */
export const addPrepStep = checks.addPrepStep;
/** A captain or a Kitchen lead takes a prep step (and its task) off. */
export const removePrepStep = checks.removePrepStep;
/** A year's prep steps, for the daily site sheet. */
export const listSheetPrepSteps = checks.listSheetPrepSteps;
