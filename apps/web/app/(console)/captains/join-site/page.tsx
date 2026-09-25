import { ExternalLink } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { captainPageGate } from "@/lib/captain-gate";
import { getJoinEditorData } from "@/lib/join-site";
import { JoinSiteEditor } from "./join-site-editor";

export const dynamic = "force-dynamic";

export const metadata = { title: "Join site — Camp 404" };

// The words on join.camp-404.com, one card per window (owner, 2026-09-25:
// captains edit, decision 3A). Preview-but-locked like Camp settings: a
// non-captain sees the heading and a lock, and nothing is read for them.

export default async function JoinSitePage() {
  const { cleared } = await captainPageGate("captain");
  const data = cleared ? await getJoinEditorData() : null;

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Captains / Join site"
        title="Join site"
        description="The words on join.camp-404.com. A save shows on the site within a minute."
        actions={
          <Button asChild variant="secondary" size="sm">
            <a
              href="https://join.camp-404.com"
              target="_blank"
              rel="noreferrer"
            >
              Open the site
              <ExternalLink aria-hidden />
            </a>
          </Button>
        }
      />
      {data ? (
        <JoinSiteEditor data={data} />
      ) : (
        <CaptainLock message="The join site is captain-only. Your rank doesn't have clearance for this." />
      )}
    </div>
  );
}
