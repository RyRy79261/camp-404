import { test, expect } from "@playwright/test";
import { resetTestState } from "../e2e/_helpers";
import {
  answerGate,
  buildAndPublish,
  sendBlockingToEveryone,
  signInCaptain,
} from "./_flows";

// The year rollover end to end, on a real database: a captain names the
// camp's year, answers a questionnaire marked "ask everyone again next year",
// moves the camp to the next year, and is asked again; last year's answer
// stays filed under last year.

const GEAR = {
  title: "Gear check",
  key: "gear-check",
  prompt: "What tent are you bringing?",
};

test("name the year, answer, start the next year, and be asked again", async ({
  browser,
  request,
}) => {
  await resetTestState(request);
  const captain = await signInCaptain(browser, request);

  await captain.goto("/captains/camp-settings/cycle");
  await captain.getByLabel("This year").fill("2026");
  await captain.getByRole("button", { name: "The camp is in 2026" }).click();
  await expect(captain.getByText(/The camp is in/)).toBeVisible();

  await buildAndPublish(captain, { ...GEAR, askAgainNextYear: true });
  await sendBlockingToEveryone(captain, GEAR.title);
  await answerGate(captain, { ...GEAR, text: "A dome tent" });

  await captain.goto("/captains/camp-settings/cycle");
  await captain.getByRole("button", { name: "Start a new year" }).click();
  await captain.getByLabel("The new year").fill("2027");
  await captain.getByLabel("Type 2027 again to confirm").fill("2027");
  await captain.getByRole("button", { name: "Start 2027" }).click();

  // Asked again in the new year.
  await captain.goto("/tools/forms");
  await answerGate(captain, { ...GEAR, text: "A bigger dome tent" });

  // Each year keeps its own answer.
  await captain.goto(
    `/captains/questionnaires/${GEAR.key}/responses?cycle=2026`,
  );
  await expect(
    captain.getByRole("table", { name: "Answers" }).getByText("A dome tent"),
  ).toBeVisible();
  await captain.goto(
    `/captains/questionnaires/${GEAR.key}/responses?cycle=2027`,
  );
  const answers2027 = captain.getByRole("table", { name: "Answers" });
  await expect(answers2027.getByText("A bigger dome tent")).toBeVisible();
  await expect(
    answers2027.getByText("A dome tent", { exact: true }),
  ).toHaveCount(0);
});
