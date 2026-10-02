import { LoadsSection } from "@/components/power/loads-section";
import { PowerFrame } from "@/components/power/power-frame";

export const dynamic = "force-dynamic";

export const metadata = { title: "Power — Camp 404" };

// The Power program's home (the owner's approved redesign, option B, the
// "answer rail", 2026-10-01). On a phone the rail is the home list: each
// section's answer, a tap to open it. In a wide window the rail sits beside
// the load list, where the power plan starts.
export default function PowerPage() {
  return (
    <PowerFrame section="loads" home>
      <LoadsSection />
    </PowerFrame>
  );
}
