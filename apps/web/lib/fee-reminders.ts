import "server-only";

import * as db from "@camp404/db/fee-reminders";
import { feeReminderTestStore } from "./test-store-fee-reminders";
import { twin } from "./twin";

// Camp fee reminders (camp fees sprint, plan P "Reminders"): the Finance
// team's "Ask everyone to pledge" and "Remind who still owes", and what the
// dialog shows before either is pressed. From the database or, under E2E,
// the test store's twin. The writes re-check the actor (MONEY_KEEPER) and
// Collecting fees themselves; the caller passes only who is acting.
// lib/__tests__/fee-reminders-agreement.test.ts holds the two sides equal.
// The automatic reminder is @camp404/db/fee-reminders' remindFeesDueSoon,
// run from runDueWork (lib/background-work.ts).

export type {
  FeeReminderPerson,
  FeeReminderPreview,
} from "@camp404/db/fee-reminders";

const reminders = twin(db, feeReminderTestStore, [
  "feeReminderPreview",
  "askForPledges",
  "remindFeesOwed",
]);

export const feeReminderPreview = reminders.feeReminderPreview;
export const askForPledges = reminders.askForPledges;
export const remindFeesOwed = reminders.remindFeesOwed;
