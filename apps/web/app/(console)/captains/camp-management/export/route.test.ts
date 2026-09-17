import { describe, expect, it, vi } from "vitest";

// The download route: the gate decides the rank, the builder decides the
// columns, and the response is an uncached attachment.

vi.mock("@/lib/captain-gate", () => ({
  captainPageGate: vi.fn(async () => ({
    campUser: { id: "lead-1" },
    rank: "team_lead",
    cleared: true,
  })),
}));
vi.mock("@/lib/member-export", () => ({
  buildMemberExport: vi.fn(async () => ({
    filename: "camp-404-members-2026-09-16.csv",
    content: "\uFEFFName\r\n",
    mimeType: "text/csv;charset=utf-8",
  })),
}));

import { captainPageGate } from "@/lib/captain-gate";
import { buildMemberExport } from "@/lib/member-export";
import { GET } from "./route";

describe("GET /captains/camp-management/export", () => {
  it("builds the file for the gated viewer's rank and sends it as an attachment", async () => {
    const res = await GET();

    expect(captainPageGate).toHaveBeenCalledWith("camp_member");
    expect(buildMemberExport).toHaveBeenCalledWith({
      userId: "lead-1",
      rank: "team_lead",
    });
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="camp-404-members-2026-09-16.csv"',
    );
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    // The byte-order mark stays on the wire, so Excel reads the file as UTF-8.
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });
});
