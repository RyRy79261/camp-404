import { describe, expect, it } from "vitest";
import type { AuditLogRow } from "@camp404/db/audit";
import {
  auditEntry,
  auditTarget,
  formatDateTime,
  relativeTime,
} from "../audit-format";

const NOW = new Date("2026-09-16T12:00:00Z");
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000);
const teams = (key: string) => ({ kitchen: "Kitchen" })[key] ?? key;

function row(overrides: Partial<AuditLogRow> = {}): AuditLogRow {
  return {
    id: "a1",
    action: "member.approval_decided",
    actorId: "11111111-1111-4111-8111-111111111111",
    actorName: "Cap Tain",
    target: "22222222-2222-4222-8222-222222222222",
    targetName: "Mem Ber",
    metadata: { from: "pending", status: "approved", withReason: false },
    createdAt: ago(300),
    ...overrides,
  };
}

describe("formatDateTime", () => {
  it("uses the camp's time zone, not the server's", () => {
    expect(formatDateTime(new Date("2026-09-16T22:30:00Z"))).toBe(
      "17 Sept 2026, 00:30",
    );
  });
});

describe("relativeTime", () => {
  it("counts elapsed time in the largest whole unit", () => {
    expect(relativeTime(ago(20), NOW)).toBe("just now");
    expect(relativeTime(ago(5 * 60 + 59), NOW)).toBe("5 minutes ago");
    expect(relativeTime(ago(2 * 3600), NOW)).toBe("2 hours ago");
    expect(relativeTime(ago(30 * 3600), NOW)).toBe("1 day ago");
  });

  it("gives up from a week, and for a time in the future", () => {
    expect(relativeTime(ago(7 * 86_400), NOW)).toBeNull();
    expect(relativeTime(ago(-60), NOW)).toBeNull();
  });
});

describe("auditTarget", () => {
  it("names a member, a team, a year and a code", () => {
    expect(auditTarget(row(), teams)).toBe("Mem Ber");
    expect(
      auditTarget(
        { action: "camp.teams.renamed", target: "kitchen", targetName: null },
        teams,
      ),
    ).toBe("Kitchen");
    expect(
      auditTarget(
        { action: "camp.cycle.advanced", target: "2027", targetName: null },
        teams,
      ),
    ).toBe("Year 2027");
    expect(
      auditTarget(
        { action: "invite.revoked", target: "dusty-otter", targetName: null },
        teams,
      ),
    ).toBe("Code dusty-otter");
  });

  it("says an id with no member is a removed account, and nothing is nothing", () => {
    expect(auditTarget(row({ targetName: null }), teams)).toBe(
      "A removed account",
    );
    expect(auditTarget(row({ target: null }), teams)).toBeNull();
  });
});

describe("auditEntry", () => {
  it("words a whole row", () => {
    expect(auditEntry(row(), teams, NOW)).toEqual({
      id: "a1",
      what: "Decided an application",
      who: "Cap Tain",
      about: "Mem Ber",
      detail: "Approved",
      when: "16 Sept 2026, 13:55",
      ago: "5 minutes ago",
    });
  });

  it("calls a row with no actor the app", () => {
    expect(
      auditEntry(row({ actorId: null, actorName: null }), teams, NOW).who,
    ).toBe("The app");
  });
});
