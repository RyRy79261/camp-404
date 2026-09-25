import { Inter } from "next/font/google";
import { UNSET_CYCLE } from "@camp404/db/camp-config";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { captainPageGate } from "@/lib/captain-gate";
import { getJoinPageForEditor } from "@/lib/join-page";
import { JoinPageManager, type JoinPageView } from "./join-page-manager";

export const dynamic = "force-dynamic";

export const metadata = { title: "Join page — Camp 404" };

// The join page's editor (#264): what join.camp-404.com shows people who want
// to join, written per burn year. Captains only. Preview-but-locked (D3):
// anyone else sees the heading and a CaptainLock, and the page is never read.

// The public pages' face, so the preview reads as the join site does.
const inter = Inter({ subsets: ["latin"], display: "swap" });

export default async function JoinPageEditorPage() {
  const { cleared } = await captainPageGate("captain");
  const page = cleared ? await getJoinPageForEditor() : null;
  const view: JoinPageView | null = page
    ? {
        // A camp that has not said which year it is has no year to name.
        year: page.cycle === UNSET_CYCLE ? null : page.cycle,
        draft: page.draft,
        published: page.published,
        publishedAt: page.publishedAt?.toISOString() ?? null,
        version: page.version,
        startedFrom: page.startedFrom,
      }
    : null;

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Captains / Camp settings / Join page"
        title="Join page"
        description="What join.camp-404.com shows people who want to join the camp. Write it for this year, check the preview, then publish."
      />

      {view ? (
        <JoinPageManager page={view} previewFontClass={inter.className} />
      ) : (
        <CaptainLock message="The join page is captain-only. Your rank doesn't have clearance for this." />
      )}
    </div>
  );
}
