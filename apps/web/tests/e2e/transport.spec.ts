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
  seedParticipation,
  seedTeam,
} from "./_helpers";
import { desktopOnly } from "./lib/dom";
import {
  expectFits,
  NARROW,
  openWindow,
  resizeWindowTo,
  WIDE,
} from "./lib/window-fit";

// Transport (#270, test-mode), laid out as the owner's Option A (2026-10-01):
// the viewer's own lift first, then tables with one row per person and one
// button in one place. A member asks for a seat in a driver's car; the driver
// accepts on their own card, then writes to the car, and the rider reads it.
// A Transport & Logistics lead seats the people who still need one from a
// panel under the row, changes a car's riders, and hooks a trailer to a car.
// A plain member and a Kitchen lead (the same rung) only read: no greyed
// controls at all. My lift shows the same panel, and asks for a lift when
// the member has none.

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
      arrivalDay: "2027-04-26",
      canTow: true,
    });
    await approvedMember(page, request, "tr-rider", "Rae Rider");

    // The rider has no lift; nothing is picked, so one tap sends nothing.
    await openTransport(page);
    const none = page.getByRole("region", { name: "No lift yet" });
    await expect(none).toBeVisible();
    await none.getByRole("button", { name: "Ask for a lift" }).click();
    await expect(none.getByRole("alert")).toHaveText(
      "Choose a car, or Any car.",
    );
    await none.getByRole("combobox", { name: "Which car" }).click();
    await page
      .getByRole("option", { name: "Dana Driver's Toyota Hilux (3 free)" })
      .click();
    await none.getByRole("button", { name: "Ask for a lift" }).click();
    await expect(page.getByText("Lift asked for")).toBeVisible();
    const mine = page.getByRole("region", { name: "Your request" });
    await expect(mine.getByText("Dana Driver's Toyota Hilux")).toBeVisible();
    await expect(mine.getByText("for Dana")).toBeVisible();

    // The driver accepts on their own card, then writes to the car.
    await signInAs(page, "tr-driver", "Dana Driver");
    await openTransport(page);
    const car = page.getByRole("region", { name: "Your car" });
    await expect(car.getByText("Mon 26 Apr", { exact: true })).toBeVisible();
    await car
      .getByRole("list", { name: "Asking to ride with you" })
      .getByRole("button", { name: "Accept Rae Rider" })
      .filter(visible)
      .click();
    await expect(page.getByText("Rae Rider is in the car")).toBeVisible();
    await expect(car.getByText("1 of 3 taken", { exact: true })).toBeVisible();
    await expect(
      car
        .getByRole("list", { name: "Riding with you" })
        .getByText("Rae Rider", { exact: true }),
    ).toBeVisible();

    await car.getByRole("button", { name: "Message my car" }).click();
    const dialog = page.getByRole("dialog", { name: "Message my car" });
    await expect(dialog.getByText(/Goes to Rae Rider/)).toBeVisible();
    await dialog.getByLabel("Title").fill("Leaving Friday 6am");
    await dialog.getByLabel("Message").fill("Meet at the garage with water.");
    await dialog.getByRole("button", { name: "Send to my car" }).click();
    await expect(page.getByText("Sent to 1 person")).toBeVisible();

    // The rider reads it in their inbox, then sees their lift as a list.
    await signInAs(page, "tr-rider", "Rae Rider");
    await page.goto("/notifications");
    await expect(page.getByText("Leaving Friday 6am")).toBeVisible();
    await openTransport(page);
    const lift = page.getByRole("region", { name: "Your lift" });
    await expect(lift.getByText("Dana Driver", { exact: true })).toBeVisible();
    await expect(lift.getByText("Cape Town", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Message my car" }),
    ).toHaveCount(0);

    // My lift: the same panel; leaving the car takes them out.
    await page.goto("/lift");
    const onLift = page.getByRole("region", { name: "Your lift" });
    await expect(
      onLift.getByText("Toyota Hilux", { exact: true }),
    ).toBeVisible();
    await onLift.getByRole("button", { name: "Leave this car" }).click();
    await expect(page.getByText("You left the car")).toBeVisible();
    await expect(
      page.getByRole("region", { name: "No lift yet" }),
    ).toBeVisible();
  });

  test("a Transport & Logistics lead seats people from one list, changes riders and hooks a trailer; a member and a Kitchen lead only read", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(
      testInfo,
      "reads the tables' rows; the phone cards have their own test below",
    );
    await approvedMember(page, request, "tr-driver2", "Dee Driver");
    await seedLift(request, "tr-driver2", {
      role: "driver",
      vehicleMake: "Land Rover",
      vehicleModel: "Defender",
      seatsOffered: 2,
      canTow: true,
    });
    await approvedMember(page, request, "tr-full", "Fil Full");
    await seedLift(request, "tr-full", {
      role: "driver",
      vehicleMake: "VW",
      vehicleModel: "Polo",
      seatsOffered: 0,
    });
    await approvedMember(page, request, "tr-acc", "Ayla Accepted");
    await seedParticipation(request, "tr-acc", "accepted");
    await approvedMember(page, request, "tr-maybe", "Mo Maybe");
    await seedParticipation(request, "tr-maybe", "maybe");
    // Asks for any car, and is coming but not yet accepted.
    await approvedMember(page, request, "tr-ask", "Pia Asker");
    await seedParticipation(request, "tr-ask", "applied");
    await openTransport(page);
    const none = page.getByRole("region", { name: "No lift yet" });
    await none.getByRole("combobox", { name: "Which car" }).click();
    await page.getByRole("option", { name: "Any car" }).click();
    await none.getByRole("button", { name: "Ask for a lift" }).click();
    await expect(page.getByText("Lift asked for")).toBeVisible();

    // The lead: one row per person, Accepted first, one button per row.
    await approvedMember(page, request, "tr-lead", "Tee Lead");
    await seedTeam(request, "tr-lead", "transport_and_logistics", true);
    await openTransport(page);
    const needs = page.getByRole("table", { name: "Needs a seat" });
    await expect(needs).toBeVisible();
    await expect(needs.getByRole("row")).toHaveCount(4);
    await expect(needs.getByRole("row").nth(1)).toHaveAccessibleName(
      "Ayla Accepted",
    );
    const pia = needs.getByRole("row", { name: "Pia Asker" });
    await expect(
      pia.getByText("Coming, not accepted", { exact: true }),
    ).toBeVisible();
    await expect(pia.getByText("Any car", { exact: true })).toBeVisible();
    await expect(
      needs
        .getByRole("row", { name: "Mo Maybe" })
        .getByText("Maybe", { exact: true }),
    ).toBeVisible();

    // Seat Ayla: the panel offers only the car with a free seat.
    await needs
      .getByRole("row", { name: "Ayla Accepted" })
      .getByRole("button", { name: /^Seat in/ })
      .click();
    const picker = page.getByRole("radiogroup", {
      name: "Car for Ayla Accepted",
    });
    await expect(picker.getByRole("radio")).toHaveCount(1);
    await expect(
      picker.getByRole("radio", { name: /Dee Driver's Land Rover Defender/ }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(
      page.getByText("Fil's VW is full.").filter(visible),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Seat Ayla in Dee's Land Rover" })
      .click();
    await expect(
      page.getByText("Ayla Accepted is in Dee's Land Rover"),
    ).toBeVisible();
    await expect(needs.getByRole("row", { name: "Ayla Accepted" })).toHaveCount(
      0,
    );

    // Decline Pia's request: she stays on the list, as not having asked.
    await pia
      .getByRole("button", { name: "Decline Pia Asker's request" })
      .click();
    await expect(page.getByText("Request declined")).toBeVisible();
    await expect(pia.getByText("Hasn't asked", { exact: true })).toBeVisible();

    // Change riders: take Ayla out again, and she is back on the list.
    const cars = page.getByRole("table", { name: "Cars" });
    const dee = cars.getByRole("row", { name: "Dee Driver" });
    await expect(dee.getByText("Ayla Accepted", { exact: true })).toBeVisible();
    await dee.getByRole("button", { name: /^Change riders/ }).click();
    await page
      .getByRole("list", { name: "Riders in Dee's Land Rover" })
      .getByRole("button", { name: /^Take out of car/ })
      .click();
    await expect(
      page.getByText("Ayla Accepted is out of the car"),
    ).toBeVisible();
    await expect(
      needs.getByRole("row", { name: "Ayla Accepted" }),
    ).toBeVisible();

    // A trailer, hooked to the car that can tow.
    await page
      .getByRole("button", { name: "Add trailer", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Add a trailer" });
    await dialog.getByLabel("Name").fill("Box trailer");
    await dialog.getByLabel(/What it carries/).fill("Kitchen crates");
    await dialog.getByRole("button", { name: "Add trailer" }).click();
    await expect(page.getByText("Trailer added")).toBeVisible();
    const trailers = page.getByRole("table", { name: "Trailers" });
    const box = trailers.getByRole("row", { name: "Box trailer" });
    await expect(box.getByText("No car yet", { exact: true })).toBeVisible();
    await box.getByRole("button", { name: /^Choose car/ }).click();
    await page
      .getByRole("radiogroup", { name: "Car towing Box trailer" })
      .getByRole("radio", { name: /Dee Driver's Land Rover Defender/ })
      .click();
    await page
      .getByRole("button", { name: "Hook to Dee's Land Rover" })
      .click();
    await expect(page.getByText("Tow saved")).toBeVisible();
    await expect(box.getByText("Dee Driver", { exact: true })).toBeVisible();
    await expect(
      dee.getByText("Tows Box trailer", { exact: true }),
    ).toBeVisible();

    // The page fits its window, wide (tables) and narrow (cards): no list
    // runs off the right edge (the audit's clipped Riders column).
    const win = await openWindow(page, "/transport", "Transport");
    await resizeWindowTo(page, win, WIDE);
    await expectFits(win);
    await resizeWindowTo(page, win, NARROW);
    await expectFits(win);
    await expect(
      win.getByRole("list", { name: "Cars" }).getByRole("listitem"),
    ).toHaveCount(2);

    // A plain member reads the same lists as content: no Needs a seat, no
    // row buttons, no Add trailer, greyed or not.
    await approvedMember(page, request, "tr-member", "Mo Member");
    await openTransport(page);
    await expect(
      page
        .getByRole("table", { name: "Trailers" })
        .getByRole("row", { name: "Box trailer" })
        .getByText("Dee Driver", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Transport & Logistics leads and captains keep this list.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /^Needs a seat/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /^Add trailer/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /^(Change riders|Choose car|Seat in)/ }),
    ).toHaveCount(0);

    // A Kitchen lead: the same rung, and still only reads.
    await approvedMember(page, request, "tr-kitchen", "Kit Chen");
    await seedTeam(request, "tr-kitchen", "kitchen", true);
    await openTransport(page);
    await expect(
      page.getByRole("table", { name: "Cars" }).getByRole("row", {
        name: "Dee Driver",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /^Needs a seat/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: /^(Add trailer|Change riders|Choose car|Seat in)/,
      }),
    ).toHaveCount(0);
  });

  test("on a phone the lists are cards, and a lead seats someone from a card", async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await approvedMember(page, request, "tr-driver3", "Dee Driver");
    await seedLift(request, "tr-driver3", {
      role: "driver",
      vehicleMake: "Land Rover",
      vehicleModel: "Defender",
      seatsOffered: 2,
    });
    await approvedMember(page, request, "tr-acc3", "Ayla Accepted");
    await seedParticipation(request, "tr-acc3", "accepted");

    await approvedMember(page, request, "tr-lead3", "Tee Lead");
    await seedTeam(request, "tr-lead3", "transport_and_logistics", true);
    await openTransport(page);
    // The tables are not drawn at this width: the same rows are cards.
    await expect(page.getByRole("table", { name: "Cars" })).toHaveCount(0);
    const card = page
      .getByRole("list", { name: "Needs a seat" })
      .getByRole("listitem", { name: "Ayla Accepted" });
    await expect(card.getByText("Accepted", { exact: true })).toBeVisible();
    await card.getByRole("button", { name: /^Seat in/ }).click();
    await page
      .getByRole("button", { name: "Seat Ayla in Dee's Land Rover" })
      .click();
    await expect(
      page.getByText("Ayla Accepted is in Dee's Land Rover"),
    ).toBeVisible();
    await expect(
      page
        .getByRole("list", { name: "Cars" })
        .getByRole("listitem", { name: "Dee Driver" })
        .getByText("Ayla Accepted", { exact: true }),
    ).toBeVisible();
  });
});
