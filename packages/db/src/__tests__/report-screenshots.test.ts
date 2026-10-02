import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import { sanitiseAccount } from "../account";
import {
  createReportScreenshot,
  deleteReportScreenshot,
  getReportScreenshotFile,
  isUnfiledScreenshotOf,
  listReportScreenshots,
  markReportScreenshotFiled,
  SCREENSHOT_GONE,
  takeStaleUnfiledScreenshots,
} from "../report-screenshots";
import * as schema from "../schema";

// Screenshots attached to bug reports (#313). Private: the captains' page and
// the image route read them; a delete writes its audit row in the same
// transaction; erasing the member who sent one deletes it.

const PNG = {
  contentType: "image/png" as const,
  sizeBytes: 1234,
};

async function filed(
  userId: string,
  issueNumber = 412,
): Promise<{ id: string }> {
  const { id } = await createReportScreenshot({
    userId,
    pathname: `report-screenshots/${userId}/shot-${issueNumber}.png`,
    ...PNG,
  });
  await markReportScreenshotFiled({
    id,
    userId,
    issueNumber,
    issueUrl: `https://github.com/o/r/issues/${issueNumber}`,
    reportTitle: "Waiting list button won't save",
    reportText: "I pressed Waiting list and it said it couldn't save.",
  });
  return { id };
}

describe("report screenshots", () => {
  const h = useTestDb();

  it("lists only filed screenshots, newest first, with who sent them", async () => {
    const thandeka = await makeUser(h.db(), { displayName: "Thandeka" });
    const unfiled = await createReportScreenshot({
      userId: thandeka.id,
      pathname: "report-screenshots/x/unfiled.png",
      ...PNG,
    });
    const { id } = await filed(thandeka.id);

    const rows = await listReportScreenshots();
    expect(rows.map((r) => r.id)).toEqual([id]);
    expect(rows[0]).toMatchObject({
      fromName: "Thandeka",
      issueNumber: 412,
      reportTitle: "Waiting list button won't save",
    });
    // An unfiled upload has no file a captain can open.
    expect(await getReportScreenshotFile(unfiled.id)).toBeNull();
    expect(await getReportScreenshotFile(id)).toMatchObject({
      userId: thandeka.id,
      contentType: "image/png",
    });
  });

  it("lets a report name only its sender's own unfiled picture, once", async () => {
    const jess = await makeUser(h.db());
    const mallory = await makeUser(h.db());
    const { id } = await createReportScreenshot({
      userId: jess.id,
      pathname: "report-screenshots/j/a.png",
      ...PNG,
    });
    expect(await isUnfiledScreenshotOf(id, jess.id)).toBe(true);
    expect(await isUnfiledScreenshotOf(id, mallory.id)).toBe(false);
    expect(await isUnfiledScreenshotOf("not-a-uuid", jess.id)).toBe(false);

    const stamp = {
      id,
      issueNumber: 7,
      issueUrl: "https://github.com/o/r/issues/7",
      reportTitle: "t",
      reportText: "x",
    };
    expect(
      await markReportScreenshotFiled({ ...stamp, userId: mallory.id }),
    ).toBe(false);
    expect(await markReportScreenshotFiled({ ...stamp, userId: jess.id })).toBe(
      true,
    );
    // Compare-and-set: the second filing wins nothing.
    expect(
      await markReportScreenshotFiled({
        ...stamp,
        userId: jess.id,
        issueNumber: 8,
      }),
    ).toBe(false);
    expect(await isUnfiledScreenshotOf(id, jess.id)).toBe(false);
  });

  it("deletes with an audit row in the same transaction, and says so twice", async () => {
    const captain = await makeUser(h.db(), { rank: "captain" });
    const member = await makeUser(h.db());
    const { id } = await filed(member.id, 409);

    const done = await deleteReportScreenshot({ id, actorId: captain.id });
    expect(done).toEqual({
      ok: true,
      pathname: `report-screenshots/${member.id}/shot-409.png`,
    });
    const audit = await h
      .db()
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "report_screenshot.deleted"));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorId: captain.id,
      target: member.id,
    });
    expect(audit[0]?.metadata).toMatchObject({
      screenshotId: id,
      issueNumber: 409,
    });

    expect(await deleteReportScreenshot({ id, actorId: captain.id })).toEqual({
      ok: false,
      error: SCREENSHOT_GONE,
    });
    expect(await listReportScreenshots()).toEqual([]);
  });

  it("clears unfiled uploads older than the cut-off, never a filed one", async () => {
    const member = await makeUser(h.db());
    const old = await createReportScreenshot({
      userId: member.id,
      pathname: "report-screenshots/m/old.png",
      ...PNG,
    });
    await h
      .db()
      .update(schema.reportScreenshots)
      .set({ createdAt: new Date(Date.now() - 3 * 86_400_000) })
      .where(eq(schema.reportScreenshots.id, old.id));
    const { id: keptFiled } = await filed(member.id);
    await h
      .db()
      .update(schema.reportScreenshots)
      .set({ createdAt: new Date(Date.now() - 3 * 86_400_000) })
      .where(eq(schema.reportScreenshots.id, keptFiled));
    const fresh = await createReportScreenshot({
      userId: member.id,
      pathname: "report-screenshots/m/fresh.png",
      ...PNG,
    });

    expect(
      await takeStaleUnfiledScreenshots(new Date(Date.now() - 86_400_000)),
    ).toEqual(["report-screenshots/m/old.png"]);
    const left = await h
      .db()
      .select({ id: schema.reportScreenshots.id })
      .from(schema.reportScreenshots);
    expect(left.map((r) => r.id).sort()).toEqual([keptFiled, fresh.id].sort());
  });

  it("goes when its member is erased, and only theirs", async () => {
    const member = await makeUser(h.db());
    const other = await makeUser(h.db());
    await filed(member.id, 1);
    const { id: kept } = await filed(other.id, 2);
    expect(await sanitiseAccount(member.id)).toMatchObject({ ok: true });
    expect((await listReportScreenshots()).map((r) => r.id)).toEqual([kept]);
  });

  it("refuses a picture type or size the table does not take", async () => {
    const member = await makeUser(h.db());
    await expect(
      createReportScreenshot({
        userId: member.id,
        pathname: "p",
        contentType: "image/gif" as "image/png",
        sizeBytes: 10,
      }),
    ).rejects.toThrow();
    await expect(
      createReportScreenshot({
        userId: member.id,
        pathname: "p",
        contentType: "image/png",
        sizeBytes: 6 * 1024 * 1024,
      }),
    ).rejects.toThrow();
  });
});
