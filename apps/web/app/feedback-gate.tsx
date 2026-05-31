"use client";

import * as React from "react";
import {
  motionPermissionNeeded,
  requestMotionPermission,
  useShakeGesture,
} from "@/components/feedback/use-shake-gesture";
import { ReportBugDialog } from "@/components/feedback/report-bug-dialog";
import { authClient } from "@/lib/auth-client";

/**
 * Mounted once in the root layout (sibling of AcknowledgementGate). Shaking the
 * device opens the bug/feature dialog; shake detection pauses while it's open.
 * Shake is the only trigger (matching RyRy79261/intake-tracker's ShakeToReport).
 *
 * Gated on the LIVE client session: the shake listener is only attached while a
 * user is actually signed in (and detaches immediately on sign-out), so the
 * feature never responds for a logged-out visitor. The server action enforces
 * auth too, as defence in depth.
 */
export function FeedbackGate({ aiAvailable }: { aiAvailable: boolean }) {
  const { data: session, isPending } = authClient.useSession();
  const signedIn = !isPending && !!session;
  const [open, setOpen] = React.useState(false);

  useShakeGesture({ enabled: signedIn && !open, onShake: () => setOpen(true) });

  // iOS 13+ gates devicemotion behind a permission prompt that must be
  // initiated by a user gesture — request it once on the first interaction,
  // only once signed in.
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
    <ReportBugDialog
      open={open}
      onOpenChange={setOpen}
      aiAvailable={aiAvailable}
    />
  );
}
