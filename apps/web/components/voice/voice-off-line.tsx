"use client";

import { useState, useTransition } from "react";
import { Button } from "@camp404/ui/components/button";
import { setVoiceOn } from "@/app/(console)/voice-actions";

/**
 * Voice's off switch on a page that holds the app (a required questionnaire,
 * the burner profile): someone held there cannot reach Display, where the
 * switch lives, and a consent they cannot withdraw is not one (POPIA). Shown
 * only while voice is on; it can only turn voice off. The rest of the app
 * stays held.
 */
export function VoiceOffLine() {
  const [off, setOff] = useState(false);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();
  if (off) {
    return (
      <p role="status" className="text-center text-xs text-muted-foreground">
        Voice is off.
      </p>
    );
  }
  return (
    <div
      data-voice-off
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs text-muted-foreground"
    >
      <span>Voice is on for your account.</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await setVoiceOn(false).catch(() => ({ ok: false }));
            setError(!res.ok);
            if (res.ok) setOff(true);
          })
        }
      >
        Turn voice off
      </Button>
      {error && (
        <span role="alert" className="basis-full text-destructive">
          That didn&apos;t save. Try again.
        </span>
      )}
    </div>
  );
}
