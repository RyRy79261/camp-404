import "server-only";

import * as db from "@camp404/db/rental";
import type {
  MyRental,
  RentalItem,
  RentalLine,
  RentalOrder,
  RentalOverview,
  RentalOwnTent,
  RentalResult,
  RentalSharer,
  RentalTent,
  RentalTentAnswer,
  RentalTentNeed,
  RentalUnanswered,
  SharedTent,
} from "@camp404/db/rental";
import { rentalTestStore } from "./test-store-rental";
import { twin } from "./twin";

// Gear rental (#241), from the database or, under E2E, the test store's twin.
// The rules both sides apply (the order checks, pricing, tent conflicts and
// the refusal sentences) are functions in @camp404/core/rental;
// lib/__tests__/rental-agreement.test.ts holds the rest equal. A member's
// write takes the signed-in member's id; a captain's write re-checks the
// actor itself, so a caller passes only who is acting, never a rank. The
// captains' reads do not gate: the page does.

export type {
  MyRental,
  RentalItem,
  RentalLine,
  RentalOrder,
  RentalOverview,
  RentalOwnTent,
  RentalResult,
  RentalSharer,
  RentalTent,
  RentalTentAnswer,
  RentalTentNeed,
  RentalUnanswered,
  SharedTent,
};

const rental = twin(db, rentalTestStore, [
  "listRentalItems",
  "getMyRental",
  "listRentalSharerChoices",
  "listRentalOrders",
  "getRentalOrderOf",
  "getRentalOverview",
  "listRentalUnanswered",
  "getRentalMember",
  "addRentalItem",
  "editRentalItem",
  "archiveRentalItem",
  "saveRentalOrder",
  "withdrawRentalOrder",
  "fillRentalOrderFor",
  "askForGearOrders",
  "confirmRentalOrder",
  "reopenRentalOrder",
  "setTentLabel",
]);

// --- Reads --------------------------------------------------------------------

export const listRentalItems = rental.listRentalItems;
/** The member's own order, the catalogue, and the tents they were put in. */
export const getMyRental = rental.getMyRental;
export const listRentalSharerChoices = rental.listRentalSharerChoices;
/** Every order, for captains. */
export const listRentalOrders = rental.listRentalOrders;
/** One member's order, for captains. */
export const getRentalOrderOf = rental.getRentalOrderOf;
/** The totals and the tents, for captains. */
export const getRentalOverview = rental.getRentalOverview;
/** Who is coming and has not sent an order, for captains. */
export const listRentalUnanswered = rental.listRentalUnanswered;
/** One approved member, for a captain filling in their order. */
export const getRentalMember = rental.getRentalMember;

// --- Writes -------------------------------------------------------------------

export const addRentalItem = rental.addRentalItem;
export const editRentalItem = rental.editRentalItem;
export const archiveRentalItem = rental.archiveRentalItem;
export const saveRentalOrder = rental.saveRentalOrder;
export const withdrawRentalOrder = rental.withdrawRentalOrder;
export const fillRentalOrderFor = rental.fillRentalOrderFor;
export const askForGearOrders = rental.askForGearOrders;
export const confirmRentalOrder = rental.confirmRentalOrder;
export const reopenRentalOrder = rental.reopenRentalOrder;
export const setTentLabel = rental.setTentLabel;
