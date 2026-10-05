import { describe, expect, it } from "vitest";
import { AddTaskInput } from "../task";

const base = {
  title: "Buy shade cloth",
  team: null,
  assigneeId: null,
};

describe("AddTaskInput deadline", () => {
  it("keeps a real day as typed", () => {
    const parsed = AddTaskInput.safeParse({ ...base, due: "2027-02-28" });
    expect(parsed.success && parsed.data.due).toBe("2027-02-28");
    expect(AddTaskInput.safeParse({ ...base, due: "2028-02-29" }).success).toBe(
      true,
    );
    expect(AddTaskInput.safeParse({ ...base, due: null }).success).toBe(true);
  });

  it("refuses a day the calendar does not have, rather than rolling it over", () => {
    for (const due of [
      "2027-02-30",
      "2027-02-29",
      "2027-04-31",
      "2027-13-01",
    ]) {
      const parsed = AddTaskInput.safeParse({ ...base, due });
      expect(parsed.success, due).toBe(false);
      expect(parsed.error?.issues[0]?.message).toBe(
        "Pick a date for the deadline.",
      );
    }
  });
});
