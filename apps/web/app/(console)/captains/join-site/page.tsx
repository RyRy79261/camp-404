import { Eye } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { captainPageGate } from "@/lib/captain-gate";
import { getJoinEditorData } from "@/lib/join-site";
import { JoinSiteEditor } from "./join-site-editor";

export const dynamic = "force-dynamic";

export const metadata = { title: "Join site — Camp 404" };

// The words on About Camp 404 and join.camp-404.com (owner, 2026-09-25:
// captains edit, decision 3A), one section at a time with one Save (approved
// redesign, 2026-10-01). Preview-but-locked like Camp settings: a non-captain
// sees the heading and a lock, and nothing is read for them.

export default async function JoinSitePage() {
  const { cleared } = await captainPageGate("captain");
  const data = cleared ? await getJoinEditorData() : null;

  return (
    // On a phone an open section is its own screen ("All sections" goes
    // back), so the page heading steps aside for it.
    <div className="group/join flex flex-col">
      <div className="group-has-[[data-join-open]]/join:hidden page-md:block!">
        <PageHeading
          eyebrow="Captains / Join site"
          title="Join site"
          description="The words on About and on join.camp-404.com. Both show the same words."
          actions={
            <Button asChild variant="outline" size="sm">
              <a
                href="https://join.camp-404.com"
                target="_blank"
                rel="noreferrer"
              >
                <Eye aria-hidden />
                Open join.camp-404.com
              </a>
            </Button>
          }
        />
      </div>
      {data ? (
        <JoinSiteEditor data={data} />
      ) : (
        <CaptainLock message="The join site is captain-only. Your rank doesn't have clearance for this." />
      )}
    </div>
  );
}
