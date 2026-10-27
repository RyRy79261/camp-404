"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Users } from "lucide-react";
import {
  FEE_TELEGRAM_BODY,
  FEE_TELEGRAM_TITLE,
  formatMoney,
  REMINDERS_NEED_COLLECTING,
  type NextFeePayment,
} from "@camp404/core";
import { Button } from "@camp404/ui/components/button";
import { AckRow } from "@camp404/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@camp404/ui/components/dialog";
import { toast } from "@camp404/ui/components/toast";
import { NotComingNote } from "@/components/audience-reach";
import { shortDay } from "@/lib/camp-money-view";
import {
  askForPledgesAction,
  remindFeesOwedAction,
} from "../camp-money-actions";

// "Ask everyone to pledge" (outlined) and "Remind who still owes" (the main
// button), each with a dialog that says who it reaches before anything goes
// (mock-up step 2): the people and their own next payment, who is left out
// for saying Not coming this year (with "Who?"), who asked for a subsidy and
// is not reminded, and the tick for a general Telegram post that names
// nobody. The server works the audience out again when it sends.

export interface ReminderPreview {
  collecting: boolean;
  remind: {
    reach: {
      userId: string;
      name: string;
      next: NextFeePayment;
      owingCents: number;
      telegram: boolean;
    }[];
    notComing: string[];
    subsidy: string[];
  };
  ask: { reach: { userId: string; name: string }[]; notComing: string[] };
  telegramPlaces: number;
}

/** How many people, in words: "1 member", "7 members". */
function members(n: number): string {
  return n === 1 ? "1 member" : `${n} members`;
}

/** "Lerato, Sam and Thabo". */
function names(list: readonly string[]): string {
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
}

/** What a person's next payment is, in the dialog's short words. */
function nextWords(next: NextFeePayment, owingCents: number): string {
  switch (next.kind) {
    case "due":
      return `${formatMoney(next.amountCents)} by ${shortDay(next.dueOn)}`;
    case "no_date":
      return `${formatMoney(next.amountCents)}, no date yet`;
    default:
      return `${formatMoney(owingCents)} to pay`;
  }
}

/**
 * "Reaches N people who still owe. Left out: M who said Not coming this year.
 * Who?" The left-out half is the send screens' own (components/audience-reach),
 * so every send says it the same way. The Finance team reads participation
 * (a Finance lead is a team lead), so the names come with it.
 */
function AudienceLine({
  reach,
  notComing,
}: {
  reach: string;
  notComing: readonly string[];
}) {
  return (
    <p className="flex items-start gap-2 text-sm">
      <Users className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>
        {reach}
        <NotComingNote
          notComing={{ count: notComing.length, names: [...notComing] }}
        />
      </span>
    </p>
  );
}

const SHOWN = 4;

export function FeeReminderButtons({ preview }: { preview: ReminderPreview }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"ask" | "remind" | null>(null);
  const [post, setPost] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const reach = preview.remind.reach;
  const connected = reach.filter((p) => p.telegram).length;
  const asked = preview.ask.reach;

  function openDialog(which: "ask" | "remind") {
    setError(null);
    setPost(true);
    setDialog(which);
  }

  function send() {
    setError(null);
    start(async () => {
      if (dialog === "ask") {
        const res = await askForPledgesAction();
        if (!res.ok) {
          setError(res.error);
          return;
        }
        toast.success(`Asked ${members(res.data.asked)} to pledge`);
      } else {
        const res = await remindFeesOwedAction({
          postInTelegram: post && preview.telegramPlaces > 0,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        toast.success(`Reminded ${members(res.data.reminded)}`);
      }
      setDialog(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" onClick={() => openDialog("ask")}>
        Ask everyone to pledge
      </Button>
      <Button type="button" onClick={() => openDialog("remind")}>
        Remind who still owes
      </Button>

      <Dialog
        open={dialog !== null}
        onOpenChange={(o) => (pending || o ? null : setDialog(null))}
      >
        {dialog === "remind" ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {reach.length === 0
                  ? "Nobody owes money right now"
                  : reach.length === 1
                    ? "Remind 1 member who still owes?"
                    : `Remind ${reach.length} members who still owe?`}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Who the reminder reaches, and what each one is told.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <AudienceLine
                reach={`Reaches ${reach.length === 1 ? "1 person" : `${reach.length} people`} who still owe.`}
                notComing={preview.remind.notComing}
              />
              {reach.length > 0 && (
                <ul
                  aria-label="Who is reminded"
                  className="grid gap-2 page-sm:grid-cols-2"
                >
                  {reach.slice(0, SHOWN).map((p) => (
                    <li
                      key={p.userId}
                      className="rounded-md border border-border p-2 text-sm"
                    >
                      <span className="block font-medium">{p.name}</span>
                      <span className="block text-xs tabular-nums text-muted-foreground">
                        {nextWords(p.next, p.owingCents)}
                        {p.telegram ? " · Ol' Jeb" : ""}
                      </span>
                    </li>
                  ))}
                  {reach.length > SHOWN && (
                    <li className="rounded-md border border-border p-2 text-sm text-muted-foreground">
                      + {reach.length - SHOWN} more (
                      {names(reach.slice(SHOWN).map((p) => p.name))})
                    </li>
                  )}
                </ul>
              )}
              <p className="text-sm">
                Each one gets a notice about <b>their own</b> next payment: in
                their inbox, by push and email, and as a private message from
                Ol&rsquo; Jeb if they connected Telegram ({connected} of{" "}
                {reach.length}).
                {preview.remind.subsidy.length > 0 &&
                  ` ${names(preview.remind.subsidy)} asked for a subsidy, so ${
                    preview.remind.subsidy.length === 1 ? "is" : "are"
                  } not reminded.`}
              </p>
              {preview.telegramPlaces > 0 && (
                <AckRow
                  checked={post}
                  onCheckedChange={(v) => setPost(v === true)}
                  disabled={pending}
                >
                  Also post a general reminder in Telegram
                  <span className="block text-xs text-muted-foreground">
                    &ldquo;{FEE_TELEGRAM_TITLE}. {FEE_TELEGRAM_BODY}&rdquo;
                    Nobody is named and no amounts are shown.
                  </span>
                </AckRow>
              )}
              {!preview.collecting && (
                <p className="text-sm text-muted-foreground">
                  {REMINDERS_NEED_COLLECTING}
                </p>
              )}
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
            <DialogFooter className="flex-row justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setDialog(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={pending || reach.length === 0 || !preview.collecting}
                onClick={send}
              >
                {pending && <Loader2 className="animate-spin" aria-hidden />}
                {reach.length === 1
                  ? "Send 1 reminder"
                  : `Send ${reach.length} reminders`}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : dialog === "ask" ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {asked.length === 0
                  ? "Everyone has pledged"
                  : `Ask ${members(asked.length)} to pledge?`}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Who the ask reaches.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <AudienceLine
                reach={`Reaches ${asked.length === 1 ? "1 person" : `${asked.length} people`} who have not pledged yet.`}
                notComing={preview.ask.notComing}
              />
              {asked.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {names(asked.map((p) => p.name))}
                </p>
              )}
              <p className="text-sm">
                Each one gets a notice asking what they can put in and by when:
                in their inbox, by push and email, and from Ol&rsquo; Jeb if
                they connected Telegram. Asking again reaches only who still has
                not pledged.
              </p>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
            <DialogFooter className="flex-row justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setDialog(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={pending || asked.length === 0}
                onClick={send}
              >
                {pending && <Loader2 className="animate-spin" aria-hidden />}
                {`Ask ${members(asked.length)}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
