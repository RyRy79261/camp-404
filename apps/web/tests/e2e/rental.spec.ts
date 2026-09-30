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
  seedParticipation,
  seedTeam,
  setRank,
} from "./_helpers";

// Gear rental (#241, test-mode, on the store's twin). A captain lists two
// tents and a mattress. A member is asked about a tent ONCE, by need, and
// never sees or picks a catalogue tent: one who needs a tent for two says so
// and says who shares it; the captain picks the actual tent and camp stock or
// the supplier, confirms, and the charge is on the member's dues. A member
// with their own tent is charged nothing for it. The friend in a tent reads
// whose it is and its label, and cannot contradict it; a lead of another team
// and a Finance lead get a lock. The camp's one tent is not given out twice.
// A captain asks everyone, and fills an order in for a member who has not
// answered. Prices are made up.
//
// Intl writes no-break spaces ("R 1 500,00"), so money is matched with \s.

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

// The toast that follows a save can say the same words as the page, and both
// are `role="status"`: the page's own elements are named by test id.
const SENT = "Sent. A captain will confirm it.";

async function heading(page: Page, name: string) {
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

async function asCaptain(page: Page, request: APIRequestContext) {
  await login(page, {
    id: "rent-cap",
    email: "god@example.com",
    displayName: "Cap Tain",
  });
  await page.goto("/");
  await completeOnboarding(request, "rent-cap");
  await setRank(request, "rent-cap", "captain");
}

async function captainListsGear(page: Page, request: APIRequestContext) {
  await asCaptain(page, request);
  await page.goto("/captains/gear-rental/catalogue");
  await heading(page, "Catalogue");
  const items = page.getByRole("list", { name: "Rental items" });

  // A small tent: the supplier rents it, and the camp has one of its own.
  await page.getByLabel("Name").fill("2-person tent");
  await page.getByRole("checkbox", { name: /It.s a tent/ }).click();
  await page.getByLabel("Sleeps").fill("2");
  await page.getByLabel("Supplier price (R)").fill("250");
  await page
    .getByRole("checkbox", { name: /The camp has some of these/ })
    .click();
  await page.getByLabel("Camp stock price (R)").fill("100");
  await page.getByLabel("How many the camp has").fill("1");
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(items.getByText("2-person tent")).toBeVisible();
  await expect(items.getByText(/the camp has 1$/)).toBeVisible();

  // A big tent: the supplier only.
  await page.getByLabel("Name").fill("4-person tent");
  await page.getByRole("checkbox", { name: /It.s a tent/ }).click();
  await page.getByLabel("Sleeps").fill("4");
  await page.getByLabel("Supplier price (R)").fill("700");
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(items.getByText("4-person tent")).toBeVisible();

  // A mattress: the supplier only.
  await page.getByLabel("Name").fill("Mattress");
  await page.getByLabel("Supplier price (R)").fill("80");
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(items.getByText("Mattress")).toBeVisible();
}

/** The member's one tent question. */
const tentQuestion = (page: Page) =>
  page.getByRole("radiogroup", { name: "Tent", exact: true });

/** Open My gear as the signed-in member. No catalogue tent is ever named. */
async function openMyGear(page: Page) {
  await page.goto("/gear");
  await heading(page, "My gear");
  await expect(tentQuestion(page).getByRole("radio")).toHaveCount(3);
  await expect(page.getByText("2-person tent")).toHaveCount(0);
  await expect(page.getByText("4-person tent")).toHaveCount(0);
}

/** "I need one", for this many people, shared with these members. */
async function needATent(page: Page, people: number, shareWith: string[] = []) {
  await tentQuestion(page)
    .getByRole("radio", { name: /^I need one/ })
    .click();
  await page.getByLabel("For how many people?").selectOption(String(people));
  for (const name of shareWith) {
    await page
      .getByLabel("Who shares it with you?")
      .selectOption({ label: name });
    await expect(
      page.getByRole("list", { name: "Sharing the tent with" }),
    ).toContainText(name);
  }
}

async function needMattresses(page: Page, count: number, mine = true) {
  const mattress = page.getByRole("listitem", { name: "Mattress" });
  await mattress
    .getByRole("radio", { name: mine ? "I need" : "They need", exact: true })
    .click();
  await mattress.getByLabel("How many Mattress").selectOption(String(count));
}

async function sendMyOrder(page: Page) {
  await page.getByRole("button", { name: "Send my order" }).click();
  await expect(page.getByTestId("order-state")).toHaveText(SENT);
}

async function openOrder(page: Page, member: string) {
  await page.goto("/captains/gear-rental");
  await heading(page, "Gear rental");
  await page
    .getByRole("link", { name: member })
    .filter({ visible: true })
    .click();
  await heading(page, member);
}

/** The captain picks the tent a member gets, and where it comes from. */
async function assignTent(page: Page, tent: RegExp, source: RegExp) {
  await page
    .getByRole("radiogroup", { name: "Which tent" })
    .getByRole("radio", { name: tent })
    .click();
  await page
    .getByRole("radiogroup", { name: "Where the tent comes from" })
    .getByRole("radio", { name: source })
    .click();
}

const total = (page: Page) => page.getByRole("status", { name: "Order total" });

test.describe("gear rental (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a member needs a tent for two, a captain assigns a camp tent, and the charge is on the member's dues", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "rent-member", "Dee Member");
    await seedParticipation(request, "rent-member", "accepted");
    await approvedMember(page, request, "rent-friend", "Fay Friend");
    await approvedMember(page, request, "rent-kit", "Kit Lead");
    await seedTeam(request, "rent-kit", "kitchen", true);
    await approvedMember(page, request, "rent-fin", "Fin Lead");
    await seedTeam(request, "rent-fin", "finance", true);
    await captainListsGear(page, request);

    // The member answers the tent question once: no tent to pick, no source,
    // and a price range across the year's tents.
    await login(page, { id: "rent-member", email: "rent-member@example.com" });
    await openMyGear(page);
    await needATent(page, 2, ["Fay Friend"]);
    await needMattresses(page, 2);
    await expect(
      page.getByRole("radio", { name: /camp stock|supplier/i }),
    ).toHaveCount(0);
    // A tent from R100 (camp) to R700 (the big one), and two mattresses.
    await expect(
      page.getByRole("status", { name: "What it may cost" }),
    ).toHaveText(/R\s260,00 to R\s860,00/);
    await sendMyOrder(page);
    await expect(page.getByTestId("tent-answer")).toContainText(
      "A tent for 2 people",
    );
    await expect(page.getByTestId("tent-answer")).toContainText(
      "A captain picks your tent when they confirm",
    );

    // The friend: the tent question is already answered, and she cannot say
    // anything that disagrees with it.
    await login(page, { id: "rent-friend", email: "rent-friend@example.com" });
    await page.goto("/gear");
    await heading(page, "My gear");
    await expect(page.getByTestId("tent-hosted")).toContainText(
      "Dee Member put you in their tent, so this is answered.",
    );
    await expect(
      tentQuestion(page).getByRole("radio", {
        name: /^I.m in someone else.s tent/,
      }),
    ).toBeChecked();
    await expect(
      tentQuestion(page).getByRole("radio", { name: /^I have my own/ }),
    ).toBeDisabled();
    await expect(
      tentQuestion(page).getByRole("radio", { name: /^I need one/ }),
    ).toBeDisabled();
    await expect(page.getByText("Not confirmed yet")).toBeVisible();
    // Nothing of Dee's order but the tent.
    await expect(page.getByRole("list", { name: "Your order" })).toHaveCount(0);
    await sendMyOrder(page);
    await expect(page.getByTestId("tent-answer")).toContainText(
      "Dee Member\u2019s tent",
    );
    await expect(page.getByTestId("in-a-tent")).toHaveText(
      /in Dee Member.s tent\. You don.t need a tent of your own\./,
    );

    // A lead of another team and a Finance lead: a lock, and no member named.
    for (const id of ["rent-kit", "rent-fin"]) {
      await login(page, { id, email: `${id}@example.com` });
      for (const path of [
        "/captains/gear-rental",
        "/captains/gear-rental/summary",
        "/captains/gear-rental/catalogue",
      ]) {
        await page.goto(path);
        await expect(
          page.getByText("Captains only", { exact: true }),
        ).toBeVisible();
        await expect(page.getByText("Dee Member")).toHaveCount(0);
        await expect(page.getByText("2-person tent")).toHaveCount(0);
      }
      await page.goto("/print/gear-rental?sheet=tents");
      await expect(
        page.getByText("Gear rental is for captains."),
      ).toBeVisible();
      await expect(page.getByText("Dee M.")).toHaveCount(0);
    }

    // Until a captain picks it, the tent is a need, not a tent.
    await asCaptain(page, request);
    await page.goto("/captains/gear-rental/summary");
    await heading(page, "Summary");
    await expect(
      page
        .getByRole("list", { name: "Needs a tent, not assigned yet" })
        .getByRole("listitem"),
    ).toHaveText([
      /Dee Member needs a tent, not assigned yet.*A tent for 2 people, with Fay Friend/,
    ]);

    // The captain opens the order and picks the actual tent and its source.
    await openOrder(page, "Dee Member");
    await expect(page.getByText("Accepted", { exact: true })).toBeVisible();
    const panel = page.getByTestId("tent-panel");
    await expect(panel).toContainText("A tent for 2 people");
    // The sharer has no place yet, and the captain is told.
    await expect(panel.getByText("Not accepted yet")).toBeVisible();
    await expect(total(page)).toHaveText("Not yet");
    await assignTent(page, /4-person tent/, /Supplier/);
    await expect(total(page)).toHaveText(/R\s860,00/);
    await assignTent(page, /2-person tent/, /Camp stock\s*R\s100,00 each/);
    await expect(panel.getByText("1 left in camp stock.")).toBeVisible();
    await expect(page.getByTestId("tent-too-small")).toHaveCount(0);
    // The mattress has one source, so it is already picked.
    await expect(total(page)).toHaveText(/R\s260,00/);
    await page.getByRole("button", { name: "Confirm and charge" }).click();
    await expect(page.getByTestId("order-on-dues")).toContainText(
      "On their dues.",
    );
    await page.getByLabel("Tent label").fill("T3");
    await page.getByRole("button", { name: "Save label" }).click();
    await expect(page.getByText("Label saved")).toBeVisible();

    // The summary counts the tent the captain picked: out of storage, none left.
    await page.goto("/captains/gear-rental/summary");
    await heading(page, "Summary");
    const totals = page.getByRole("table", { name: "Totals by item" });
    const tentRow = totals.getByRole("row", { name: /2-person tent/ });
    await expect(tentRow.getByRole("cell").nth(3)).toHaveText("1");
    await expect(tentRow.getByRole("cell").nth(4)).toHaveText("0 of 1");
    await expect(tentRow.getByRole("cell").nth(5)).toHaveText("0");
    const bigRow = totals.getByRole("row", { name: /4-person tent/ });
    await expect(bigRow.getByRole("cell").nth(5)).toHaveText("0");
    const mattressRow = totals.getByRole("row", { name: /Mattress/ });
    await expect(mattressRow.getByRole("cell").nth(5)).toHaveText("2");
    await expect(
      page.getByRole("list", { name: "Tents" }).getByRole("listitem"),
    ).toContainText(["T3"]);
    await expect(
      page.getByRole("list", { name: "Needs a tent, not assigned yet" }),
    ).toHaveCount(0);

    // On paper: counts only for the supplier, and the tent list by label.
    await page.goto("/print/gear-rental");
    await expect(page.getByTestId("print-order-row")).toHaveText([
      /Mattress\s*2/,
    ]);
    await expect(page.getByTestId("print-storage-row")).toContainText([
      "2-person tent",
    ]);
    await expect(page.getByText("Dee")).toHaveCount(0);
    await page.goto("/print/gear-rental?sheet=tents");
    await expect(page.getByTestId("print-tent-row")).toHaveText([
      /T3.*2-person tent.*Dee M\., Fay F\./,
    ]);

    // The member owes it, and now sees the tent she was given and its label.
    await login(page, { id: "rent-member", email: "rent-member@example.com" });
    await page.goto("/dues");
    await heading(page, "My dues");
    await expect(page.getByText(/You owe R\s260,00\./)).toBeVisible();
    await expect(
      page
        .getByRole("list", { name: "Charges" })
        .getByText("Gear rental: 1 × 2-person tent, 2 × Mattress"),
    ).toBeVisible();
    await page.goto("/gear");
    await heading(page, "My gear");
    await expect(page.getByTestId("order-state")).toHaveText(
      /^Confirmed\. It.s on your dues\.$/,
    );
    const answer = page.getByTestId("tent-answer");
    await expect(answer).toContainText("2-person tent");
    await expect(answer).toContainText("from camp stock");
    await expect(answer).toContainText("Tent label: T3");
    await expect(
      page.getByRole("button", { name: "Send my order" }),
    ).toHaveCount(0);

    // The friend sees the label too.
    await login(page, { id: "rent-friend", email: "rent-friend@example.com" });
    await page.goto("/gear");
    await heading(page, "My gear");
    await expect(
      page.getByRole("list", { name: "Your tent" }).getByText("T3"),
    ).toBeVisible();
  });

  test("a member with their own tent is charged nothing for it; the camp's one tent is not given out twice; a reopened order comes off the dues", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "rent-own", "Ona Owner");
    await approvedMember(page, request, "rent-three", "Tim Three");
    await approvedMember(page, request, "rent-last", "Uma Last");
    await captainListsGear(page, request);

    // Ona brings her own tent, and needs a mattress.
    await login(page, { id: "rent-own", email: "rent-own@example.com" });
    await openMyGear(page);
    await tentQuestion(page)
      .getByRole("radio", { name: /^I have my own/ })
      .click();
    await page.getByLabel("What tent is it? (optional)").fill("3-person dome");
    await page.getByLabel("It sleeps (optional)").selectOption("3");
    await needMattresses(page, 1);
    // Her tent costs nothing: only the mattress is priced.
    await expect(
      page.getByRole("status", { name: "What it may cost" }),
    ).toHaveText(/^R\s80,00$/);
    await sendMyOrder(page);
    await expect(page.getByTestId("tent-answer")).toContainText(
      "3-person dome, sleeps 3",
    );

    // Tim needs a tent for three; Uma needs one for herself.
    await login(page, { id: "rent-three", email: "rent-three@example.com" });
    await openMyGear(page);
    await needATent(page, 3);
    await sendMyOrder(page);
    await login(page, { id: "rent-last", email: "rent-last@example.com" });
    await openMyGear(page);
    await needATent(page, 1);
    await sendMyOrder(page);

    // Ona: no tent to pick, and only the mattress is charged.
    await asCaptain(page, request);
    await openOrder(page, "Ona Owner");
    await expect(page.getByTestId("tent-panel")).toContainText(
      "Their own tent: 3-person dome, sleeps 3.",
    );
    await expect(
      page.getByRole("radiogroup", { name: "Which tent" }),
    ).toHaveCount(0);
    await expect(total(page)).toHaveText(/^R\s80,00$/);
    await page.getByRole("button", { name: "Confirm and charge" }).click();
    await expect(page.getByTestId("order-on-dues")).toContainText(
      "On their dues.",
    );

    // Tim: the 2-person tent sleeps fewer than three. A warning, not a refusal.
    await openOrder(page, "Tim Three");
    await expect(page.getByTestId("tent-panel")).toContainText(
      "A tent for 3 people",
    );
    await assignTent(page, /2-person tent/, /Camp stock/);
    await expect(page.getByTestId("tent-too-small")).toHaveText(
      "This tent sleeps 2, and it is for 3 people. You can still pick it.",
    );
    await page.getByRole("button", { name: "Confirm and charge" }).click();
    await expect(page.getByTestId("order-on-dues")).toContainText(
      "On their dues.",
    );

    // Uma: the camp's one tent is gone. Refused in a sentence; the supplier works.
    await openOrder(page, "Uma Last");
    await assignTent(page, /2-person tent/, /Camp stock/);
    await expect(page.getByText("No camp stock left.")).toBeVisible();
    await page.getByRole("button", { name: "Confirm and charge" }).click();
    await expect(
      page.getByText(
        "The camp has 1 of 2-person tent and none are left. Pick the supplier, or raise the count in the catalogue.",
      ),
    ).toBeVisible();
    await assignTent(page, /2-person tent/, /Supplier\s*R\s250,00 each/);
    await page.getByRole("button", { name: "Confirm and charge" }).click();
    await expect(total(page)).toHaveText(/R\s250,00/);
    await expect(page.getByTestId("order-on-dues")).toContainText(
      "On their dues.",
    );

    // Ona's own tent is on the summary and the printed list, for the site plan.
    await page.goto("/captains/gear-rental/summary");
    await heading(page, "Summary");
    await expect(
      page.getByRole("list", { name: "Own tents" }).getByRole("listitem"),
    ).toHaveText([/3-person dome, sleeps 3.*Ona Owner/]);
    await page.goto("/print/gear-rental?sheet=tents");
    await expect(page.getByTestId("print-own-tent-row")).toHaveText([
      /3-person dome, sleeps 3.*Ona O\./,
    ]);

    // Ona owes the mattress and nothing for her tent.
    await login(page, { id: "rent-own", email: "rent-own@example.com" });
    await page.goto("/dues");
    await heading(page, "My dues");
    await expect(page.getByText(/You owe R\s80,00\./)).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Charges" }).getByRole("listitem"),
    ).toHaveText([/Gear rental: 1 × Mattress/]);

    // Uma's order is reopened: the charge comes off, and she may change it.
    await asCaptain(page, request);
    await openOrder(page, "Uma Last");
    await page.getByRole("button", { name: "Reopen" }).click();
    await page
      .getByRole("dialog", { name: "Reopen this order?" })
      .getByRole("button", { name: "Reopen" })
      .click();
    await expect(
      page.getByRole("button", { name: "Confirm and charge" }),
    ).toBeVisible();
    await login(page, { id: "rent-last", email: "rent-last@example.com" });
    await page.goto("/dues");
    await heading(page, "My dues");
    await expect(page.getByText("Nothing to pay yet.")).toBeVisible();
    await page.goto("/gear");
    await heading(page, "My gear");
    await page.getByRole("button", { name: "Change my order" }).click();
    await expect(
      page.getByRole("button", { name: "Send my order" }),
    ).toBeVisible();
  });

  test("a captain asks everyone; an asked member answers; a captain fills one in for a member who has not", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "rent-member", "Dee Member");
    await seedParticipation(request, "rent-member", "applied");
    await approvedMember(page, request, "rent-friend", "Fay Friend");
    await seedParticipation(request, "rent-friend", "accepted");
    await approvedMember(page, request, "rent-maybe", "Mo Maybe");
    await seedParticipation(request, "rent-maybe", "maybe");
    await approvedMember(page, request, "rent-kit", "Kit Lead");
    await seedTeam(request, "rent-kit", "kitchen", true);
    await seedParticipation(request, "rent-kit", "accepted");
    await captainListsGear(page, request);

    // A lead of another team cannot press it: a lock, and no button.
    await login(page, { id: "rent-kit", email: "rent-kit@example.com" });
    await page.goto("/captains/gear-rental");
    await expect(
      page.getByText("Captains only", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Ask everyone" }),
    ).toHaveCount(0);
    await expect(page.getByText("Dee Member")).toHaveCount(0);
    // Nobody has been asked yet.
    await page.goto("/gear");
    await heading(page, "My gear");
    await expect(page.getByTestId("gear-asked")).toHaveCount(0);

    // The captain sees who has not answered, by name, and asks exactly them.
    await asCaptain(page, request);
    await page.goto("/captains/gear-rental");
    await heading(page, "Gear rental");
    const waiting = page.getByRole("list", { name: "Not answered yet" });
    await expect(waiting.getByRole("link")).toHaveText([
      "Dee Member",
      "Fay Friend",
      "Kit Lead",
    ]);
    // Said Maybe: not coming, so not asked.
    await expect(page.getByText("Mo Maybe")).toHaveCount(0);
    await page.getByRole("button", { name: "Ask everyone" }).click();
    await expect(page.getByText("Asked 3 members.")).toBeVisible();
    await expect(waiting.getByRole("link")).toHaveText([
      "Dee MemberAsked",
      "Fay FriendAsked",
      "Kit LeadAsked",
    ]);
    // Pressed again: no second notice while the first is unread.
    await page.getByRole("button", { name: "Ask everyone" }).click();
    await expect(
      page.getByText(
        "3 members already have the ask unread. No second notice was sent.",
      ),
    ).toBeVisible();

    // The asked member is told, never blocked, and answers: her own tent,
    // which she shares with Fay.
    await login(page, { id: "rent-member", email: "rent-member@example.com" });
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await openMyGear(page);
    await expect(page.getByTestId("gear-asked")).toBeVisible();
    await tentQuestion(page)
      .getByRole("radio", { name: /^I have my own/ })
      .click();
    await page.getByLabel("What tent is it? (optional)").fill("3-person dome");
    await page.getByLabel("It sleeps (optional)").selectOption("3");
    await page
      .getByLabel("Who shares it with you?")
      .selectOption({ label: "Fay Friend" });
    await sendMyOrder(page);
    await expect(page.getByTestId("gear-asked")).toHaveCount(0);
    // Mo said Maybe and was not asked.
    await login(page, { id: "rent-maybe", email: "rent-maybe@example.com" });
    await page.goto("/gear");
    await heading(page, "My gear");
    await expect(page.getByTestId("gear-asked")).toHaveCount(0);

    // The captain: Dee has answered; Fay has not, so the captain fills it in.
    // Fay is already in Dee's tent, so her tent question is answered.
    await asCaptain(page, request);
    await page.goto("/captains/gear-rental");
    await heading(page, "Gear rental");
    await expect(waiting.getByRole("link")).toHaveText([
      "Fay FriendAsked",
      "Kit LeadAsked",
    ]);
    await waiting.getByRole("link", { name: /Fay Friend/ }).click();
    await heading(page, "Fay Friend");
    await expect(page.getByText("No order yet", { exact: true })).toBeVisible();
    await expect(page.getByTestId("tent-hosted")).toContainText(
      "Dee Member put them in their tent, so this is answered.",
    );
    await expect(
      tentQuestion(page).getByRole("radio", {
        name: /^They.re in someone else.s tent/,
      }),
    ).toBeChecked();
    await needMattresses(page, 1, false);
    await page.getByRole("button", { name: "Save for them" }).click();
    await expect(
      page.getByText("Filled in by a captain", { exact: true }),
    ).toBeVisible();
    // Confirmed as usual: no tent to pick, and the mattress has one source.
    await expect(page.getByTestId("tent-panel")).toContainText(
      "In Dee Member\u2019s tent.",
    );
    await page.getByRole("button", { name: "Confirm and charge" }).click();
    await expect(page.getByTestId("order-on-dues")).toContainText(
      "On their dues.",
    );
    // Dee's own tent is on her order, and on the printed tent list.
    await openOrder(page, "Dee Member");
    await expect(page.getByTestId("tent-panel")).toContainText(
      "Their own tent: 3-person dome, sleeps 3.",
    );
    await expect(page.getByTestId("tent-panel")).toContainText("Fay Friend");
    await page.goto("/print/gear-rental?sheet=tents");
    await expect(page.getByTestId("print-own-tent-row")).toHaveText([
      /3-person dome, sleeps 3.*Dee M\., Fay F\./,
    ]);

    // Fay sees that a captain filled it in, and whose tent she is in.
    await login(page, { id: "rent-friend", email: "rent-friend@example.com" });
    await page.goto("/gear");
    await heading(page, "My gear");
    await expect(page.getByTestId("gear-filled")).toContainText(
      "A captain filled this in for you.",
    );
    await expect(page.getByTestId("gear-asked")).toHaveCount(0);
    await expect(page.getByTestId("in-a-tent")).toContainText("Dee Member");
    await page.goto("/dues");
    await heading(page, "My dues");
    await expect(page.getByText(/You owe R\s80,00\./)).toBeVisible();
  });
});
