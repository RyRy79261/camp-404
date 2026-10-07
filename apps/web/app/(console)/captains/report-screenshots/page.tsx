import { errorLogText } from "@camp404/core";
import { after } from "next/server";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { captainPageGate } from "@/lib/captain-gate";
import {
  clearStaleUnfiledScreenshots,
  listReportScreenshots,
} from "@/lib/report-screenshots";
import { ReportScreenshotsList } from "./report-screenshots-list";

export const dynamic = "force-dynamic";

export const metadata = { title: "Report screenshots — Camp 404" };

// Screenshots members attached to bug reports (#313, owner approved
// 2026-10-02, mock-up option A). They can show other members' details, so
// captains only: preview-but-locked (D3), and nothing is read for anyone else.
// No automatic expiry (owner's rule): a captain deletes each one once its bug
// is fixed. The only thing cleared by itself is an upload whose report was
// never filed, a day on, as this page loads (there is no cron).

export default async function ReportScreenshotsPage() {
  const { cleared } = await captainPageGate("captain");
  const screenshots = cleared ? await listReportScreenshots() : [];
  if (cleared) {
    after(async () => {
      try {
        await clearStaleUnfiledScreenshots();
      } catch (err) {
        console.error(
          "report-screenshot stale cleanup failed",
          errorLogText(err, process.env),
        );
      }
    });
  }

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Captains / Report screenshots"
        title="Report screenshots"
        description="Pictures members attached to bug reports. They can show other members' details, so only captains see them. Delete each one once the bug is fixed."
      />
      {cleared ? (
        <ReportScreenshotsList screenshots={screenshots} />
      ) : (
        <CaptainLock message="Report screenshots are captain-only. Your rank doesn't have clearance for this." />
      )}
    </div>
  );
}
