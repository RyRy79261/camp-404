import { LoadsSection } from "@/components/power/loads-section";
import { PowerFrame } from "@/components/power/power-frame";

export const dynamic = "force-dynamic";

export const metadata = { title: "Load list — Camp 404" };

// The load list (#253) inside the Power program's answer rail. Every approved
// member reads it; a captain or a Power & Lighting lead edits it.
export default function PowerLoadsPage() {
  return (
    <PowerFrame section="loads">
      <LoadsSection />
    </PowerFrame>
  );
}
