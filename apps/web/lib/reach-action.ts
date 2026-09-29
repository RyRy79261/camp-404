// A server action called from a button can throw past its typed result: the
// network drops, or the server goes away mid-call. `reached` turns that into
// the failure arm, so the control stops spinning and the member reads a
// sentence, instead of the window's error screen taking over.

/** What the member reads when the call never got an answer. */
export const UNREACHABLE = "Couldn't reach the camp's server. Try again.";

export async function reached<T extends { ok: boolean }>(
  call: Promise<T>,
): Promise<T | { ok: false; error: string }> {
  try {
    return await call;
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
}
