import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// My forms' Optional section (#313, owner approved 2026-10-03): open optional
// questionnaires the member has not answered, each labelled "Optional" with an
// Answer button; the section is not drawn when nothing optional is open; and
// after a submit, a strip thanks the member and links to their answers, which
// now sit under Submitted questionnaires.

vi.mock("@/lib/member-gate", () => ({
  requireMemberPage: vi.fn(async () => ({
    authUser: { primaryEmail: "nova@example.com" },
    campUser: { id: "u1", displayName: "Nova", rank: "member" },
  })),
}));
vi.mock("@/lib/camp-config", () => ({
  getCycles: vi.fn(async () => [
    { year: 2027, startedAt: "2027-01-01T00:00:00.000Z", endedAt: null },
  ]),
}));
vi.mock("@/lib/dietary", () => ({
  getMyDietary: vi.fn(async () => ({ savedAt: null })),
}));
vi.mock("@/lib/forms", () => ({
  listCompletedForms: vi.fn(async () => []),
  listAnsweredQuestionnaires: vi.fn(async () => []),
  listOptionalForms: vi.fn(async () => []),
  getJustAnswered: vi.fn(async () => null),
}));

import {
  getJustAnswered,
  listAnsweredQuestionnaires,
  listOptionalForms,
} from "@/lib/forms";
import FormsListPage from "./page";

const ART = "3b0a5c2e-8f3d-4f8e-9d7a-1c2b3a4d5e6f";

async function renderPage(answered?: string) {
  render(await FormsListPage({ searchParams: Promise.resolve({ answered }) }));
}

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listOptionalForms).mockResolvedValue([]);
  vi.mocked(listAnsweredQuestionnaires).mockResolvedValue([]);
  vi.mocked(getJustAnswered).mockResolvedValue(null);
});

describe("My forms — Optional", () => {
  it("lists each open optional questionnaire first, labelled Optional, with Answer", async () => {
    vi.mocked(listOptionalForms).mockResolvedValue([
      {
        activationId: ART,
        title: "Help build the art piece",
        description: "Want to help build the art piece? Tell us your skills.",
        started: false,
      },
      {
        activationId: "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b",
        title: "Run a workshop",
        description: "Want to run a workshop at camp?",
        started: true,
      },
    ]);
    await renderPage();

    const optional = within(screen.getByRole("region", { name: "Optional" }));
    // It comes first, before the forms the member keeps updating.
    expect(screen.getAllByRole("region")[0]).toBe(
      screen.getByRole("region", { name: "Optional" }),
    );
    expect(
      optional.getByText("Nobody has to fill these in. Answer if you want to."),
    ).toBeTruthy();
    const art = optional.getByRole("link", {
      name: /Help build the art piece/,
    });
    expect(art.getAttribute("href")).toBe(`/questionnaires/${ART}`);
    expect(within(art).getByText("Optional")).toBeTruthy();
    expect(within(art).getByText("Not answered")).toBeTruthy();
    expect(within(art).getByText("Answer")).toBeTruthy();
    const workshop = optional.getByRole("link", { name: /Run a workshop/ });
    expect(within(workshop).getByText("Started, not sent yet")).toBeTruthy();
  });

  it("draws no Optional section when nothing optional is open", async () => {
    await renderPage();
    expect(screen.queryByRole("region", { name: "Optional" })).toBeNull();
    expect(
      screen.getByRole("region", { name: "Update any time" }),
    ).toBeTruthy();
  });

  it("thanks the member after a submit and links to their answers", async () => {
    vi.mocked(getJustAnswered).mockResolvedValue({
      title: "Help build the art piece",
      answersHref: "/tools/forms/answers/art_build/2027",
    });
    vi.mocked(listAnsweredQuestionnaires).mockResolvedValue([
      {
        definitionKey: "art_build",
        cycle: 2027,
        completedAt: new Date("2026-10-03T12:20:00Z"),
        updatedAt: new Date("2026-10-03T12:20:00Z"),
        responses: {},
        questionnaire: {
          version: "1",
          title: "Help build the art piece",
          pages: [],
        } as never,
      },
    ]);
    await renderPage(ART);

    expect(getJustAnswered).toHaveBeenCalledWith("u1", ART);
    expect(
      screen.getByText(
        "Thanks. Your answers to Help build the art piece are saved.",
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "View my answers" })
        .getAttribute("href"),
    ).toBe("/tools/forms/answers/art_build/2027");
    const submitted = screen.getByRole("region", {
      name: "Submitted questionnaires",
    });
    const card = within(submitted).getByRole("link", {
      name: /Help build the art piece/,
    });
    expect(within(card).getByText("Submitted")).toBeTruthy();
    expect(within(card).getByText("View")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Optional" })).toBeNull();
  });
});
