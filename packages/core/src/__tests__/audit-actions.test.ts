import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTION_LABELS,
  auditActionLabel,
  auditDetail,
} from "../audit-actions";

describe("auditActionLabel", () => {
  it("labels a known action and leaves an unknown one as stored", () => {
    expect(auditActionLabel("payment.recorded")).toBe("Recorded a payment");
    expect(auditActionLabel("calendar.event_created")).toBe(
      "Added a calendar event",
    );
    expect(auditActionLabel("cron.old_job")).toBe("cron.old_job");
    expect(auditActionLabel("toString")).toBe("toString");
  });

  it("has a label for every action", () => {
    for (const label of Object.values(AUDIT_ACTION_LABELS)) {
      expect(label.trim()).not.toBe("");
    }
  });
});

describe("auditDetail", () => {
  const teams = (key: string) => ({ kitchen: "Kitchen" })[key] ?? key;

  it("labels and says a captain's decision on a member's place", () => {
    expect(auditActionLabel("participation.decided")).toBe(
      "Decided a member's place this year",
    );
    expect(
      auditDetail("participation.decided", {
        cycle: 2027,
        from: "applied",
        to: "accepted",
      }),
    ).toBe("Accepted for 2027");
    expect(
      auditDetail("participation.decided", {
        cycle: 2027,
        from: "accepted",
        to: "waitlisted",
      }),
    ).toBe("Put on the waiting list for 2027");
    // A status that is not a decision, or no status at all, adds nothing.
    expect(
      auditDetail("participation.decided", { cycle: 2027, to: "maybe" }),
    ).toBeNull();
    expect(
      auditDetail("participation.decided", { cycle: 2027, to: "toString" }),
    ).toBeNull();
    expect(auditDetail("participation.decided", { to: "accepted" })).toBe(
      "Accepted",
    );
  });

  it("labels and says a member's withdrawal from this year", () => {
    expect(auditActionLabel("participation.withdrawn")).toBe(
      "Withdrew from this year",
    );
    expect(
      auditDetail("participation.withdrawn", { cycle: 2027, from: "accepted" }),
    ).toBe("Gave up a place for 2027");
    expect(
      auditDetail("participation.withdrawn", {
        cycle: 2027,
        from: "waitlisted",
      }),
    ).toBe("Left the waiting list for 2027");
    expect(
      auditDetail("participation.withdrawn", { cycle: 2027, from: "maybe" }),
    ).toBeNull();
  });

  it("says how an application was decided", () => {
    expect(
      auditDetail("member.approval_decided", {
        from: "pending",
        status: "rejected",
        withReason: true,
      }),
    ).toBe("Rejected, with a reason");
    expect(auditDetail("member.approval_decided", { status: "approved" })).toBe(
      "Approved",
    );
  });

  it("says a rank change and a team change in words", () => {
    expect(
      auditDetail("member.rank_changed", { from: "member", to: "captain" }),
    ).toBe("member to captain");
    expect(
      auditDetail(
        "member.team_lead_set",
        { team: "kitchen", isLead: false },
        teams,
      ),
    ).toBe("No longer leads Kitchen");
    expect(
      auditDetail("member.team_assigned", { team: "kitchen" }, teams),
    ).toBe("Kitchen");
  });

  it("uses the payments page's words for a status", () => {
    expect(
      auditDetail("payment.status_changed", {
        reference: "C404-M017-2027-1",
        from: "pending",
        to: "reconciled",
      }),
    ).toBe("C404-M017-2027-1, promised to received");
  });

  it("words a reimbursement move and a budget change", () => {
    expect(
      auditDetail("reimbursement.status_changed", {
        from: "submitted",
        to: "approved",
        amount: "12.34",
        currency: "ZAR",
      }),
    ).toMatch(/^R[\s\u00a0\u202f]?12,34, submitted to approved$/);
    expect(
      auditDetail("reimbursement.status_changed", {
        from: "approved",
        to: "paid",
        amount: "999",
        currency: "ZAR",
      }),
    ).toMatch(/^R[\s\u00a0\u202f]?999,00, approved to paid$/);
    // An old row with a code or amount outside today's rule reads as written:
    // a claim once made in dollars is never printed as rands.
    expect(
      auditDetail("reimbursement.status_changed", {
        from: "submitted",
        to: "approved",
        amount: "12.34",
        currency: "USD",
      }),
    ).toBe("USD 12.34, submitted to approved");
    expect(
      auditDetail("reimbursement.status_changed", {
        from: "submitted",
        to: "approved",
        amount: "12.34",
        currency: "zar",
      }),
    ).toBe("zar 12.34, submitted to approved");
    expect(
      auditDetail("reimbursement.status_changed", {
        from: "submitted",
        to: "approved",
        amount: "not money",
        currency: "EUR",
      }),
    ).toBe("EUR not money, submitted to approved");
    expect(auditDetail("team_budget.set", { team: "kitchen" }, teams)).toBe(
      "Kitchen",
    );
  });

  it("names a document and its new version", () => {
    expect(auditDetail("document.published", { title: "Kitchen safety" })).toBe(
      "Kitchen safety",
    );
    expect(auditDetail("document.updated", { version: 3 })).toBe(
      "Now version 3",
    );
  });

  it("marks a private read made through Claude", () => {
    for (const action of [
      "member.id_document.viewed",
      "member.bank_details.viewed",
      "safety.emergency_contacts.view",
    ]) {
      expect(auditDetail(action, { basis: "captain", via: "mcp" })).toBe(
        "Through Claude",
      );
      expect(auditDetail(action, { basis: "captain" })).toBeNull();
    }
  });

  it("names whose screen a pin was put on, or taken off", () => {
    // A pin's receipt is about the audience: that is what made the pin
    // allowed, and what says how far the message carried.
    expect(auditDetail("announcement.pinned", { scope: "everyone" })).toBe(
      "The whole camp",
    );
    expect(
      auditDetail(
        "announcement.unpinned",
        { scope: "team", team: "kitchen" },
        teams,
      ),
    ).toBe("Kitchen");
    // A team scope with no team says nothing rather than guessing.
    expect(auditDetail("announcement.pinned", { scope: "team" })).toBeNull();
  });

  it("names a calendar event and, when it has one, its team", () => {
    expect(
      auditDetail(
        "calendar.event_created",
        { title: "Kitchen briefing", team: "kitchen", date: "2026-10-01" },
        teams,
      ),
    ).toBe("Kitchen briefing · Kitchen");
    expect(
      auditDetail("calendar.event_created", {
        title: "Build day",
        team: null,
        allDay: true,
      }),
    ).toBe("Build day");
    expect(auditDetail("calendar.event_created", { team: "kitchen" })).toBe(
      null,
    );
  });

  it("shows nothing for a shape it does not know", () => {
    expect(auditDetail("member.rank_changed", { to: 42 })).toBeNull();
    expect(auditDetail("member.approval_decided", null)).toBeNull();
    expect(auditDetail("member.notes.viewed", { secret: "x" })).toBeNull();
  });
});

