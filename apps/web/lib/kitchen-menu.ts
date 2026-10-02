import "server-only";

import type { SheetPrepStep } from "@camp404/core";
import * as dietary from "@camp404/db/dietary";
import type { MenuDietary } from "@camp404/db/dietary";
import * as meals from "@camp404/db/kitchen-meals";
import type {
  AllergenPlan,
  MealChecks,
  MealWriteResult,
  PrepStep,
} from "@camp404/db/kitchen-meals";
import * as db from "@camp404/db/kitchen-menu";
import * as prices from "@camp404/db/kitchen-prices";
import type {
  PriceWriteResult,
  ShoppingPrice,
} from "@camp404/db/kitchen-prices";
import type {
  KitchenMenu,
  KitchenMenuWriteResult,
  KitchenSnack,
  MenuBookRecipe,
  ShoppingFacts,
} from "@camp404/db/kitchen-menu";
import { usesTestStore } from "./test-mode";
import { dietaryTestStore } from "./test-store-dietary";
import { kitchenExtrasTestStore } from "./test-store-kitchen-extras";
import { testStore } from "./test-store";
import {
  storeAddMenuItem,
  storeAddSnack,
  storeKitchenMenu,
  storeRemoveMenuItem,
  storeRemoveSnack,
  storeSetShoppingTicks,
  storeShoppingFacts,
  storeSnacks,
} from "./test-store-kitchen-menu";

// The Kitchen's menu, snacks and shopping list ticks (#244, #245), from the
// database or, under E2E, the test store. The rules live in
// @camp404/db/kitchen-menu; the store repeats them. Each write re-checks the
// actor itself, so a caller passes only who is acting.

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

/** This year's menu. */
export async function getKitchenMenu(): Promise<KitchenMenu> {
  return usesTestStore() ? storeKitchenMenu() : db.getKitchenMenu();
}

/** The recipe book as the menu's picker lists it. */
export async function listMenuBook(): Promise<MenuBookRecipe[]> {
  return usesTestStore() ? testStore.menuBook() : db.listMenuBook();
}

/** This year's snacks. */
export async function getSnacks(): Promise<KitchenSnack[]> {
  return usesTestStore() ? storeSnacks() : db.getSnacks();
}

/** Everything this year's shopping list is worked out from. */
export async function getShoppingFacts(): Promise<ShoppingFacts> {
  return usesTestStore() ? storeShoppingFacts() : db.getShoppingFacts();
}

/** A captain or a Kitchen lead puts a recipe on a meal. */
export async function addMenuItem(
  input: Parameters<typeof db.addMenuItem>[0],
): Promise<KitchenMenuWriteResult<{ itemId: string }>> {
  return usesTestStore() ? storeAddMenuItem(input) : db.addMenuItem(input);
}

/** A captain or a Kitchen lead takes a recipe off a meal. */
export async function removeMenuItem(
  input: Parameters<typeof db.removeMenuItem>[0],
): Promise<KitchenMenuWriteResult> {
  return usesTestStore()
    ? storeRemoveMenuItem(input)
    : db.removeMenuItem(input);
}

/** A captain or a Kitchen lead adds a snack. */
export async function addSnack(
  input: Parameters<typeof db.addSnack>[0],
): Promise<KitchenMenuWriteResult<{ snackId: string }>> {
  return usesTestStore() ? storeAddSnack(input) : db.addSnack(input);
}

/** A captain or a Kitchen lead takes a snack off. */
export async function removeSnack(
  input: Parameters<typeof db.removeSnack>[0],
): Promise<KitchenMenuWriteResult> {
  return usesTestStore() ? storeRemoveSnack(input) : db.removeSnack(input);
}

/** Any approved member ticks lines for the whole camp. */
export async function setShoppingTicks(
  input: Parameters<typeof db.setShoppingTicks>[0],
): Promise<KitchenMenuWriteResult> {
  return usesTestStore()
    ? storeSetShoppingTicks(input)
    : db.setShoppingTicks(input);
}

// --- #245: prices, the dietary check, plans and prep steps --------------------
// From @camp404/db/kitchen-prices, dietary and kitchen-meals, or under E2E the
// twins (test-store-kitchen-extras.ts, test-store-dietary.ts). Each read that
// holds a price or a count takes the viewer and answers null to anyone but a
// captain or a Kitchen lead; each write re-checks the actor itself.

/** This year's shops and prices, or null: the viewer may not see prices. */
export async function getShoppingPricesFor(
  viewerId: string,
): Promise<ShoppingPrice[] | null> {
  return usesTestStore()
    ? kitchenExtrasTestStore.getShoppingPricesFor(viewerId)
    : prices.getShoppingPricesFor(viewerId);
}

/** A captain or a Kitchen lead sets a line's shop and price. */
export async function setShoppingPrice(
  input: Parameters<typeof prices.setShoppingPrice>[0],
): Promise<PriceWriteResult<{ version: number }>> {
  return usesTestStore()
    ? kitchenExtrasTestStore.setShoppingPrice(input)
    : prices.setShoppingPrice(input);
}

/** The meal plan's dietary counts, or null: the viewer may not see them. */
export async function getMenuDietaryFor(
  viewerId: string,
): Promise<MenuDietary | null> {
  return usesTestStore()
    ? dietaryTestStore.getMenuDietaryFor(viewerId)
    : dietary.getMenuDietaryFor(viewerId);
}

/** This year's allergy plans and prep steps. */
export async function getMealChecks(): Promise<MealChecks> {
  return usesTestStore()
    ? kitchenExtrasTestStore.getMealChecks()
    : meals.getMealChecks();
}

/** A captain or a Kitchen lead records a plan for an anaphylaxis. */
export async function recordAllergenPlan(
  input: Parameters<typeof meals.recordAllergenPlan>[0],
): Promise<MealWriteResult<{ version: number }>> {
  return usesTestStore()
    ? kitchenExtrasTestStore.recordAllergenPlan(input)
    : meals.recordAllergenPlan(input);
}

/** A captain or a Kitchen lead corrects what a recipe holds. */
export async function correctRecipeAllergens(
  input: Parameters<typeof meals.correctRecipeAllergens>[0],
): Promise<MealWriteResult<{ revision: number }>> {
  return usesTestStore()
    ? kitchenExtrasTestStore.correctRecipeAllergens(input)
    : meals.correctRecipeAllergens(input);
}

/** A captain or a Kitchen lead adds a prep step under a recipe on a meal. */
export async function addPrepStep(
  input: Parameters<typeof meals.addPrepStep>[0],
): Promise<MealWriteResult<{ stepId: string; onBoard: boolean; due: string }>> {
  return usesTestStore()
    ? kitchenExtrasTestStore.addPrepStep(input)
    : meals.addPrepStep(input);
}

/** A captain or a Kitchen lead takes a prep step (and its task) off. */
export async function removePrepStep(
  input: Parameters<typeof meals.removePrepStep>[0],
): Promise<MealWriteResult> {
  return usesTestStore()
    ? kitchenExtrasTestStore.removePrepStep(input)
    : meals.removePrepStep(input);
}

/** A year's prep steps, for the daily site sheet. */
export async function listSheetPrepSteps(
  cycle: number,
): Promise<SheetPrepStep[]> {
  return usesTestStore()
    ? kitchenExtrasTestStore.listSheetPrepSteps(cycle)
    : meals.listSheetPrepSteps(cycle);
}
