"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Hash, Megaphone, Send } from "lucide-react";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { Checkbox } from "@camp404/ui/components/checkbox";
import { RowActions } from "@camp404/ui/components/row-actions";
import { Spinner } from "@camp404/ui/components/spinner";
import { toast } from "@camp404/ui/components/toast";
import {
  removeTelegramPlaceAction,
  setTelegramPostsAction,
} from "@/app/(console)/captains/camp-settings/telegram-actions";

// Camp settings' Ol' Jeb card (the owner's approved mock-up, 2026-10-26): the
// chats Ol' Jeb posts camp news in, each with Remove, the three ticks for what
// he posts, and how to add a chat (`/notifyhere`, sent in the chat or topic by
// a captain who connected him). Captains only; the page draws it only when
// the bot is set up.

export interface OlJebPlace {
  id: string;
  title: string;
  /** A forum topic in a supergroup, rather than the whole chat. */
  topic: boolean;
}

export interface OlJebPosts {
  announcements: boolean;
  reminders: boolean;
  meetings: boolean;
}

export interface OlJebCardProps {
  places: OlJebPlace[];
  posts: OlJebPosts;
  /** The bot's username, without "@". */
  bot: string;
}

const TICKS: { key: keyof OlJebPosts; label: string }[] = [
  {
    key: "announcements",
    label: "Announcements (when you tick “Also post in Telegram”)",
  },
  {
    key: "reminders",
    label: "Questionnaire reminders, tagging who still has to answer",
  },
  { key: "meetings", label: "New meetings in the Calendar" },
];

export function OlJebCard({ places, posts, bot }: OlJebCardProps) {
  const router = useRouter();
  // Shown at once; put back if the save fails.
  const [ticks, setTicks] = useState(posts);
  const [saving, setSaving] = useState<keyof OlJebPosts | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const tick = async (key: keyof OlJebPosts, on: boolean) => {
    const before = ticks;
    const next = { ...ticks, [key]: on };
    setTicks(next);
    setSaving(key);
    const result = await setTelegramPostsAction(next);
    setSaving(null);
    if (!result.ok) {
      setTicks(before);
      toast.error(result.error);
    }
  };

  const remove = async (place: OlJebPlace) => {
    setRemoving(place.id);
    const result = await removeTelegramPlaceAction(place.id);
    setRemoving(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Ol' Jeb stopped posting in ${place.title}`);
    router.refresh();
  };

  return (
    <Card data-ol-jeb-card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Send className="h-4 w-4 text-accent" aria-hidden />
          Ol&apos; Jeb
          {places.length > 0 ? (
            <Badge variant="success">On</Badge>
          ) : (
            <Badge variant="outline">No chats yet</Badge>
          )}
        </CardTitle>
        <CardDescription>
          {places.length > 0
            ? "Ol' Jeb posts camp news in these chats:"
            : "Ol' Jeb, the camp's Telegram bot, does not post in any chat yet."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {places.length > 0 && (
          <ul
            className="flex flex-col gap-2"
            aria-label="Chats Ol' Jeb posts in"
          >
            {places.map((place) => (
              <li
                key={place.id}
                data-ol-jeb-place
                className="flex items-center justify-between gap-3 border border-border px-3 py-2 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {place.topic ? (
                    <Hash
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  ) : (
                    <Megaphone
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  )}
                  <span className="truncate" title={place.title}>
                    {place.title}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {place.topic ? "topic" : "group"}
                  </span>
                </span>
                <RowActions
                  label={`Actions for ${place.title}`}
                  primary={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={removing !== null}
                      onClick={() => void remove(place)}
                    >
                      {removing === place.id && <Spinner aria-hidden />}
                      Remove
                    </Button>
                  }
                />
              </li>
            ))}
          </ul>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold text-foreground">
            What he posts there
          </legend>
          {TICKS.map(({ key, label }) => (
            <label
              key={key}
              className="flex cursor-pointer items-start gap-2 text-sm"
            >
              <Checkbox
                checked={ticks[key]}
                disabled={saving !== null}
                onCheckedChange={(on) => void tick(key, on === true)}
                className="mt-0.5"
              />
              <span>{label}</span>
              {saving === key && <Spinner aria-hidden className="mt-0.5" />}
            </label>
          ))}
        </fieldset>

        <p className="border-l-2 border-accent pl-3 text-xs text-muted-foreground">
          To add a chat: add @{bot} to the group, then send{" "}
          <strong className="text-foreground">/notifyhere@{bot}</strong> in it
          (or in the topic). Only a captain who connected Telegram on their
          Profile can do this.
        </p>
      </CardContent>
    </Card>
  );
}
