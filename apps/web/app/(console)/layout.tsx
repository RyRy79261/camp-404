import { ConsoleHeader } from "@/components/console/console-header";
import { isCampBootstrapped } from "@/lib/bootstrap";
import { resolveMemberState } from "@/lib/member-gate";

// Reads the session cookie on every request; cannot be prerendered.
export const dynamic = "force-dynamic";

/**
 * The console shell (from the AfrikaBurn organiser console): a sticky header
 * with the nav bar, and one content column every page shares.
 *
 * The header is drawn only for a signed-in member who has cleared the whole
 * ladder. Anyone else gets the page bare, and the page does what it always
 * did: the landing page renders for a signed-out visitor, and every other page
 * redirects to sign-in, setup, or the rung the member has not cleared. The
 * layout never redirects itself, so a gate page inside this group (a blocking
 * questionnaire) cannot loop.
 *
 * The page asks the same `resolveMemberState`, which is cached per request, so
 * drawing the header costs no second session read or gate sync.
 */
export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const bootstrapped = await isCampBootstrapped();
  const state = bootstrapped ? await resolveMemberState() : null;

  if (!state || state.kind !== "member" || state.block) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-svh">
      <ConsoleHeader
        campUser={state.campUser}
        email={state.authUser.primaryEmail}
      />
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        {children}
      </div>
    </div>
  );
}
