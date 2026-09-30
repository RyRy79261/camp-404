import "server-only";

import * as db from "@camp404/db/kitchen-menu";
import type {
  KitchenMenu,
  KitchenMenuWriteResult,
  KitchenSnack,
  ShoppingFacts,
} from "@camp404/db/kitchen-menu";
import { usesTestStore } from "./test-mode";
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
  KitchenMenu,
  KitchenMenuWriteResult,
  KitchenSnack,
  ShoppingFacts,
};

/** This year's menu. */
export async function getKitchenMenu(): Promise<KitchenMenu> {
  return usesTestStore() ? storeKitchenMenu() : db.getKitchenMenu();
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