describe("recipe audit rows", () => {
  it("label every recipe decision and the kitchen settings", () => {
    expect(auditActionLabel("recipe.approved")).toBe("Approved a recipe");
    expect(auditActionLabel("recipe.proofread_queued")).toBe(
      "Sent a recipe to Claude to write",
    );
    expect(auditActionLabel("recipe.rerun_requested")).toBe(
      "Asked a captain to proofread a recipe again",
    );
    expect(auditActionLabel("recipe.plates_queued")).toBe(
      "Proofread a recipe for a plate count",
    );
    expect(auditActionLabel("camp.kitchen_settings.changed")).toBe(
      "Changed the kitchen settings",
    );
    expect(auditActionLabel("camp.kitchen_meal_plan.changed")).toBe(
      "Changed the kitchen's meal plan",
    );
  });

  it("name the recipe, and the version where one was written", () => {
    expect(auditDetail("recipe.rejected", { title: "Dhal" })).toBe("Dhal");
    expect(
      auditDetail("recipe.rerun_requested", { title: "Dhal", note: "Grams" }),
    ).toBe("Dhal");
    expect(auditDetail("recipe.accepted", { title: "Dhal", version: 2 })).toBe(
      "Dhal, version 2",
    );
    expect(auditDetail("recipe.version_added", { version: 3 })).toBe(
      "Version 3",
    );
    expect(auditDetail("recipe.approved", {})).toBeNull();
  });

  it("label and describe the source editor's rows", () => {
    expect(auditActionLabel("recipe.source_saved")).toBe(
      "Changed a recipe's source text",
    );
    expect(auditActionLabel("recipe.questions_answered")).toBe(
      "Answered Claude's questions on a recipe",
    );
    expect(auditActionLabel("recipe.written_by_claude")).toBe(
      "Had Claude write a recipe version",
    );
    expect(
      auditDetail("recipe.source_saved", { title: "Dhal", version: 2 }),
    ).toBe("Dhal, text version 2");
    expect(auditDetail("recipe.source_saved", { version: 2 })).toBe(
      "Text version 2",
    );
    expect(auditDetail("recipe.source_saved", { title: "Dhal" })).toBe("Dhal");
    expect(
      auditDetail("recipe.questions_answered", {
        title: "Dhal",
        answer: "2 kg",
      }),
    ).toBe("Dhal");
    expect(
      auditDetail("recipe.written_by_claude", {
        title: "Dhal",
        version: 3,
        runId: "r",
      }),
    ).toBe("Dhal, version 3");
    expect(auditDetail("recipe.written_by_claude", {})).toBeNull();
  });

  it("name the plate count a recipe was proofread for", () => {
    expect(
      auditDetail("recipe.plates_queued", { title: "Dhal", plates: 45 }),
    ).toBe("Dhal, 45 plates");
    expect(auditDetail("recipe.plates_queued", { plates: 45 })).toBe(
      "45 plates",
    );
    expect(auditDetail("recipe.plates_queued", { title: "Dhal" })).toBe("Dhal");
  });
});
