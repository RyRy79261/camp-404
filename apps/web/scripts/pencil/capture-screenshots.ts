import { test, type Page, type Locator } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
  completeOnboarding,
  login,
  redeemInviteAtGate,
  resetTestState,
  setRank,
} from "../../tests/e2e/_helpers";

/**
 * Captures CLEAN, POPULATED reference screenshots of every Camp 404 screen.
 * Writes PNGs to design/reference/ (monorepo root) at a mobile viewport.
 *
 * Run via: pnpm --filter @camp404/web design:capture
 *          CAPTURE_THEME=light pnpm --filter @camp404/web design:capture
 *
 * Strategy (differs from the intake-tracker reference — Camp 404 is server-only,
 * not local-first):
 *  - Seed each user context through the /api/test/* cookie seam (E2E_TEST_MODE):
 *    login → reach a gated page so ensureCampUser lazily creates the row →
 *    completeOnboarding / setRank / redeem an invite, exactly as the e2e specs do.
 *  - The `god@example.com` email (GOD_EMAILS) bypasses the invite gate, so the
 *    authenticated screens don't need a real invite walk.
 *  - Capture rules (from the briefing): dismiss overlays, hide `position:fixed`
 *    bars before a full-page shot (Playwright renders them through the page), and
 *    grab a separate viewport "chrome" shot for the fixed chrome.
 *
 * Known gaps (not capturable through this seam — documented for follow-up):
 *  - report-bug-dialog: FeedbackGate only renders on a live Better-Auth client
 *    session (absent in test mode) and only opens on a device shake.
 *  - acknowledgement-gate: needs a published acknowledge-delivery in the member's
 *    queue (a cross-user captain→member broadcast); skipped in v1.
 */

// design/ lives at the MONOREPO ROOT; the spec runs from apps/web.
const OUT = path.resolve(process.cwd(), "../../design/reference");
fs.mkdirSync(OUT, { recursive: true });

// Tailwind `.fixed` is on floating chrome (push opt-in, any sticky bars). Hide
// them for clean full-page body captures so they don't render through content.
const HIDE_FIXED = '[class~="fixed"]{display:none !important;}';

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(800);
}

async function tryClick(loc: Locator, timeout = 4000): Promise<boolean> {
  try {
    await loc.first().click({ timeout });
    return true;
  } catch {
    return false;
  }
}

async function dismissOverlays(page: Page) {
  for (const name of [/got it/i, /^done$/i, /dismiss/i, /^close$/i, /not now/i]) {
    const btn = page.getByRole("button", { name }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(200);
    }
  }
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(150);
}

/** Install per-context mocks so no overlay or real API perturbs the capture. */
async function prep(page: Page) {
  // AcknowledgementGate polls this; force an empty queue so it never takes over.
  await page.route("**/api/notifications/pending", (route) =>
    route.fulfill({ json: { pending: [] } }),
  );
  // Defensive: voice transcription is the one client-triggered AI call. The
  // capture never records, but stub it so a stray call can't hit Groq.
  await page.route("**/api/voice/transcribe", (route) =>
    route.fulfill({ json: { text: "" } }),
  );
  // Hide the Next.js dev-tools indicator (the "N · 1 Issue" pill). It's dev-only
  // chrome — here it flags the known next-themes `<html>` dark-class hydration
  // mismatch (next-themes, via NeonAuthUIProvider, sets class="dark" client-side
  // while layout.tsx renders <html lang="en"> with no suppressHydrationWarning;
  // see design/recommendations.md) — and must not bleed into a design reference.
  // Persist a style so it stays hidden as the portal mounts after load.
  await page.addInitScript(() => {
    const css =
      "nextjs-portal,[data-next-badge-root],[data-nextjs-toast]," +
      "[data-nextjs-dev-tools-button],#__next-build-watcher{display:none!important;}";
    const inject = () => {
      const style = document.createElement("style");
      style.textContent = css;
      (document.head ?? document.documentElement).appendChild(style);
    };
    if (document.head ?? document.documentElement) inject();
    else document.addEventListener("DOMContentLoaded", inject);
  });
}

/** Clean full-page body shot: overlays dismissed, fixed bars hidden. */
async function shot(page: Page, name: string) {
  await settle(page);
  await dismissOverlays(page);
  await settle(page);
  await page.addStyleTag({ content: HIDE_FIXED }).catch(() => {});
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  console.log(`captured ${name}.png`);
}

/** Raw full-page shot WITHOUT dismissing/hiding — for dialogs/wizards. */
async function rawShot(page: Page, name: string) {
  await settle(page);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  console.log(`captured ${name}.png (raw)`);
}

