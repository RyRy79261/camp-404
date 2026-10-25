import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTION_LABELS,
  auditActionLabel,
  auditDetail,
  type AuditAction,
} from "../audit-actions";
import type { AuditEvents } from "../audit-events";

// A row as today's writers write it, so a fixture's keys are checked against
// AuditEvents (a made-up key does not compile). Old and odd rows go straight
// to auditDetail.
const detail = <A extends AuditAction>(
  action: A,
  metadata: Partial<AuditEvents[A]>,
  teamLabel?: (key: string) => string,
) => auditDetail(action, metadata, teamLabel);

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

  it("says which logistics phase changed, and to which days", () => {
    expect(
      detail("logistics.phase_set", {
        phase: "build",
        startDate: "2027-04-24",
        endDate: "2027-04-26",
      }),
    ).toBe("Build, 2027-04-24 to 2027-04-26");
    expect(detail("logistics.phase_cleared", { phase: "strike" })).toBe(
      "Strike",
    );
    expect(detail("logistics.phase_set", { phase: "party" })).toBeNull();
  });

  it("counts the members on an export and on an opened camp sheet", () => {
    expect(auditActionLabel("member.sheet_viewed")).toBe(
      "Opened the camp sheet",
    );
    expect(detail("member.sheet_viewed", { rows: 12 })).toBe("12 members");
    expect(detail("member.export", { rows: 1 })).toBe("1 member");
  });

  it("says where a member's allergies were read", () => {
    expect(detail("safety.allergies.view", { via: "daily_sheet" })).toBe(
      "On the daily site sheet",
    );
    expect(
      detail("safety.allergies.view", {
        via: "questionnaire_results",
        title: "Dietary",
      }),
    ).toBe("In the answers to Dietary");
    expect(
      detail("safety.allergies.view", {
        via: "questionnaire_csv",
        title: "Dietary",
      }),
    ).toBe("In the CSV of Dietary");
  });

  it("names the shift, and the day a member or a slot changed on", () => {
    expect(auditActionLabel("shifts.member_placed")).toBe(
      "Put a member on a shift",
    );
    expect(
      detail("shifts.member_placed", {
        name: "Morning clean",
        day: "2027-04-29",
      }),
    ).toBe("Morning clean, 2027-04-29");
    expect(
      detail("shifts.slot_needed_set", {
        name: "Ice run",
        day: "2027-04-30",
        needed: false,
      }),
    ).toBe("Ice run, 2027-04-30, not needed");
    expect(detail("shifts.type_added", { name: "Brunch: cooks" })).toBe(
      "Brunch: cooks",
    );
    expect(detail("shifts.asked", { asked: 1 })).toBe("1 member");
    expect(detail("shifts.member_removed", { name: "Ice run" })).toBeNull();
  });

  it("labels and says a captain's decision on a member's place", () => {
    expect(auditActionLabel("participation.decided")).toBe(
      "Decided a member's place this year",
    );
    expect(
      detail("participation.decided", {
        cycle: 2027,
        from: "applied",
        to: "accepted",
      }),
    ).toBe("Accepted for 2027");
    expect(
      detail("participation.decided", {
        cycle: 2027,
        from: "accepted",
        to: "waitlisted",
      }),
    ).toBe("Put on the waiting list for 2027");
    // A status that is not a decision, or no status at all, adds nothing.
    expect(
      detail("participation.decided", { cycle: 2027, to: "maybe" }),
    ).toBeNull();
    expect(
      detail("participation.decided", { cycle: 2027, to: "toString" }),
    ).toBeNull();
    expect(detail("participation.decided", { to: "accepted" })).toBe(
      "Accepted",
    );
  });

  it("labels and says a member's withdrawal from this year", () => {
    expect(auditActionLabel("participation.withdrawn")).toBe(
      "Withdrew from this year",
    );
    expect(
      detail("participation.withdrawn", { cycle: 2027, from: "accepted" }),
    ).toBe("Gave up a place for 2027");
    expect(
      detail("participation.withdrawn", {
        cycle: 2027,
        from: "waitlisted",
      }),
    ).toBe("Left the waiting list for 2027");
    expect(
      detail("participation.withdrawn", { cycle: 2027, from: "maybe" }),
    ).toBeNull();
  });

  it("labels and says a change to a member's DDT or WAP", () => {
    expect(auditActionLabel("ticket.pass_changed")).toBe(
      "Changed a member's ticket, DDT or WAP",
    );
    expect(
      detail("ticket.pass_changed", {
        cycle: 2027,
        pass: "ticket",
        from: "unknown",
        to: "has_ticket",
      }),
    ).toBe("Ticket: has ticket for 2027");
    expect(
      detail("ticket.pass_changed", {
        cycle: 2027,
        pass: "wap",
        from: "requested",
        to: "issued",
      }),
    ).toBe("WAP: issued for 2027");
    expect(
      detail("ticket.pass_changed", {
        pass: "ddt",
        from: "none",
        to: "can_transfer",
      }),
    ).toBe("DDT: can pass on");
    // A value of the other pass, an unknown pass, or a prototype key adds
    // nothing.
    expect(
      detail("ticket.pass_changed", {
        pass: "wap",
        to: "allocated",
      }),
    ).toBeNull();
    expect(
      detail("ticket.pass_changed", { pass: "vehicle", to: "issued" }),
    ).toBeNull();
    expect(
      detail("ticket.pass_changed", {
        pass: "wap",
        to: "toString",
      }),
    ).toBeNull();
  });

  it("says how an application was decided", () => {
    expect(
      detail("member.approval_decided", {
        from: "pending",
        status: "rejected",
        withReason: true,
      }),
    ).toBe("Rejected, with a reason");
    expect(detail("member.approval_decided", { status: "approved" })).toBe(
      "Approved",
    );
  });

  it("says a rank change and a team change in words", () => {
    expect(
      detail("member.rank_changed", { from: "member", to: "captain" }),
    ).toBe("member to captain");
    expect(
      detail("member.team_lead_set", { team: "kitchen", isLead: false }, teams),
    ).toBe("No longer leads Kitchen");
    expect(detail("member.team_assigned", { team: "kitchen" }, teams)).toBe(
      "Kitchen",
    );
  });

  it("uses the payments page's words for a status", () => {
    expect(
      detail("payment.status_changed", {
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
    expect(detail("team_budget.set", { team: "kitchen" }, teams)).toBe(
      "Kitchen",
    );
    // Claims and budgets since #242 keep whole cents.
    expect(
      detail("reimbursement.status_changed", {
        from: "approved",
        to: "paid",
        amountCents: 45050,
        currency: "ZAR",
      }),
    ).toMatch(/^R[\s\u00a0\u202f]?450,50, approved to paid$/);
    expect(
      detail(
        "team_budget.set",
        { team: "kitchen", amountCents: 500000, fromCents: null },
        teams,
      ),
    ).toMatch(/^Kitchen: R[\s\u00a0\u202f]?5[\s\u00a0\u202f]?000,00$/);
    expect(
      detail(
        "team_budget.set",
        { team: "kitchen", amountCents: null, fromCents: 100 },
        teams,
      ),
    ).toBe("Kitchen: no budget");
    expect(
      detail("reimbursement.receipt_viewed", { team: "kitchen" }, teams),
    ).toBe("Kitchen");
    expect(detail("team.program_changed", { team: "kitchen" }, teams)).toBe(
      "Kitchen",
    );
  });

  it("names a Survival Guide chapter, its version and whether it is public", () => {
    expect(detail("document.published", { title: "Kitchen safety" })).toBe(
      "Kitchen safety",
    );
    expect(
      detail("document.published", {
        title: "Kitchen safety",
        version: 3,
      }),
    ).toBe("Kitchen safety, version 3");
    expect(detail("document.updated", { title: "Dishes" })).toBe("Dishes");
    // No longer written: a row from before 2026-10-04 still reads.
    expect(
      auditDetail("document.public_set", { title: "Drive in", public: true }),
    ).toBe("Drive in: public");
    expect(
      auditDetail("document.public_set", { title: "Drive in", public: false }),
    ).toBe("Drive in: members only");
    expect(detail("document.reviewed", { title: "MOOP" })).toBe("MOOP");
    expect(
      detail("document.published", {
        title: "Kitchen safety",
        version: 3,
        public: true,
      }),
    ).toBe("Kitchen safety, version 3, on the public site");
    expect(
      detail("document.members_only_set", {
        title: "Medical plan",
        membersOnly: true,
      }),
    ).toBe("Medical plan: members only");
    expect(
      detail("document.members_only_set", {
        title: "Medical plan",
        membersOnly: false,
      }),
    ).toBe("Medical plan: may go on the public site");
  });

  it("names a guide section and how many chapters went with it", () => {
    expect(
      detail("guide.section_public_set", {
        category: "safety",
        public: true,
        chapters: [
          { slug: "burn-barrel", title: "Burn barrel" },
          { slug: "heat", title: "Heat, dust and water" },
        ],
      }),
    ).toBe("Safety: public, 2 chapters");
    expect(
      detail("guide.section_public_set", {
        category: "kitchen",
        public: false,
        chapters: [{ slug: "washing-up", title: "Washing up" }],
      }),
    ).toBe("Kitchen: members only, 1 chapter");
    expect(
      detail("guide.section_public_set", { category: "manual" }),
    ).toBeNull();
  });

  it("marks a private read made through Claude", () => {
    // Only emergency contacts are still read through Claude; ID and bank rows
    // from before #353 say so too.
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
    expect(detail("announcement.pinned", { scope: "everyone" })).toBe(
      "The whole camp",
    );
    expect(
      detail(
        "announcement.unpinned",
        { scope: "team", team: "kitchen" },
        teams,
      ),
    ).toBe("Kitchen");
    // A team scope with no team says nothing rather than guessing.
    expect(detail("announcement.pinned", { scope: "team" })).toBeNull();
  });

  it("names a calendar event and, when it has one, its team", () => {
    expect(
      detail(
        "calendar.event_created",
        { title: "Kitchen briefing", team: "kitchen", date: "2026-10-01" },
        teams,
      ),
    ).toBe("Kitchen briefing · Kitchen");
    expect(
      detail("calendar.event_created", {
        title: "Build day",
        team: null,
        allDay: true,
      }),
    ).toBe("Build day");
    expect(detail("calendar.event_created", { team: "kitchen" })).toBe(null);
    expect(
      detail(
        "calendar.event_changed",
        { title: "Budget round 2", team: "kitchen" },
        teams,
      ),
    ).toBe("Budget round 2 · Kitchen");
    expect(detail("calendar.event_removed", { title: "Old meeting" })).toBe(
      "Old meeting",
    );
  });

  it("shows nothing for a shape it does not know", () => {
    expect(auditDetail("member.rank_changed", { to: 42 })).toBeNull();
    expect(auditDetail("member.approval_decided", null)).toBeNull();
    expect(auditDetail("member.notes.viewed", { secret: "x" })).toBeNull();
    expect(auditDetail("cron.old_job", { name: "x" })).toBeNull();
    expect(auditDetail("toString", { name: "x" })).toBeNull();
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
    expect(detail("recipe.rejected", { title: "Dhal" })).toBe("Dhal");
    expect(
      detail("recipe.rerun_requested", { title: "Dhal", note: "Grams" }),
    ).toBe("Dhal");
    expect(detail("recipe.accepted", { title: "Dhal", version: 2 })).toBe(
      "Dhal, version 2",
    );
    // No longer written: an old row still reads.
    expect(auditDetail("recipe.version_added", { version: 3 })).toBe(
      "Version 3",
    );
    expect(detail("recipe.approved", {})).toBeNull();
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
    expect(detail("recipe.source_saved", { title: "Dhal", version: 2 })).toBe(
      "Dhal, text version 2",
    );
    expect(detail("recipe.source_saved", { version: 2 })).toBe(
      "Text version 2",
    );
    expect(detail("recipe.source_saved", { title: "Dhal" })).toBe("Dhal");
    expect(
      detail("recipe.questions_answered", {
        title: "Dhal",
        round: 1,
      }),
    ).toBe("Dhal");
    expect(
      detail("recipe.written_by_claude", {
        title: "Dhal",
        version: 3,
        runId: "r",
      }),
    ).toBe("Dhal, version 3");
    expect(detail("recipe.written_by_claude", {})).toBeNull();
  });

  it("name the plate count a recipe was proofread for", () => {
    expect(detail("recipe.plates_queued", { title: "Dhal", plates: 45 })).toBe(
      "Dhal, 45 plates",
    );
    expect(detail("recipe.plates_queued", { plates: 45 })).toBe("45 plates");
    expect(detail("recipe.plates_queued", { title: "Dhal" })).toBe("Dhal");
  });

  it("names the questionnaire, and which way its year policy went", () => {
    expect(
      detail("questionnaire.unpublished", { title: "Coming this year?" }),
    ).toBe("Coming this year?");
    expect(detail("questionnaire.send_closed", { title: "Tent check" })).toBe(
      "Tent check",
    );
    expect(
      detail("questionnaire.carry_over_set", {
        title: "Dietary needs",
        carryOver: true,
      }),
    ).toBe("Dietary needs: answers kept next year");
    expect(
      detail("questionnaire.carry_over_set", {
        title: "Dietary needs",
        carryOver: false,
      }),
    ).toBe("Dietary needs: asked again next year");
    expect(
      detail("questionnaire.carry_over_set", { title: "Dietary needs" }),
    ).toBe("Dietary needs");
    expect(
      detail("questionnaire.anonymous_results_set", {
        title: "Tent sizes",
        anonymous: true,
      }),
    ).toBe("Tent sizes: results without names");
    expect(
      detail("questionnaire.anonymous_results_set", {
        title: "Tent sizes",
        anonymous: false,
      }),
    ).toBe("Tent sizes: results with names");
  });
});
