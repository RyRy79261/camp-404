import {
  expect,
  type APIRequestContext,
  type Browser,
  type Page,
} from "@playwright/test";
import {
  completeOnboarding,
  login,
  redeemInviteAtGate,
  seedTeam,
  setRank,
} from "../e2e/_helpers";

// Who can be signed in, ordered from least to most clearance. Each persona is
// made the way the app would make it (an invite, onboarding, a captain's
// approval or rank), through the test seams, on the real database.

export const PERSONAS = [
  "anonymous",
  "pending",
  "camp_member",
  "team_lead",
  "captain",
] as const;
export type Persona = (typeof PERSONAS)[number];

/** Where a persona stands on the ladder: a higher number clears more. */
export function clearance(persona: Persona): number {
  return PERSONAS.indexOf(persona);
}

const VETTED_CODE = "persona-needs-approval";

/** A fresh browser context signed in as `persona`. */
export async function signInAs(
  browser: Browser,
  request: APIRequestContext,
  persona: Persona,
): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  if (persona === "anonymous") return page;

  const id = `persona-${persona}`;
  await login(page, { id, email: `${id}@example.com`, displayName: persona });

  if (persona === "pending") {
    await request.post("/api/test/seed-invite", {
      data: { code: VETTED_CODE, requiresApproval: true },
    });
    await redeemInviteAtGate(page, VETTED_CODE);
  } else {
    await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
  }
  await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
  await completeOnboarding(request, id);
  if (persona === "team_lead") await seedTeam(request, id, "kitchen", true);
  if (persona === "captain") await setRank(request, id, "captain");
  return page;
}
