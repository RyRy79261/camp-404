"use client";

import * as React from "react";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import {
  motionPermissionNeeded,
  requestMotionPermission,
  useShakeGesture,
} from "@/components/feedback/use-shake-gesture";
import { ReportBugDialog } from "@/components/feedback/report-bug-dialog";

/**
 * Mounted once in the root layout (sibling of AcknowledgementGate). Shaking the
 * device — or tapping the always-present report button — opens the bug/feature
 * dialog. Shake detection pauses while the dialog is open. The button is the
 * non-shake path for desktop/keyboard users and the deterministic e2e trigger.
 *
 * `signedIn` is computed by the (server) root layout via getAuthenticatedUser —
 * which is test-cookie-aware, unlike a client useSession() — so the gate is
 * absent on the public landing / sign-in pages (mirrors AcknowledgementGate,
 * which renders nothing when signed out) and still works under E2E test mode.
 */
export function FeedbackGate({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = React.useState(false);

  useShakeGesture({ enabled: signedIn && !open, onShake: () => setOpen(true) });

  // iOS 13+ gates devicemotion behind a permission prompt that must be
  // initiated by a user gesture — request it once on the first interaction.
  React.useEffect(() => {
    if (!signedIn || !motionPermissionNeeded()) return;
    const onFirstGesture = () => {
      void requestMotionPermission();
    };
    window.addEventListener("pointerdown", onFirstGesture, { once: true });
    return () => window.removeEventListener("pointerdown", onFirstGesture);
  }, [signedIn]);

  if (!signedIn) return null;

  return (
    <>
      <Button
        type="button"
        size="icon"
        aria-label="Report a bug or request a feature"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 h-12 w-12 rounded-full shadow-lg"
      >
        <MessageSquarePlus className="h-5 w-5" />
      </Button>
      <ReportBugDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
