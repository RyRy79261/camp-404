"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { Spinner } from "@camp404/ui/components/spinner";
import { toast } from "@camp404/ui/components/toast";
import {
  createTelegramLinkAction,
  disconnectTelegramAction,
  setTelegramNoticesAction,
  telegramConnectedAction,
} from "@/app/(console)/profile/telegram-actions";

// The Profile's Telegram card: connect to Ol' Jeb, the camp's bot, so a
// member's notices reach their Telegram (the owner's approved mock-up,
// 2026-10-26: Off, Waiting, On). Telegram lets a bot message only someone who
// opened a chat with it, so Connect opens the member's own one-use link and
// they tap Start there; this card waits for that and then shows On.

export interface TelegramCardProps {
  connected: boolean;
  /** The member's Telegram handle, without "@". */
  handle: string | null;
  notices: "mine" | "all";
  /** The card's id, so the profile checklist can link to it (`#telegram`). */
  id?: string;
}

/** How often the Waiting state checks, and for how long (the link's life). */
const CHECK_EVERY_MS = 3000;
const LINK_LIFE_MS = 10 * 60 * 1000;

export function TelegramCard({
  connected,
  handle,
  notices,
  id,
}: TelegramCardProps) {
  const router = useRouter();
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState<"mine" | "all" | null>(null);
  // The browser blocked the new tab: the member taps the link themselves.
  const [blocked, setBlocked] = useState(false);
  // Shown at once; put back if the save fails.
  const [chosen, setChosen] = useState(notices);
  const waitingSince = useRef(0);

  // Waiting: check until the member has tapped Start, or the link ran out.
  useEffect(() => {
    if (!link || connected) return;
    waitingSince.current = Date.now();
    const timer = window.setInterval(async () => {
      if (Date.now() - waitingSince.current > LINK_LIFE_MS) {
        window.clearInterval(timer);
        setLink(null);
        setError("That link has run out. Press Connect Telegram again.");
        return;
      }
      const result = await telegramConnectedAction();
      if (result.ok && result.data.connected) {
        window.clearInterval(timer);
        setLink(null);
        router.refresh();
      }
    }, CHECK_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [link, connected, router]);

  const connect = () => {
    setError(null);
    // Opened inside the click, so a browser does not block it; the address
    // follows once the link is made.
    const opened = window.open("about:blank", "_blank");
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof createTelegramLinkAction>>;
      try {
        result = await createTelegramLinkAction();
      } catch {
        result = {
          ok: false,
          error: "Something went wrong. Please try again.",
        };
      }
      if (!result.ok) {
        opened?.close();
        setError(result.error);
        return;
      }
      if (opened) opened.location.href = result.data.link;
      setBlocked(!opened);
      setLink(result.data.link);
    });
  };

  const disconnect = () =>
    startTransition(async () => {
      const result = await disconnectTelegramAction();
      if (!result.ok) toast.error(result.error);
      else router.refresh();
    });

  const choose = async (value: "mine" | "all") => {
    if (value === chosen) return;
    const before = chosen;
    setChosen(value);
    setSaving(value);
    const result = await setTelegramNoticesAction(value);
    setSaving(null);
    if (!result.ok) {
      setChosen(before);
      toast.error(result.error);
    }
  };

  const state = connected ? "on" : link ? "waiting" : "off";

  return (
    <Card id={id} className="scroll-mt-4" data-telegram-card={state}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Send className="h-4 w-4 text-accent" aria-hidden />
          Telegram
          {state === "on" && <Badge variant="success">On</Badge>}
          {state === "waiting" && <Badge variant="default">Waiting</Badge>}
          {state === "off" && <Badge variant="outline">Off</Badge>}
        </CardTitle>
        {state === "off" && (
          <CardDescription>
            Get your camp notices from Ol&apos; Jeb, the camp&apos;s Telegram
            bot. You see the same notices as in your inbox.
          </CardDescription>
        )}
        {state === "waiting" && (
          <CardDescription>
            {blocked ? "Tap Open Telegram, then tap" : "Telegram is open. Tap"}{" "}
            <strong className="text-foreground">Start</strong> in your chat with
            Ol&apos; Jeb. This link works for 10 minutes.
          </CardDescription>
        )}
        {state === "on" && (
          <CardDescription>
            Ol&apos; Jeb sends your notices to{" "}
            {handle ? (
              <strong className="text-foreground">@{handle}</strong>
            ) : (
              "your Telegram"
            )}
            .
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {state === "off" && (
          <div>
            <Button size="sm" onClick={connect} disabled={pending}>
              {pending && <Spinner size="sm" label="Making your link…" />}
              Connect Telegram
            </Button>
          </div>
        )}
        {state === "waiting" && link && (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={link} target="_blank" rel="noopener noreferrer">
                {blocked ? "Open Telegram" : "Open Telegram again"}
              </a>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setLink(null)}>
              Cancel
            </Button>
          </div>
        )}
        {state === "on" && (
          <>
            <fieldset className="flex flex-col gap-2">
              <legend className="sr-only">Which notices</legend>
              {(
                [
                  [
                    "mine",
                    "Only notices about me",
                    "(forms I owe, my tasks, my approval)",
                  ],
                  ["all", "All my notices", "(camp announcements too)"],
                ] as const
              ).map(([value, label, hint]) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-start gap-2 text-sm"
                >
                  <input
                    type="radio"
                    name="telegram-notices"
                    value={value}
                    checked={chosen === value}
                    disabled={saving !== null}
                    onChange={() => void choose(value)}
                    className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[var(--color-primary)]"
                  />
                  <span>
                    {label}
                    {hint && (
                      <span className="text-muted-foreground"> {hint}</span>
                    )}
                  </span>
                  {saving === value && <Spinner size="sm" label="Saving…" />}
                </label>
              ))}
            </fieldset>
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={disconnect}
                disabled={pending}
              >
                {pending && <Spinner size="sm" label="Disconnecting…" />}
                Disconnect
              </Button>
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
