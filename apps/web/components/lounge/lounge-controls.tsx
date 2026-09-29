"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CalendarPlus,
  Check,
  ClipboardCopy,
  MessageSquareWarning,
  Music,
  Pencil,
  Plus,
  Printer,
  Undo2,
  X,
} from "lucide-react";
import {
  PROGRAMME_DAY_START,
  bandOf,
  bandRange,
  clockText,
  loungeOverlaps,
  outsidePreferences,
} from "@camp404/core";
import {
  LOUNGE_POLICY_MAX,
  LOUNGE_STEP_MINUTES,
  type LoungeBand,
  type LoungeDecision,
  type LoungeOfferStatus,
} from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { ConfirmDialog } from "@camp404/ui/components/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@camp404/ui/components/dialog";
import { Field } from "@camp404/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@camp404/ui/components/select";
import { Spinner } from "@camp404/ui/components/spinner";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import {
  decideOfferAction,
  placeOfferAction,
  removeSlotAction,
  saveMusicPolicyAction,
  withdrawOfferAction,
} from "@/app/(console)/lounge/actions";
import { BAND_NAMES, timeRangeText } from "@/lib/lounge-copy";
import {
  OfferDialog,
  type DayOption,
  type EditableOffer,
} from "./offer-dialog";

// The lounge programme's controls (#269). Laid out as the power list's: a
// button that opens a dialog, and per-row actions where only the control that
// was used spins. A one-tap change on a row reports its failure as a toast; a
// problem with what was typed shows inline in its dialog. The server re-checks
// every write regardless; nothing here is the boundary.

