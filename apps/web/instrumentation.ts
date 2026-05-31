import { assertServerEnv } from "@/lib/env";

/**
 * Next.js runs this once when a server instance boots. We use it to fail fast
 * on a misconfigured deploy (see {@link assertServerEnv}) rather than letting a
 * missing secret surface as a silent mid-flow failure for a member.
 *
 * Guards:
 *  - only the Node.js runtime (the Edge runtime has a different env surface and
 *    never runs the crypto/DB code these vars gate);
 *  - skipped during `next build` (NEXT_PHASE === "phase-production-build"),
 *    which collects page data without the runtime secrets set and must not
 *    fail the build.
 */
export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    assertServerEnv();
  }
}
