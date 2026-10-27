// "Remind me tomorrow" on the pay guide (camp fees sprint, mock-up step 4 A):
// the guide hides until the next camp day, in this browser only. All that is
// stored is that day (YYYY-MM-DD), never an amount, a reference or who it is.
// Pure but for the two storage calls, and safe in a browser.

/** The browser storage key. Only a day is ever written under it. */
export const PAY_GUIDE_HIDDEN_KEY = "camp404:pay-guide-hidden-until";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The camp day after `today` (both YYYY-MM-DD). */
export function dayAfter(today: string): string {
  const date = new Date(`${today}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** Whether a stored day still hides the guide on `today`. */
export function hiddenOn(stored: string | null, today: string): boolean {
  return stored !== null && DAY.test(stored) && today < stored;
}

/** The stored day, or null (no storage, or nothing stored). */
export function readHiddenUntil(): string | null {
  try {
    return window.localStorage.getItem(PAY_GUIDE_HIDDEN_KEY);
  } catch {
    return null;
  }
}

/** Hide the guide until the day after `today`. */
export function hideUntilTomorrow(today: string): void {
  try {
    window.localStorage.setItem(PAY_GUIDE_HIDDEN_KEY, dayAfter(today));
  } catch {
    // No storage (a private window): it hides for this page only.
  }
}