/** Any approved member: offer an activity or a DJ set. */
export function OfferButton({
  days,
  musicPolicy,
}: {
  days: readonly DayOption[];
  musicPolicy: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [round, setRound] = React.useState(0);
  return (
    <>
      <Button
        onClick={() => {
          setRound((n) => n + 1);
          setOpen(true);
        }}
      >
        <Plus aria-hidden />
        Offer something
      </Button>
      <OfferDialog
        key={round}
        open={open}
        onOpenChange={setOpen}
        days={days}
        musicPolicy={musicPolicy}
      />
    </>
  );
}

/** Change or withdraw your own offer. */
export function MyOfferActions({
  offer,
  status,
  placed,
  days,
  musicPolicy,
}: {
  offer: EditableOffer;
  status: LoungeOfferStatus;
  placed: boolean;
  days: readonly DayOption[];
  musicPolicy: string | null;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [withdrawing, startWithdraw] = React.useTransition();
  const editable = status === "offered" || status === "needs_changes";

  function withdraw() {
    startWithdraw(async () => {
      const result = await withdrawOfferAction({ offerId: offer.id });
      setConfirming(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Offer withdrawn");
      router.refresh();
    });
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      {editable && (
        <Button
          variant="outline"
          size="sm"
          disabled={withdrawing}
          onClick={() => setEditOpen(true)}
        >
          <Pencil aria-hidden />
          {status === "needs_changes" ? "Make changes" : "Change"}
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        disabled={withdrawing}
        onClick={() => setConfirming(true)}
      >
        {withdrawing ? (
          <Spinner size="sm" label="Withdrawing…" />
        ) : (
          <Undo2 aria-hidden />
        )}
        Withdraw
      </Button>
      {editable && (
        <OfferDialog
          key={`${offer.id}:${offer.version}`}
          open={editOpen}
          onOpenChange={setEditOpen}
          editing={offer}
          days={days}
          musicPolicy={musicPolicy}
        />
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Withdraw ${offer.title}?`}
        description={
          placed
            ? "It comes off the lounge programme, and the Ministry of Vibes won't see it any more."
            : "The Ministry of Vibes won't see it any more."
        }
        confirmLabel="Withdraw offer"
        destructive
        pending={withdrawing}
        onConfirm={withdraw}
      />
    </span>
  );
}

const DECISION_WORDS: Record<
  Exclude<LoungeDecision, "accepted">,
  { title: string; button: string; help: string; done: string }
> = {
  declined: {
    title: "Decline",
    button: "Decline offer",
    help: "Say why, kindly. The host reads this.",
    done: "Offer declined",
  },
  needs_changes: {
    title: "Ask for changes to",
    button: "Ask for changes",
    help: "Say what to change. The host can change it and send it back.",
    done: "Changes asked for",
  },
};

/** Accept, ask for changes or decline one offer: for the people who run the lounge. */
export function ReviewActions({
  offer,
}: {
  offer: {
    id: string;
    title: string;
    status: LoungeOfferStatus;
    version: number;
    placed: number;
  };
}) {
  const router = useRouter();
  const [accepting, startAccept] = React.useTransition();
  const [asking, setAsking] = React.useState<Exclude<
    LoungeDecision,
    "accepted"
  > | null>(null);
  const [reason, setReason] = React.useState("");
  const [reasonError, setReasonError] = React.useState<string | null>(null);
  const [sending, startSend] = React.useTransition();
  const busy = accepting || sending;

  function accept() {
    startAccept(async () => {
      const result = await decideOfferAction({
        offerId: offer.id,
        decision: "accepted",
        expectedStatus: offer.status,
        expectedVersion: offer.version,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Offer accepted. Place it in the programme next.");
      router.refresh();
    });
  }

  function send() {
    if (!asking) return;
    if (!reason.trim()) {
      setReasonError("Say why, so the host knows what to do.");
      return;
    }
    startSend(async () => {
      const result = await decideOfferAction({
        offerId: offer.id,
        decision: asking,
        expectedStatus: offer.status,
        expectedVersion: offer.version,
        reason,
      });
      if (!result.ok) {
        setReasonError(result.error);
        return;
      }
      toast.success(DECISION_WORDS[asking].done);
      setAsking(null);
      router.refresh();
    });
  }

  function open(decision: Exclude<LoungeDecision, "accepted">) {
    setReason("");
    setReasonError(null);
    setAsking(decision);
  }

  const words = asking ? DECISION_WORDS[asking] : null;
  const reasonId = `reason-${offer.id}`;

  return (
    <span className="flex flex-wrap items-center gap-2">
      {offer.status !== "accepted" && (
        <Button size="sm" disabled={busy} onClick={accept}>
          {accepting ? (
            <Spinner size="sm" label="Accepting…" />
          ) : (
            <Check aria-hidden />
          )}
          Accept
        </Button>
      )}
      {offer.status !== "needs_changes" && (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => open("needs_changes")}
        >
          <MessageSquareWarning aria-hidden />
          Ask for changes
        </Button>
      )}
      {offer.status !== "declined" && (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => open("declined")}
        >
          <X aria-hidden />
          Decline
        </Button>
      )}
      <Dialog
        open={asking !== null}
        onOpenChange={(o) => !o && setAsking(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {words?.title} {offer.title}
            </DialogTitle>
            <DialogDescription>
              {words?.help}
              {offer.status === "accepted" && offer.placed > 0
                ? " It comes off the programme too."
                : ""}
            </DialogDescription>
          </DialogHeader>
          <Field label="Reason" htmlFor={reasonId} error={reasonError}>
            <Textarea
              id={reasonId}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              aria-invalid={reasonError ? true : undefined}
            />
          </Field>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAsking(null)}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button
              variant={asking === "declined" ? "destructive" : "default"}
              onClick={send}
              disabled={sending}
            >
              {sending && <Spinner size="sm" label="Sending…" />}
              {words?.button}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </span>
  );
}

/** Every start time in programme order, from 06:00 to 05:45. */
const START_TIMES = Array.from(
  { length: (24 * 60) / LOUNGE_STEP_MINUTES },
  (_, i) => (PROGRAMME_DAY_START + i * LOUNGE_STEP_MINUTES) % (24 * 60),
);

/** One item already on the programme, as the place dialog checks against it. */
export interface PlacedLite {
  id: string;
  day: number;
  startMinute: number;
  durationMinutes: number;
  title: string;
}

/** Put an accepted offer on the programme at a day and a start time. */
export function PlaceButton({
  offer,
  days,
  placed,
}: {
  offer: {
    id: string;
    title: string;
    durationMinutes: number;
    preferredDays: number[];
    preferredBands: LoungeBand[];
  };
  days: readonly DayOption[];
  placed: readonly PlacedLite[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const firstDay = offer.preferredDays[0] ?? days[0]?.day ?? 1;
  const firstBand = offer.preferredBands[0];
  const [day, setDay] = React.useState(firstDay);
  const [start, setStart] = React.useState(
    firstBand ? bandRange(firstBand).from : 20 * 60,
  );
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const outside = outsidePreferences(offer, { day, startMinute: start });
  const candidate = {
    id: "__new__",
    day,
    startMinute: start,
    durationMinutes: offer.durationMinutes,
    hostId: null,
  };
  const clashIds =
    loungeOverlaps([
      candidate,
      ...placed.map((p) => ({ ...p, hostId: null })),
    ]).get("__new__") ?? [];
  const clashes = placed.filter((p) => clashIds.includes(p.id));

  function place() {
    setError(null);
    startTransition(async () => {
      const result = await placeOfferAction({
        offerId: offer.id,
        day,
        startMinute: start,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`${offer.title} is on the programme`);
      setOpen(false);
      router.refresh();
    });
  }

  const dayId = `place-day-${offer.id}`;
  const startId = `place-start-${offer.id}`;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <CalendarPlus aria-hidden />
        Place
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Place {offer.title}</DialogTitle>
            <DialogDescription>
              Pick a day and a start time. It runs{" "}
              {timeRangeText(start, offer.durationMinutes)}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Day" htmlFor={dayId}>
              <Select
                value={String(day)}
                onValueChange={(v) => setDay(Number(v))}
              >
                <SelectTrigger id={dayId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {days.map((d) => (
                    <SelectItem key={d.day} value={String(d.day)}>
                      {d.short}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="Starts at"
              htmlFor={startId}
              help={BAND_NAMES[bandOf(start)]}
            >
              <Select
                value={String(start)}
                onValueChange={(v) => setStart(Number(v))}
              >
                <SelectTrigger id={startId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {START_TIMES.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {clockText(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          {(outside.day || outside.band || clashes.length > 0) && (
            <ul
              data-testid="place-warnings"
              className="flex flex-col gap-1 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
            >
              {outside.day && <li>The host didn&apos;t tick this day.</li>}
              {outside.band && <li>The host didn&apos;t tick this time.</li>}
              {clashes.map((c) => (
                <li key={c.id}>
                  It overlaps {c.title} (
                  {timeRangeText(c.startMinute, c.durationMinutes)}).
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button onClick={place} disabled={pending}>
              {pending && <Spinner size="sm" label="Placing…" />}
              Put it on the programme
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Take one item off the programme; the offer stays accepted. */
export function RemoveSlotButton({
  slotId,
  title,
}: {
  slotId: string;
  title: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6 shrink-0"
      aria-label={`Take ${title} off the programme`}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await removeSlotAction({ slotId });
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(`${title} is off the programme`);
          router.refresh();
        })
      }
    >
      {pending ? <Spinner size="sm" label="Removing…" /> : <X aria-hidden />}
    </Button>
  );
}

/** The team's music note for DJs: write or change it. */
export function MusicNoteButton({
  policy,
  version,
}: {
  policy: string | null;
  version: number;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState(policy ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveMusicPolicyAction({
        musicPolicy: text,
        expectedVersion: version,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Music note saved");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setText(policy ?? "");
          setError(null);
          setOpen(true);
        }}
      >
        <Music aria-hidden />
        Music note
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Music in the lounge</DialogTitle>
            <DialogDescription>
              What DJs should play. Everyone reads it, and a DJ sees it when
              they offer a set.
            </DialogDescription>
          </DialogHeader>
          <Field
            label="Music note"
            htmlFor="lounge-music-note"
            help={`Up to ${LOUNGE_POLICY_MAX} characters.`}
            error={error}
          >
            <Textarea
              id="lounge-music-note"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
            />
          </Field>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending && <Spinner size="sm" label="Saving…" />}
              Save note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Copies the event guide list as plain text. */
export function CopyGuideButton({ text }: { text: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast.success("List copied");
        } catch {
          toast.error("Couldn't copy. Select the list and copy it instead.");
        }
      }}
    >
      <ClipboardCopy aria-hidden />
      Copy the list
    </Button>
  );
}

/** Opens the browser's print dialog; hidden on paper. */
export function PrintButton() {
  return (
    <Button className="print:hidden" onClick={() => window.print()}>
      <Printer aria-hidden />
      Print
    </Button>
  );
}
