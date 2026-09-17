import { beforeEach, describe, expect, it, vi } from "vitest";

// auditReadAfterResponse schedules the write with next/server `after` and
// logs a failure instead of swallowing it.

const scheduled: (() => Promise<void>)[] = [];
vi.mock("next/server", () => ({
  after: vi.fn((task: () => Promise<void>) => {
    scheduled.push(task);
  }),
}));
vi.mock("@camp404/db/audit", () => ({ appendAuditEvent: vi.fn() }));

import { appendAuditEvent, type AuditEvent } from "@camp404/db/audit";
import { auditReadAfterResponse } from "../audit";

const EVENT: AuditEvent = {
  actorId: "cap-1",
  action: "member.id_document.viewed",
  target: "member-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  scheduled.length = 0;
});

describe("auditReadAfterResponse", () => {
  it("writes nothing until the response is done, then writes once", async () => {
    auditReadAfterResponse(EVENT);
    expect(appendAuditEvent).not.toHaveBeenCalled();

    await Promise.all(scheduled.map((task) => task()));

    expect(appendAuditEvent).toHaveBeenCalledExactlyOnceWith(EVENT);
  });

  it("logs a failed write with the action it was for", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(appendAuditEvent).mockRejectedValue(new Error("db down"));

    auditReadAfterResponse(EVENT);
    await Promise.all(scheduled.map((task) => task()));

    expect(logged).toHaveBeenCalledWith(
      "audit write failed: member.id_document.viewed",
      expect.any(Error),
    );
  });
});
