import { test, expect, type Locator, type Page } from "@playwright/test";
import { resetTestState } from "../e2e/_helpers";
import { clearance, PERSONAS, signInAs, type Persona } from "./personas";

// Every captain page against every persona. A persona at or above a page's bar
// gets the page's working control; below the bar a signed-in member gets the
// page with that control withheld, a pending applicant is held at the approval
// screen, and a signed-out visitor is sent to sign in. The meta-test below
// keeps the table honest: each page once, each persona covered.

interface Route {
  path: string;
  bar: Persona;
  /** A control that exists only for a viewer who clears the bar. */
  open: (page: Page) => Locator;
}

const ROUTES: Route[] = [
  {
    path: "/captains/questionnaires",
    bar: "team_lead",
    open: (p) => p.getByRole("button", { name: "New questionnaire" }),
  },
  {
    path: "/captains/announcements",
    bar: "team_lead",
    open: (p) => p.getByLabel("Title", { exact: true }),
  },
  {
    path: "/captains/camp-management",
    bar: "captain",
    open: (p) => p.getByRole("button", { name: /^Pending/ }),
  },
  {
    path: "/captains/camp-settings",
    bar: "captain",
    open: (p) => p.getByRole("button", { name: "Move Structures up" }),
  },
  {
    path: "/captains/camp-settings/cycle",
    bar: "captain",
    open: (p) => p.getByLabel("This year"),
  },
  {
    path: "/captains/payments",
    bar: "captain",
    open: (p) => p.getByLabel("Amount (R)"),
  },
  {
    path: "/captains/audit",
    bar: "captain",
    open: (p) => p.getByText("Nothing recorded yet"),
  },
];

test("the table covers each captain page once", () => {
  const paths = ROUTES.map((r) => r.path);
  expect(new Set(paths).size).toBe(paths.length);
  for (const route of ROUTES) expect(PERSONAS).toContain(route.bar);
});

for (const persona of PERSONAS) {
  test(`${persona}: opens what their rank clears, and nothing more`, async ({
    browser,
    request,
  }) => {
    await resetTestState(request);
    const page = await signInAs(browser, request, persona);

    for (const route of ROUTES) {
      await page.goto(route.path);
      if (persona === "anonymous") {
        await expect(page, route.path).toHaveURL(/\/auth\/sign-in/);
      } else if (persona === "pending") {
        await expect(page, route.path).toHaveURL(/\/pending-approval/);
      } else if (clearance(persona) >= clearance(route.bar)) {
        await expect(route.open(page), route.path).toBeVisible();
      } else {
        await expect(page, route.path).toHaveURL(new RegExp(`${route.path}$`));
        await expect(
          page.getByRole("heading", { level: 1 }),
          route.path,
        ).toBeVisible();
        await expect(route.open(page), route.path).toHaveCount(0);
      }
    }
  });
}
