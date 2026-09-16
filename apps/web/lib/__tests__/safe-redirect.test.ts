import { describe, expect, it } from "vitest";
import { safeInternalPath } from "../safe-redirect";

describe("safeInternalPath", () => {
  it("keeps a path on this app, with its query and hash", () => {
    expect(
      safeInternalPath("/api/mcp/oauth/authorize?client_id=abc&state=x#top"),
    ).toBe("/api/mcp/oauth/authorize?client_id=abc&state=x#top");
    expect(safeInternalPath("/captains")).toBe("/captains");
  });

  it("sends anything that leaves the app home instead", () => {
    for (const raw of [
      "https://evil.example/sign-in",
      "//evil.example",
      "/\\evil.example",
      "/\t/evil.example",
      "/\n/evil.example",
      "\\/evil.example",
      "javascript:alert(1)",
      "evil.example",
      "",
      null,
      undefined,
    ]) {
      expect(safeInternalPath(raw)).toBe("/");
    }
  });
});
