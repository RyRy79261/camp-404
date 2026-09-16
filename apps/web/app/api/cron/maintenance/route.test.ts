import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The daily upkeep: both steps run and report, the photo sweep runs only on
// production, and a failure answers 500 without leaking a secret.

vi.mock("@/lib/cron-auth", () => ({ assertCron: vi.fn(() => null) }));
vi.mock("@camp404/db/maintenance", () => ({
  backfillIdEncryption: vi.fn(),
  listLiveAuthUserIds: vi.fn(),
}));
vi.mock("@/lib/avatar-blob", () => ({ sweepOrphanAvatarBlobs: vi.fn() }));

import { GET } from "./route";
import { assertCron } from "@/lib/cron-auth";
import {
  backfillIdEncryption,
  listLiveAuthUserIds,
} from "@camp404/db/maintenance";
import { sweepOrphanAvatarBlobs } from "@/lib/avatar-blob";

const req = () => new Request("https://camp.test/api/cron/maintenance");
const SECRET_URL = "postgres://user:s3cr3t-pass@db.example/app";

describe("GET /api/cron/maintenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertCron).mockReturnValue(null);
    vi.mocked(backfillIdEncryption).mockResolvedValue({
      scanned: 2,
      migrated: 1,
      stripped: 1,
    });
    vi.mocked(listLiveAuthUserIds).mockResolvedValue(new Set(["auth-1"]));
    vi.mocked(sweepOrphanAvatarBlobs).mockResolvedValue({
      status: "swept",
      folders: 1,
      deleted: 3,
    });
    process.env.VERCEL_ENV = "production";
  });
  afterEach(() => {
    delete process.env.VERCEL_ENV;
    delete process.env.DATABASE_URL;
  });

  it("runs nothing without the cron secret", async () => {
    vi.mocked(assertCron).mockReturnValue(
      new Response("Unauthorized", { status: 401 }) as never,
    );
    expect((await GET(req())).status).toBe(401);
    expect(backfillIdEncryption).not.toHaveBeenCalled();
    expect(sweepOrphanAvatarBlobs).not.toHaveBeenCalled();
  });

  it("reports both steps on production", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      job: "maintenance",
      idEncryption: { status: "done", scanned: 2, migrated: 1, stripped: 1 },
      orphanPhotos: { status: "swept", folders: 1, deleted: 3 },
    });
    expect(sweepOrphanAvatarBlobs).toHaveBeenCalledWith(new Set(["auth-1"]));
  });

  it("skips the photo sweep outside production", async () => {
    process.env.VERCEL_ENV = "preview";
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).orphanPhotos.status).toBe("skipped");
    expect(listLiveAuthUserIds).not.toHaveBeenCalled();
    expect(sweepOrphanAvatarBlobs).not.toHaveBeenCalled();
  });

  it("answers 500 when the sweep refuses", async () => {
    vi.mocked(sweepOrphanAvatarBlobs).mockResolvedValue({
      status: "refused",
      message: "No live accounts were found, so no photos were deleted.",
    });
    expect((await GET(req())).status).toBe(500);
  });

  it("still sweeps when the backfill fails, answers 500, and leaks no secret", async () => {
    process.env.DATABASE_URL = SECRET_URL;
    vi.mocked(backfillIdEncryption).mockRejectedValue(
      new Error(`connect failed: ${SECRET_URL}`),
    );
    const res = await GET(req());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.idEncryption.status).toBe("failed");
    expect(body.orphanPhotos.status).toBe("swept");
    expect(JSON.stringify(body)).not.toContain("s3cr3t-pass");
  });
});
