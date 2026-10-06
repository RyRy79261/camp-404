"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { setVoiceOn } from "@/app/(console)/voice-actions";

const NOTICE =
  "Your voice is sent to Groq to become words, and the words to Anthropic's Claude to work out what you mean. Neither is kept here. Nothing is saved until you press Do.";

/**
 * A captain's voice switch on the Display page (#356): the one-time notice,
 * and where it is withdrawn. Turning it off clears users.voice_consent_at;
 * the mic asks again before the next recording.
 */
export function VoiceSetting({ on }: { on: boolean }) {
  const [enabled, setEnabled] = useState(on);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <Card data-voice-setting>
      <CardHeader>
        <CardTitle>Voice</CardTitle>
        <CardDescription>
          Captains only. Speak up to five things to do from the mic under Today;
          nothing changes until you tick them and press Do.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{NOTICE}</p>
        <p className="text-sm font-semibold" role="status">
          {enabled ? "Voice is on." : "Voice is off."}
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div>
          <Button
            variant={enabled ? "outline" : "default"}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await setVoiceOn(!enabled);
                if (!res.ok) {
                  setError("That didn't save. Try again.");
                  return;
                }
                setError(null);
                setEnabled(!enabled);
                router.refresh();
              })
            }
          >
            {enabled ? "Turn voice off" : "Turn on voice"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
