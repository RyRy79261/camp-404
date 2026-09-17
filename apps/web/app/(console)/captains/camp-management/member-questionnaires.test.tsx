import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { MemberQuestionnaire } from "@camp404/core";
import { MemberQuestionnaires } from "./member-questionnaires";

// The captain sees each of a member's questionnaires with a status, and a due
// date or finish date where one helps.

afterEach(cleanup);

const day = (d: number) => new Date(Date.UTC(2026, 8, d, 10));

function q(patch: Partial<MemberQuestionnaire>): MemberQuestionnaire {
  return {
    key: "k",
    title: "Form",
    status: "next-up",
    dueAt: null,
    completedAt: null,
    ...patch,
  };
}

describe("MemberQuestionnaires", () => {
  it("labels every status and shows due and finish dates", () => {
    render(
      <MemberQuestionnaires
        questionnaires={[
          q({
            key: "a",
            title: "Burner profile",
            status: "complete",
            completedAt: day(2),
          }),
          q({ key: "b", title: "Safety", status: "next-up", dueAt: day(20) }),
          q({ key: "c", title: "Dietary", status: "locked" }),
          q({ key: "d", title: "Survey", status: "optional" }),
          q({ key: "e", title: "Old form", status: "expired" }),
        ]}
      />,
    );

    const rows = screen.getAllByRole("listitem");
    const read = (i: number) => rows[i]!.textContent;
    expect(read(0)).toBe("Burner profileDone 2 SeptDone");
    expect(within(rows[1]!).getByText("Due 20 Sept")).toBeTruthy();
    expect(within(rows[1]!).getByText("Up next")).toBeTruthy();
    expect(within(rows[2]!).getByText("Queued")).toBeTruthy();
    expect(within(rows[3]!).getByText("Optional")).toBeTruthy();
    expect(within(rows[4]!).getByText("Closed")).toBeTruthy();
  });

  it("says so when nothing has been sent", () => {
    render(<MemberQuestionnaires questionnaires={[]} />);
    expect(screen.getByText("Nothing has been sent to them yet.")).toBeTruthy();
  });
});
