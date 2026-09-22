"use client";

import * as React from "react";
import {
  motionPermissionNeeded,
  requestMotionPermission,
  useShakeGesture,
} from "@/components/feedback/use-shake-gesture";
import { ReportBugDialog } from "@/components/feedback/report-bug-dialog";
import {
  REPORT_PROBLEM_EVENT,
  type ReportProblemRequest,
} from "@/components/feedback/report-problem";
import { authClient } from "@/lib/auth-client";
import { installClientErrorCapture } from "@/lib/client-errors";
import type { FeedbackKind } from "@/lib/github-feedback";

/**
 * Mounted once in the root layout (sibling of AcknowledgementGate). Shaking the
 * device opens the bug/feature dialog; shake detection pauses while it's open.
 * The "Report a problem" item on /profile and the error page's Report button
 * open it too, through openReportProblem (owner's call, 2026-09-16: shake is
 * not the only way, but there is no floating button).
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
  const [prefill, setPrefill] = React.useState("");
  const [kind, setKind] = React.useState<FeedbackKind>("bug");

  // Recent errors are kept from the first render, so a report made after
  // something broke can attach what happened before it.
  React.useEffect(() => installClientErrorCapture(), []);

  useShakeGesture({
    enabled: signedIn && !open,
    onShake: () => {
      setPrefill("");
      setKind("bug");
      setOpen(true);
    },
  });

  React.useEffect(() => {
    if (!signedIn) return;
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<ReportProblemRequest>).detail;
      setPrefill(detail?.description ?? "");
      setKind(detail?.kind ?? "bug");
      setOpen(true);
    };
    window.addEventListener(REPORT_PROBLEM_EVENT, onRequest);
    return () => window.removeEventListener(REPORT_PROBLEM_EVENT, onRequest);
  }, [signedIn]);

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
      defaultKind={kind}
      defaultDescription={prefill}
    />
  );
}
