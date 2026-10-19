import "server-only";

import { usesTestStore } from "./test-mode";

// One switch per domain between the database and the E2E test store.
//
// A domain's facade (lib/payments.ts, lib/dues.ts, ...) names the data
// functions it hands out ONCE:
//
//   const ledger = twin(db, testStore, ["listPayments", "recordPayment"]);
//   export const listPayments = ledger.listPayments;
//
// Each method asks `usesTestStore()` when it is CALLED, then calls the store's
// method of the same name, or the real module's. Both are looked up at call
// time too, so a unit test's `vi.mock` (or `vi.spyOn`) of the db module still
// intercepts the call. The store's method is called on the store object, so
// a store method may use `this`.
//
// The types hold the two sides together: the store method must answer what
// the real one answers (at once or in a promise), and its arguments must be
// ones the real function takes. The twinned method takes the STORE's
// arguments, so a db function's trailing `db`/`tx` parameter stays off the
// facade. A twinned method always answers in a promise, and a store method
// that answers `null` is that answer (no fall-through to the database).
//
// A facade function that adds real logic (encrypting at the write boundary,
// mapping a row, after() work) stays a function of its own; only the
// pass-throughs go through a twin. Each twinned domain has an agreement suite
// (lib/__tests__/<domain>-agreement.test.ts) that calls the facade with the
// store off (PGlite) and on, and compares the answers.

type Answer<F> = F extends (...args: never[]) => infer O ? Awaited<O> : never;

/** What the store side must offer for keys K of the real module R. */
export type StoreSide<R, K extends keyof R> = {
  [P in K]: (...args: never[]) => Answer<R[P]> | Promise<Answer<R[P]>>;
};

/** The facade's methods: the store's arguments, the real module's answer. */
export type Twin<R, S, K extends keyof R & keyof S> = {
  [P in K]: S[P] extends (...args: infer A) => unknown
    ? R[P] extends (...args: infer RA) => unknown
      ? A extends RA
        ? (...args: A) => Promise<Answer<R[P]>>
        : never
      : never
    : never;
};

type Callable = (...args: unknown[]) => unknown;

/**
 * The facade's backend for one domain: `keys` of the real module, each
 * answered by the test store when `usesTestStore()` is on at call time.
 */
export function twin<
  R extends object,
  S extends StoreSide<R, K[number]>,
  const K extends readonly (keyof R & keyof S & string)[],
>(real: R, store: S, keys: K): Twin<R, S, K[number]> {
  const out: Record<string, Callable> = {};
  for (const key of keys) {
    out[key] = async (...args: unknown[]) =>
      usesTestStore()
        ? (store as unknown as Record<string, Callable>)[key]!(...args)
        : (real as unknown as Record<string, Callable>)[key]!(...args);
  }
  return out as Twin<R, S, K[number]>;
}
