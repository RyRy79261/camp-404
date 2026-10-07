import { PageHeading } from "@camp404/ui/components/page-heading";
import { ProfileSections } from "@/components/profile/profile-sections";
import { getMyDesktopPreferences } from "@/lib/desktop-preferences";
import { requireMemberPage } from "@/lib/member-gate";
import { getVoiceConsent } from "@/lib/voice/consent";
import { VoiceSetting } from "@/components/voice/voice-setting";
import { DisplaySettings } from "./display-settings";

export const dynamic = "force-dynamic";

export const metadata = { title: "Display — Camp 404" };

// How the desktop looks for this member (issue #290): the system theme,
// "Bigger text", "Effects off" and "Open with one click", kept on the server
// with their desktop, so the choice follows them to every device. The same
// controls are the welcome wizard's "How it looks" step, which can be opened
// again from here.

export default async function DisplayPage() {
  const { campUser } = await requireMemberPage();
  const preferences = await getMyDesktopPreferences();
  // Voice (#356) is a captain's to turn on. Anyone who still has it on (a
  // captain since demoted) sees the switch too, to turn it off.
  const captain = campUser.rank === "captain";
  const consented = (await getVoiceConsent(campUser.id)) !== null;
  const voice = captain || consented ? { on: consented, captain } : null;
  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Your account / Display"
        title="Display"
        description="How your desktop looks on every device you use: its colours, the size of its text, and its moving extras."
      />
      <div className="flex flex-col gap-6">
        <ProfileSections active="display" />
        <DisplaySettings initial={preferences} />
        {voice && <VoiceSetting on={voice.on} canTurnOn={voice.captain} />}
      </div>
    </div>
  );
}
