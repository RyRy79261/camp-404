import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import {
  completeOnboarding,
  login,
  redeemInviteAtGate,
  resetTestState,
  seedLift,
  seedTeam,
} from "./_helpers";

// Transport (#270, test-mode). A member asks for a seat in a driver's car;
// the driver accepts, then writes to their car, and the rider reads it in
// their inbox. A plain member only reads the car list; a Kitchen lead stands
// on the same team_lead rung and still finds no trailer controls at all;
// a Transport & Logistics lead adds a trailer and puts it on the car.

async function approvedMember(
  page: Page,
  request: APIRequestContext,
  id: string,
  displayName: string,
) {
  await login(page, { id, email: `${id}@example.com`, displayName });
  await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
  await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
  await completeOnboarding(request, id);
}

async function signInAs(page: Page, id: string, displayName: string) {
  await login(page, { id, email: `${id}@example.com`, displayName });
}

async function openTransport(page: Page) {
  await page.goto("/transport");
  await expect(
    page.getByRole("heading", { level: 1, name: "Transport" }),
  ).toBeVisible();
}

const visible = { visible: true } as const;

test.describe("transport (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a rider asks, the driver accepts and messages the car, and the rider reads it", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "tr-driver", "Dana Driver");
    await seedLift(request, "tr-driver", {
      role: "driver",
      vehicleMake: "Toyota",
      vehicleModel: "Hilux",
      seatsOffered: 3,
      departureCity: "Cape Town",
      canTow: true,
    });
    await approvedMember(page, request, "tr-rider", "Rae Rider");

    // The rider asks for a seat in Dana's car.
    await openTransport(page);
    await expect(
      page.getByRole("heading", { name: "Need a lift?" }),
    ).toBeVisible();
    await page.getByRole("combobox", { name: "Which car?" }).click();
    await page
      .getByRole("option", { name: /Dana Driver · Toyota Hilux/ })
      .click();
    await page.getByRole("button", { name: "Ask for a lift" }).click();
    await expect(page.getByText("Lift asked for")).toBeVisible();
    await expect(
      page.getByText(/You asked for a seat in Dana Driver · Toyota Hilux/),
    ).toBeVisible();

    // The driver accepts, then writes to the car.
    await signInAs(page, "tr-driver", "Dana Driver");
    await openTransport(page);
    await expect(
      page.getByRole("heading", { name: "Asking to ride with you" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Accept Rae Rider" })
      .filter(visible)
      .click();
    await expect(page.getByText("Rae Rider is in the car")).toBeVisible();
    await expect(page.getByText("1 of 3 seats taken").first()).toBeVisible();

    await page.getByRole("button", { name: "Message my car" }).click();
    const dialog = page.getByRole("dialog", { name: "Message my car" });
    await dialog.getByLabel("Title").fill("Leaving Friday 6am");
    await dialog.getByLabel("Message").fill("Meet at the garage with water.");
    await dialog.getByRole("button", { name: "Send to my car" }).click();
    await expect(page.getByText("Sent to 1 person")).toBeVisible();

    // The rider reads it in their inbox, from Dana.
    await signInAs(page, "tr-rider", "Rae Rider");
    await page.goto("/notifications");
    await expect(page.getByText("Leaving Friday 6am")).toBeVisible();
    await openTransport(page);
    await expect(
      page.getByRole("heading", { name: "Your lift" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Message my car" }),
    ).toHaveCount(0);
  });

  test("a member and a Kitchen lead only read; a Transport & Logistics lead keeps the trailers", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "tr-driver2", "Dee Driver");
    await seedLift(request, "tr-driver2", {
      role: "driver",
      vehicleMake: "Land Rover",
      vehicleModel: "Defender",
      seatsOffered: 2,
      canTow: true,
    });

    // A plain member reads the car list; there are no trailer controls at
    // all, greyed or not.
    await approvedMember(page, request, "tr-member", "Mo Member");
    await openTransport(page);
    await expect(
      page.getByText("Dee Driver").filter(visible).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Add trailer/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Still without a seat" }),
    ).toHaveCount(0);

    // A Kitchen lead: the same rung, and still refused.
    await approvedMember(page, request, "tr-kitchen", "Kit Chen");
    await seedTeam(request, "tr-kitchen", "kitchen", true);
    await openTransport(page);
    await expect(
      page.getByText("Dee Driver").filter(visible).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Add trailer/ }),
    ).toHaveCount(0);

    // A Transport & Logistics lead adds a trailer and puts it on the car.
    await approvedMember(page, request, "tr-lead", "Tee Lead");
    await seedTeam(request, "tr-lead", "transport_and_logistics", true);
    await openTransport(page);
    await expect(
      page.getByRole("heading", { name: "Still without a seat" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Add trailer", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Add a trailer" });
    await dialog.getByLabel("Name").fill("Box trailer");
    await dialog.getByRole("button", { name: "Add trailer" }).click();
    await expect(page.getByText("Trailer added")).toBeVisible();
    await page
      .getByRole("combobox", { name: "Car towing Box trailer" })
      .filter(visible)
      .click();
    await page
      .getByRole("option", { name: /Dee Driver · Land Rover Defender/ })
      .click();
    await expect(page.getByText("Tow saved")).toBeVisible();
    await expect(
      page.getByText("Tows Box trailer").filter(visible).first(),
    ).toBeVisible();
  });
});