/** Viewport shot with fixed chrome visible, scrolled to top — for single-screen surfaces. */
async function chromeShot(page: Page, name: string) {
  await settle(page);
  await dismissOverlays(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
  console.log(`captured ${name}.png (chrome)`);
}

/** Best-effort navigation that tolerates gate redirects. */
async function go(page: Page, route: string) {
  await page.goto(route).catch(() => {});
  await settle(page);
}

// 1. Public / unauthenticated surfaces.
test("capture public screens (logged out)", async ({ page, request }) => {
  await resetTestState(request);
  await prep(page);

  await go(page, "/");
  await chromeShot(page, "01-landing");

  await go(page, "/auth/sign-in");
  await chromeShot(page, "02-auth-sign-in");

  await go(page, "/auth/sign-up");
  await chromeShot(page, "03-auth-sign-up");
});

// 2. Invite gate — a signed-in, non-god user with no redeemed code.
test("capture invite gate", async ({ page, request }) => {
  await resetTestState(request);
  await prep(page);
  await login(page, { id: "u-newbie", email: "newbie@example.com" });
  await go(page, "/signup/required");
  await chromeShot(page, "04-invite-gate");
});

// 3. Onboarding questionnaire — god user, onboarding not yet complete.
test("capture onboarding questionnaire", async ({ page, request }) => {
  await resetTestState(request);
  await prep(page);
  await login(page, { id: "u-onb", email: "god@example.com" });
  await go(page, "/"); // → /onboarding/questionnaire (creates the user row)
  await rawShot(page, "05-onboarding-step1");

  // Best-effort: advance a couple of steps to capture later wizard states. The
  // wizard validates per step, so a Next click may be a no-op — that's fine.
  for (let i = 6; i <= 7; i++) {
    const advanced =
      (await tryClick(page.getByRole("button", { name: /^(next|continue)$/i }), 3000)) ||
      (await tryClick(page.getByRole("button", { name: /next|continue/i }), 2000));
    if (!advanced) break;
    await settle(page);
    await rawShot(page, `0${i}-onboarding-step${i - 4}`);
  }
});

// 4. Home (member) + member-reachable sub-pages.
test("capture home (member) + member pages", async ({ page, request }) => {
  await resetTestState(request);
  await prep(page);
  await login(page, { id: "u-mem", email: "god@example.com" });
  await go(page, "/"); // creates the user, lands on the questionnaire gate
  await completeOnboarding(request, "u-mem");

  await go(page, "/"); // now the layered ControlPanel (member layer)
  await chromeShot(page, "07-home-member");
  await shot(page, "07-home-member-full");

  const memberPages: ReadonlyArray<readonly [string, string]> = [
    ["/tools", "08-tools"],
    ["/tools/forms", "09-tools-forms"],
    ["/tools/invite", "10-tools-invite"],
    ["/profile", "11-profile"],
    ["/profile/edit", "12-profile-edit"],
    ["/notifications", "13-notifications"],
    ["/family-tree", "14-family-tree"],
    ["/mcp/connect", "15-mcp-connect"],
  ];
  for (const [route, name] of memberPages) {
    await go(page, route);
    await shot(page, name);
  }
});

// 5. Home (captain) + captain-only pages.
test("capture home (captain) + captain pages", async ({ page, request }) => {
  await resetTestState(request);
  await prep(page);
  await login(page, { id: "u-cap", email: "god@example.com" });
  await go(page, "/");
  await completeOnboarding(request, "u-cap");
  await setRank(request, "u-cap", "captain");

  await go(page, "/"); // ControlPanel with the captain layer unlocked
  await chromeShot(page, "16-home-captain");
  await shot(page, "16-home-captain-full");

  // camp-management's roster reads the LIVE DB (not the in-memory test store),
  // so under E2E_TEST_MODE it throws and the global error boundary renders.
  // Capture whatever shows, but name it honestly so the error screen isn't
  // mistaken for the roster. With a real DATABASE_URL this captures the roster.
  await go(page, "/captains/camp-management");
  const errored = await page
    .getByText(/something went sideways/i)
    .isVisible()
    .catch(() => false);
  await shot(page, errored ? "17-error-boundary" : "17-captains-camp-management");
  if (errored) {
    console.log(
      "note: /captains/camp-management hit the error boundary — its roster is " +
        "DB-backed, not seedable via the in-memory test store. Captured as the " +
        "error state (17-error-boundary.png).",
    );
  }

  await go(page, "/captains/announcements");
  await shot(page, "18-captains-announcements");
  await go(page, "/captains/tools");
  await shot(page, "19-captains-tools");
});

// 6. Approval gates — pending (submitted) then rejected (not approved).
test("capture approval gates", async ({ page, request }) => {
  await resetTestState(request);
  await prep(page);
  // A vetting-required invite lands the redeemer in the approval queue.
  await request.post("/api/test/seed-invite", {
    data: { code: "GATEKEEP", maxUses: 1, requiresApproval: true },
  });
  await login(page, { id: "u-pend", email: "pending@example.com" });
  await redeemInviteAtGate(page, "GATEKEEP");
  await settle(page);
  await completeOnboarding(request, "u-pend");

  await go(page, "/"); // → /pending-approval ("Application submitted")
  await chromeShot(page, "20-pending-approval");

  await request.post("/api/test/set-approval", {
    data: { authUserId: "u-pend", status: "rejected" },
  });
  await go(page, "/"); // → /pending-approval ("Application not approved")
  await chromeShot(page, "21-rejected");
});
