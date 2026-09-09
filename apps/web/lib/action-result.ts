import { unstable_rethrow } from "next/navigation";

// The `{ok:true} | {ok:false, error}` contract every result-object server
// action advertises, plus the wrapper that makes the contract actually hold.
//
// Before this, only `createInviteAction` try/caught its DB write; the
// announcements, camp-management and profile actions converted validation and
// authz failures but let a transient DB throw straight past the typed contract
// to the error boundary (DEFERRED.md "Result-object actions still throw raw on
// DB errors"). `runAction` closes that: one wrap per action, no per-call-site
// try/catch to forget.
//
// Deliberately NOT `import "server-only"` — this is a pure control-flow helper
// with unit tests, and its callers are the "use server" modules.

/**
 * Result shape shared by the actions that return data. `T = undefined` gives
 * the bare `{ok:true}`; anything else nests the payload under `data`.
 */
export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

/** Any failure arm, whatever the success arm looks like. */
export type ActionFailure = { ok: false; error: string };

/**
 * What the user is told when an action throws. Deliberately generic and
 * constant: `packages/db` nests the driver's error under `.cause`, so mapping
 * `error.message` through would put Postgres text ("duplicate key value
 * violates unique constraint …", a column name, sometimes the value) on
 * screen. The real error goes to the server log instead.
 */
const GENERIC_ERROR = "Something went wrong. Please try again.";

/**
 * Run a server action's body so a thrown error becomes its typed failure arm.
 *
 * The original error is `console.error`d with `label` for the server log; the
 * caller only ever sees `GENERIC_ERROR`. Next's own control-flow throws
 * (`redirect`, `notFound`, dynamic-usage bailouts) are re-thrown untouched via
 * `unstable_rethrow`, so wrapping an action that redirects on success is safe.
 *
 * ```ts
 * export async function publishAction(id: string): Promise<ActionResult> {
 *   return runAction("publishAction", async () => { ... });
 * }
 * ```
 */
export async function runAction<T extends { ok: boolean }>(
  label: string,
  body: () => Promise<T>,
): Promise<T | ActionFailure> {
  try {
    return await body();
  } catch (err) {
    unstable_rethrow(err);
    console.error(`[action:${label}]`, err);
    return { ok: false, error: GENERIC_ERROR };
  }
}
