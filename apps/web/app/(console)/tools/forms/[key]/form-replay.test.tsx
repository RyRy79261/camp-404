import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Questionnaire } from "@camp404/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => "/tools/forms/burner_profile",
}));
vi.mock("./actions", () => ({
  saveFormReplay: vi.fn(async () => ({ ok: true })),
}));

import { ChangeLog } from "./change-log";
import { FormReplay } from "./form-replay";

// A replayed form says "Saved" after a save, and stops saying it once the
// member edits again. The change log reads as a sentence to a screen reader.

afterEach(cleanup);

const ONE_PAGE: Questionnaire = {
  version: "test-1",
  pages: [
    {
      id: "p1",
      kind: "questions",
      title: "About you",
      questions: [
        {
          id: "name",
          kind: "short_text",
          prompt: "Your name",
          maxLength: 100,
          required: true,
        },
      ],
    },
  ],
};

describe("FormReplay", () => {
  it("takes the Saved banner down on the next edit", async () => {
    render(
      <FormReplay
        formKey="burner_profile"
        questionnaire={ONE_PAGE}
        initialResponses={{ name: "Ada" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(
      await screen.findByText(/Your answers — and the change log/),
    ).toBeTruthy();

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Ada L" },
    });
    await waitFor(() =>
      expect(
        screen.queryByText(/Your answers — and the change log/),
      ).toBeNull(),
    );
  });
});

describe("ChangeLog", () => {
  it("says what changed in words, not only with an arrow", () => {
    render(
      <ChangeLog
        edits={[
          {
            id: "e1",
            createdAt: new Date("2026-09-01T10:00:00Z"),
            changes: [
              { fieldId: "name", label: "Your name", from: "Ada", to: "Ada L" },
            ],
          } as never,
        ]}
      />,
    );
    expect(
      screen.getByText((_, el) => el?.textContent === "Changed from Ada"),
    ).toBeTruthy();
    expect(
      screen.getByText((_, el) => el?.textContent === "to Ada L"),
    ).toBeTruthy();
  });
});
