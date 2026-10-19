// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  REPORT_SCREENSHOT_TYPES,
  SCREENSHOT_GONE,
  createReportScreenshot,
} from "@camp404/db/report-screenshots";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { bothWays } from "./_agreement";

// Screenshots on bug reports (#313), through lib/report-screenshots.ts, on the
// database and on the E2E store: a picture is filed with its report once, by
// the member who uploaded it; the captains' list shows filed ones only, newest
// first; a captain deletes one once. The blob upload and read are the
// database side's only (there is no blob store here), so each side keeps its
// pictures through its own writer, and the cases start from there. Every
// caller gates to the uploader or to captains. See _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import {
  isUnfiledScreenshotOf,
  listReportScreenshots,
  markReportScreenshotFiled,
  removeReportScreenshot,
} from "../report-screenshots";

const [PNG] = REPORT_SCREENSHOT_TYPES;

const stamp = (id: string, userId: string, n: number) => ({
  id,
  userId,
  issueNumber: n,
  issueUrl: `https://github.com/camp-404/issues/${n}`,
  reportTitle: `Report ${n}`,
  reportText: "It broke.",
});

describe("report screenshots: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-03-01T10:00:00Z"));
  });

  it("files a picture once, by its uploader, lists filed ones newest first, and deletes once", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      vi.setSystemTime(new Date("2027-03-01T10:00:00Z"));
      const upload = async (userId: string, n: number) =>
        seed.side === "db"
          ? (
              await createReportScreenshot({
                userId,
                pathname: `report-screenshots/${userId}/shot-${n}.png`,
                contentType: PNG!,
                sizeBytes: 3,
              })
            ).id
          : testStore.createReportScreenshot({
              userId,
              contentType: PNG!,
              bytes: new Uint8Array([1, 2, 3]),
            }).id;
      const mine = await upload(p.member, 1);
      const theirs = await upload(p.other, 2);
      const unfiled = await upload(p.member, 3);
      const before = {
        own: await isUnfiledScreenshotOf(mine, p.member),
        notOwn: await isUnfiledScreenshotOf(theirs, p.member),
      };
      const filed = await markReportScreenshotFiled(stamp(mine, p.member, 7));
      const again = await markReportScreenshotFiled(stamp(mine, p.member, 8));
      const byOther = await markReportScreenshotFiled(
        stamp(theirs, p.member, 9),
      );
      vi.setSystemTime(new Date("2027-03-01T11:00:00Z"));
      const theirsFiled = await markReportScreenshotFiled(
        stamp(theirs, p.other, 10),
      );
      const list = await listReportScreenshots();
      const removed = await removeReportScreenshot({
        id: theirs,
        actorId: p.captain,
      });
      const removedAgain = await removeReportScreenshot({
        id: theirs,
        actorId: p.captain,
      });
      return {
        before,
        afterFiling: await isUnfiledScreenshotOf(mine, p.member),
        stillUnfiled: await isUnfiledScreenshotOf(unfiled, p.member),
        filed,
        again,
        byOther,
        theirsFiled,
        list: list.map((r) => ({
          userId: r.userId,
          fromName: r.fromName,
          issueNumber: r.issueNumber,
          reportTitle: r.reportTitle,
        })),
        removed,
        removedAgain,
        after: (await listReportScreenshots()).map((r) => r.issueNumber),
      };
    });
    expect(db).toEqual({
      before: { own: true, notOwn: false },
      afterFiling: false,
      stillUnfiled: true,
      filed: true,
      again: false,
      byOther: false,
      theirsFiled: true,
      list: [
        {
          userId: "@other",
          fromName: "Zed",
          issueNumber: 10,
          reportTitle: "Report 10",
        },
        {
          userId: "@member",
          fromName: "Nova",
          issueNumber: 7,
          reportTitle: "Report 7",
        },
      ],
      removed: { ok: true },
      removedAgain: { ok: false, error: SCREENSHOT_GONE },
      after: [7],
    });
    expect(store).toEqual(db);
    vi.useRealTimers();
  });
});
