"use client";

import { useState, useTransition } from "react";
import { KeyRound, Lock } from "lucide-react";
import { CAMP_TIME_ZONE } from "@camp404/core";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { ConfirmDialog } from "@camp404/ui/components/confirm-dialog";
import { toast } from "@camp404/ui/components/toast";
import { sendPasswordResetLinkAction } from "./actions";
import { maskEmail } from "./reset-copy";

// The member panel's "Sign-in" card (owner's mock-up, step 7, 2026-10-27): a
// captain emails a member Better Auth's own reset link. Confirm first, then
// "Sent" with the time, "Send another", and a toast. The server gates,
// limits and audits every send.

const timeFmt = new Intl.DateTimeFormat("en-ZA", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: CAMP_TIME_ZONE,
});

export function PasswordResetCard({
  userId,
  name,
  email,
}: {
  userId: string;
  /** The member's display name, for the dialog and the toast. */
  name: string;
  /** Their sign-in email, shown masked in the dialog; null when unknown. */
  email: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<Date | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    setError(null);
    startTransition(async () => {
      const result = await sendPasswordResetLinkAction(userId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSentAt(new Date(result.sentAt));
      setOpen(false);
      toast.success(`Reset link sent to ${name}.`);
    });
  }

  function ask() {
    setError(null);
    setOpen(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sign-in</CardTitle>
        <CardDescription>
          Can&apos;t get in? Email them a link to set a new password.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {sentAt ? (
          <div className="flex flex-col items-start gap-1">
            <p className="text-sm">
              <Badge variant="success">Sent</Badge> Today at{" "}
              {timeFmt.format(sentAt)}. The link works for 1 hour.
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="px-0"
              onClick={ask}
            >
              Send another
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={ask}
          >
            <KeyRound aria-hidden />
            Send password reset link
          </Button>
        )}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock aria-hidden className="h-3.5 w-3.5 shrink-0" />
          Every link sent is logged to the audit trail.
        </p>
      </CardContent>
      <ConfirmDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setError(null);
        }}
        title={`Send ${name} a password reset link?`}
        description={`We email a link to ${email ? maskEmail(email) : "the address they sign in with"}. It works for 1 hour. Their password keeps working until they set a new one, and you never see it.`}
        confirmLabel="Send link"
        pending={pending}
        error={error}
        onConfirm={send}
      />
    </Card>
  );
}
