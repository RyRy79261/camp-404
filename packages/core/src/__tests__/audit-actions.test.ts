import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTION_LABELS,
  auditActionLabel,
  auditDetail,
} from "../audit-actions";

describe("auditActionLabel", () => {
  it("labels a known action and leaves an unknown one as stored", () => {
    expect(auditActionLabel("payment.recorded")).toBe("Recorded a payment");
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
        amount: "120.50",
        currency: "ZAR",
      }),
    ).toBe("ZAR 120.50, submitted to approved");
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

  it("shows nothing for a shape it does not know", () => {
    expect(auditDetail("member.rank_changed", { to: 42 })).toBeNull();
    expect(auditDetail("member.approval_decided", null)).toBeNull();
    expect(auditDetail("member.notes.viewed", { secret: "x" })).toBeNull();
  });
});
