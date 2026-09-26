import { Desktop } from "@/components/os/desktop-shell";
import { isCampBootstrapped } from "@/lib/bootstrap";
import { getCampSettings } from "@/lib/camp-config";
import { rankLabel } from "@/lib/camp-roster";
import { getMyDesktopLayout } from "@/lib/desktop-layout";
import { resolveMemberState } from "@/lib/member-gate";
import { listPinnedForUser } from "@/lib/notifications";
import { getProgramManifest, manifestModeFor } from "@/lib/program-manifest";
import { getMyMemberships } from "@/lib/users";

// Reads the session cookie on every request; cannot be prerendered.
export const dynamic = "force-dynamic";

/**
 * The console shell: the 404 OS desktop
 * (docs/specs/2026-09-25-404-os-console-design.md). The page for the URL
 * renders live inside that URL's window; the member's programs, folders and
 * tray come from the manifest the server builds for them.
 *
 * The layout keeps its branches and never redirects, so a gate page inside
 * this group (a blocking questionnaire) cannot loop:
 *
 *  - signed out, or before first-time setup: the page bare (the landing page,
 *    or the page's own redirect to sign-in or setup);
 *  - held by a blocking questionnaire: the desktop drawn inert behind the
 *    runner (and its /complete page), which sits on top in a blocking layer.
 *    A picture only: the member pages still redirect to the runner on the
 *    server. The inbox and an announcement gate on camp access alone, so a
 *    held member may open them from a link; the desktop draws those bare, as
 *    before, with no layer (components/os/desktop-shell.tsx);
 *  - an applicant waiting for approval: the restricted desktop (Inbox,
 *    Today, no pins, no system health);
 *  - a rejected applicant, and the invite and onboarding holds: no desktop
 *    (`manifestModeFor` is null). Keying on the block's reason alone would
 *    hand a rejected applicant a desktop that says "Application submitted";
 *  - a cleared member: the full desktop.
 *
 * The page asks the same `resolveMemberState`, which is cached per request,
 * so the shell costs no second session read or gate sync. The manifest and
 * the member's saved icon layout are read together.
 */
const CONTENT = "mx-auto w-full max-w-6xl px-4 py-8 sm:px-6";

export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const bootstrapped = await isCampBootstrapped();
  const state = bootstrapped ? await resolveMemberState() : null;
  if (!state || state.kind !== "member") return <>{children}</>;

  const mode = manifestModeFor(state);
  if (mode === null) {
    // A rejected applicant may still read their inbox and an announcement
    // (both gate on camp access only): the content column, no desktop.
    // Every other hold (invite, onboarding) lives outside this group.
    return state.block?.reason === "approval" ? (
      <div className={CONTENT}>{children}</div>
    ) : (
      <>{children}</>
    );
  }

  // Every read here but the pins is request-cached and shared with the
  // manifest (the settings, the memberships), so the chrome costs one query
  // more than the manifest alone: the pins, and only for a cleared member.
  const full = mode === "full";
  const [manifest, layout, memberships, settings, pinned] = await Promise.all([
    getProgramManifest(),
    getMyDesktopLayout(),
    full ? getMyMemberships(state.campUser.id) : Promise.resolve([]),
    getCampSettings(),
    full ? listPinnedForUser(state.campUser.id) : Promise.resolve([]),
  ]);
  // Null would mean the member's state changed under this render: draw the
  // page bare rather than guess.
  if (!manifest || !layout) return <>{children}</>;

  const { campUser, authUser } = state;
  // The teams they lead this year, by name, in the camp's order: the account
  // chip's "Leads …" line. Their own facts, drawn as text; nothing decides
  // with them.
  const led = new Set<string>(
    memberships.filter((m) => m.isLead).map((m) => m.team),
  );
  const leads = [...settings.teams.teams]
    .sort((a, b) => a.order - b.order)
    .filter((t) => led.has(t.key))
    .map((t) => t.label);
  const cycle = settings.current;
  return (
    <Desktop
      mode={mode}
      manifest={manifest}
      layout={layout}
      userId={campUser.id}
      account={{
        name: campUser.displayName ?? authUser.primaryEmail ?? "Signed in",
        rank: rankLabel(campUser.rank, led.size > 0),
        leads,
      }}
      // A pinned announcement rides above every console page (that is what
      // a pin IS). Only a cleared member's manifest has pins: nobody sees a
      // pin before they are through the door. Id and title only.
      pins={
        manifest.pins ? pinned.map((p) => ({ id: p.id, title: p.title })) : []
      }
      burn={
        cycle?.burnStart && cycle.burnEnd
          ? { start: cycle.burnStart, end: cycle.burnEnd }
          : null
      }
    >
      {children}
    </Desktop>
  );
}
