"use client";

import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { CAMP_TIME_ZONE, plainPreview, readRate } from "@camp404/core";
import {
  CheckCircle2,
  Eye,
  Inbox,
  Loader2,
  type LucideIcon,
  Megaphone,
  MessageSquare,
  Pencil,
  Pin,
  PinOff,
  Send,
  Trash2,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import type { AnnouncementPresentation } from "@camp404/types";
import type { AnnouncementSummary, Audience } from "@camp404/db/broadcasts";
import { Alert } from "@camp404/ui/components/alert";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { ConfirmDialog } from "@camp404/ui/components/confirm-dialog";
import { DictatePill } from "@camp404/ui/components/dictate-pill";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { InputField } from "@camp404/ui/components/input-field";
import { Label } from "@camp404/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@camp404/ui/components/select";
import { Switch } from "@camp404/ui/components/switch";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import { cn } from "@camp404/ui/lib/utils";
import {
  MarkdownHint,
  MarkdownPreview,
} from "@/components/announcements/markdown-body";
import { RecorderPanel } from "@/components/voice/recorder-panel";
import { useDictationToggle } from "@/components/voice/use-dictation-toggle";
import { useVoiceSupported } from "@/components/voice/use-voice-recorder";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import {
  deleteDraftAction,
  previewPublishAction,
  publishAction,
  saveDraftAction,
  setPinnedAction,
  updateDraftAction,
} from "./actions";
import { appendTranscript } from "./transcript";

// Captain composer + list, laid out like the AfrikaBurn console's bulletins: the
// drafts and published announcements as cards in the main column, the composer
// in a card beside them. Drafts can be edited / published / deleted, and
// published announcements show their delivery roll-up. Every mutation routes
// through the captain-gated server actions; the page re-renders from the server
// on success.
//
// Feedback follows one rule on every captain screen: a problem with what is
// typed in a form (or a dialog) shows inline beside it; a one-tap action on a
// list row (delete, publish) reports its failure as a toast, and only the
// button that was tapped spins.

const PRESENTATION_META: Record<
  AnnouncementPresentation,
  {
    label: string;
    short: string;
    hint: string;
    icon: LucideIcon;
  }
> = {
  acknowledge: {
    label: "Full-screen — must acknowledge",
    short: "Acknowledge",
    hint: "Takes over each member's screen. They scroll and press Acknowledge to dismiss.",
    icon: Megaphone,
  },
  popup: {
    label: "Pop-up — dismissable",
    short: "Pop-up",
    hint: "Shows once as a pop-up on each member's screen, then stays in their inbox.",
    icon: MessageSquare,
  },
  feed: {
    label: "Quiet — inbox only",
    short: "Inbox",
    hint: "No interruption. Lands behind the header bell.",
    icon: Inbox,
  },
};

/** The console's section label (the AfrikaBurn bulletins list's "Sent"). */
const SECTION_LABEL =
  "font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground";

const dateFmt = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: CAMP_TIME_ZONE,
});

interface FormState {
  /** Draft id being edited, or null when composing a new one. */
  editingId: string | null;
  title: string;
  body: string;
  presentation: AnnouncementPresentation;
  /** The picked audience, as an option value ("everyone" or "team:<key>"). */
  audience: string;
  /** "Keep it at the top" — the second axis beside presentation. */
  pinned: boolean;
}

/** One choice in "Who it's for". The page offers only what the sender may pick. */
export interface AudienceOption {
  value: string;
  label: string;
}

export function audienceValue(audience: Audience): string {
  if (audience.scope === "team") return `team:${audience.team}`;
  return audience.scope;
}

/**
 * Whether an announcement carries the pin mark. A draft holds only the intent
 * (`pinOnPublish`), which publishing turns into a pin; a published one is
 * pinned when `pinnedAt` is set. Reading `pinnedAt` alone would show every
 * marked draft as unmarked, and saving it would then clear the mark.
 */
export function markedPinned(
  a: Pick<AnnouncementSummary, "publishedAt" | "pinnedAt" | "pinOnPublish">,
): boolean {
  return a.publishedAt === null ? a.pinOnPublish : a.pinnedAt !== null;
}

function audienceFromValue(value: string): Audience {
  if (value.startsWith("team:")) {
    return { scope: "team", team: value.slice(5) } as Audience;
  }
  if (value === "team_leads") return { scope: "team_leads" };
  return { scope: "everyone" };
}

export function AnnouncementsManager({
  announcements,
  currentUserId,
  audienceOptions,
  teamLabels,
  leadTeams,
}: {
  announcements: AnnouncementSummary[];
  currentUserId: string;
  /** A captain gets the camp and every active team; a lead their own teams. */
  audienceOptions: AudienceOption[];
  /** Team key to display name, for naming a draft's audience. */
  teamLabels: Record<string, string>;
  /**
   * The teams this viewer leads, or null for a captain (who may address, and
   * so pin to, anything). Decides which published cards offer a pin.
   */
  leadTeams: string[] | null;
}) {
  const router = useRouter();
  const emptyForm: FormState = {
    editingId: null,
    title: "",
    body: "",
    presentation: "acknowledge",
    audience: audienceOptions[0]?.value ?? "everyone",
    pinned: false,
  };
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const dictation = useDictationToggle();
  const voiceSupported = useVoiceSupported();
  const [pending, startTransition] = useTransition();
  // A one-tap action on a draft card: which card, and which button spins.
  const [rowPending, startRowAction] = useTransition();
  const [busy, setBusy] = useState<{ id: string; action: DraftAction } | null>(
    null,
  );
  const composerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const reducedMotion = useReducedMotion();
  // The draft waiting on the publish confirmation, with the audience it would
  // reach. Publishing cannot be taken back, so the captain sees who and how
  // before it goes out.
  const [confirming, setConfirming] = useState<{
    announcement: AnnouncementSummary;
    recipientCount: number;
    error: string | null;
  } | null>(null);
  const [publishing, startPublish] = useTransition();
  // The draft waiting on the delete confirmation. A draft was never sent, but
  // it is a captain's work, and one misclick on Delete used to lose it.
  const [deleting, setDeleting] = useState<AnnouncementSummary | null>(null);

  const drafts = announcements.filter((a) => a.publishedAt === null);
  const published = announcements.filter((a) => a.publishedAt !== null);

  // Pinning authority follows posting authority (owner's call, 2026-09-22), so
  // the screen offers a pin exactly where a send would have been allowed: a
  // captain anywhere, a lead only on a team they still lead. This is the
  // screen's copy of the rule; `setPinnedAction` asks `canSendToAudience`
  // again and the write re-checks the team in its own WHERE.
  const canPin = (audience: Audience) =>
    leadTeams === null ||
    (audience.scope === "team" && leadTeams.includes(audience.team));

  // "the camp" / "the team leads" / "Kitchen", for the cards and the publish
  // confirmation.
  const audienceName = (audience: Audience) =>
    audience.scope === "team"
      ? (teamLabels[audience.team] ?? audience.team)
      : audience.scope === "team_leads"
        ? "the team leads"
        : "the camp";

  const reset = () => {
    setForm(emptyForm);
    setError(null);
    dictation.setDictating(false);
  };

  // Append a dictated transcript to the message body (mirrors the questionnaire
  // LongTextField), so the captain can mix typing and dictation freely.
  function appendToBody(text: string) {
    setForm((f) => ({ ...f, body: appendTranscript(f.body, text, 5000) }));
  }

  const handleSave = () => {
    setError(null);
    const editing = form.editingId;
    const payload = {
      title: form.title,
      body: form.body,
      presentation: form.presentation,
      audience: audienceFromValue(form.audience),
      pinned: form.pinned,
    };
    startTransition(async () => {
      const result = editing
        ? await updateDraftAction(editing, payload)
        : await saveDraftAction(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(editing ? "Draft updated" : "Draft saved");
      reset();
      router.refresh();
    });
  };

  const handleEdit = (a: AnnouncementSummary) => {
    setError(null);
    setForm({
      editingId: a.id,
      title: a.title,
      body: a.body,
      presentation: a.presentation,
      audience: audienceValue(a.audience),
      pinned: markedPinned(a),
    });
  };

  // Edit fills the composer. It sits beside the list on a wide screen and below
  // it on a phone, and either way the card that was tapped can be far from it,
  // so take the captain there.
  const editingId = form.editingId;
  useEffect(() => {
    if (!editingId) return;
    composerRef.current?.scrollIntoView?.({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
    });
    titleRef.current?.focus({ preventScroll: true });
  }, [editingId, reducedMotion]);

  // A delete asks first (the ConfirmDialog below). Once confirmed it is still
  // a one-tap change on a list row: only this card's Delete spins, and a
  // failure is a toast. The dialog closes when the answer is in, as the task
  // board's remove does.
  const confirmDelete = () => {
    const draft = deleting;
    if (!draft) return;
    const { id } = draft;
    setBusy({ id, action: "delete" });
    startRowAction(async () => {
      const result = await deleteDraftAction(id);
      setDeleting(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (form.editingId === id) reset();
      toast.success("Draft deleted");
      router.refresh();
    });
  };

  // A one-tap control on a published card. It reports a failure as a toast and
  // only this card's pin button spins — the same rule delete and publish keep.
  const handlePin = (id: string, pinned: boolean) => {
    setBusy({ id, action: "pin" });
    startRowAction(async () => {
      const result = await setPinnedAction(id, pinned);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(pinned ? "Pinned to the top" : "Unpinned");
      router.refresh();
    });
  };

  const handlePublish = (announcement: AnnouncementSummary) => {
    setBusy({ id: announcement.id, action: "publish" });
    startRowAction(async () => {
      const preview = await previewPublishAction(announcement.audience);
      if (!preview.ok) {
        toast.error(preview.error);
        return;
      }
      setConfirming({
        announcement,
        recipientCount: preview.data.recipientCount,
        error: null,
      });
    });
  };

  const confirmPublish = () => {
    if (!confirming) return;
    const { id } = confirming.announcement;
    startPublish(async () => {
      const result = await publishAction(id);
      if (!result.ok) {
        setConfirming((c) => c && { ...c, error: result.error });
        return;
      }
      setConfirming(null);
      if (form.editingId === id) reset();
      toast.success(`Published to ${members(result.data.recipientCount)}`);
      router.refresh();
    });
  };

  const activeMeta = PRESENTATION_META[form.presentation];

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="flex min-w-0 flex-col gap-8">
        {/* Drafts */}
        <section
          aria-labelledby="announcement-drafts"
          className="flex flex-col gap-3"
        >
          <h2 id="announcement-drafts" className={SECTION_LABEL}>
            {drafts.length > 0 ? `Drafts (${drafts.length})` : "Drafts"}
          </h2>
          {drafts.length === 0 ? (
            <EmptyState
              icon={<Pencil aria-hidden />}
              title="No drafts."
              description="Save one from the composer, then publish it from here."
              className="py-10"
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {drafts.map((a) => (
                <DraftCard
                  key={a.id}
                  announcement={a}
                  audienceName={audienceName(a.audience)}
                  currentUserId={currentUserId}
                  disabled={pending || rowPending || publishing}
                  busyAction={
                    rowPending && busy?.id === a.id ? busy.action : null
                  }
                  onEdit={handleEdit}
                  onDelete={setDeleting}
                  onPublish={handlePublish}
                />
              ))}
            </ul>
          )}
        </section>

        {/* Published */}
        <section
          aria-labelledby="announcement-published"
          className="flex flex-col gap-3"
        >
          <h2 id="announcement-published" className={SECTION_LABEL}>
            {published.length > 0
              ? `Published (${published.length})`
              : "Published"}
          </h2>
          {published.length === 0 ? (
            <EmptyState
              icon={<Megaphone aria-hidden />}
              title="Nothing published yet."
              description="A published announcement shows who it reached and how many have seen it."
              className="py-10"
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {published.map((a) => (
                <PublishedCard
                  key={a.id}
                  announcement={a}
                  audienceName={audienceName(a.audience)}
                  currentUserId={currentUserId}
                  canPin={canPin(a.audience)}
                  disabled={pending || rowPending || publishing}
                  busy={
                    rowPending && busy?.id === a.id && busy.action === "pin"
                  }
                  onPin={handlePin}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Composer */}
      <Card ref={composerRef} className="scroll-mt-24">
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-4">
          <CardTitle className="text-base">
            {form.editingId ? "Edit draft" : "New announcement"}
          </CardTitle>
          {form.editingId && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-my-2"
              onClick={reset}
              disabled={pending}
            >
              <X aria-hidden /> Cancel edit
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <InputField
            label="Title"
            id="announcement-title"
            ref={titleRef}
            value={form.title}
            maxLength={120}
            placeholder="Burn-night briefing"
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            disabled={pending}
          />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="announcement-body">Message</Label>
            <MarkdownHint id="announcement-body-hint" />
            <Textarea
              id="announcement-body"
              value={form.body}
              maxLength={5000}
              rows={6}
              placeholder="What does everyone need to know?"
              aria-describedby="announcement-body-hint"
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              disabled={pending}
            />
            {/* Voice dictation — same pattern as the questionnaire long-text
                fields: tap to swap in the recorder, each transcript appends. */}
            {!voiceSupported ? null : dictation.dictating ? (
              <RecorderPanel
                onTranscript={appendToBody}
                onDismiss={dictation.close}
              />
            ) : (
              <DictatePill
                ref={dictation.pillRef}
                onActivate={dictation.open}
                disabled={pending}
                className="self-end"
              />
            )}
            <MarkdownPreview body={form.body} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="announcement-audience">Who it&apos;s for</Label>
            <Select
              value={form.audience}
              onValueChange={(v) => setForm((f) => ({ ...f, audience: v }))}
              disabled={pending || audienceOptions.length < 2}
            >
              <SelectTrigger id="announcement-audience">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {audienceOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <span className="flex items-center gap-2">
                      <Users className="h-4 w-4" aria-hidden />
                      {option.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="announcement-presentation">How it lands</Label>
            <Select
              value={form.presentation}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  presentation: v as AnnouncementPresentation,
                }))
              }
              disabled={pending}
            >
              <SelectTrigger
                id="announcement-presentation"
                aria-describedby="announcement-presentation-hint"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.keys(PRESENTATION_META) as AnnouncementPresentation[]
                ).map((key) => {
                  const Icon = PRESENTATION_META[key].icon;
                  return (
                    <SelectItem key={key} value={key}>
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4" aria-hidden />
                        {PRESENTATION_META[key].label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <p
              id="announcement-presentation-hint"
              className="text-xs text-muted-foreground"
            >
              {activeMeta.hint}
            </p>
          </div>

          {/* The second axis, from the AfrikaBurn composer's pin row. "How it
              lands" is how loudly it arrives; this is whether it stays. The
              copy says exactly what the pin does and no more — the banner has
              no ✕, and only a captain or the team's lead takes it down. */}
          <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="announcement-pinned">Keep it at the top</Label>
              <p
                id="announcement-pinned-hint"
                className="text-xs text-muted-foreground"
              >
                Separate from how it lands: any of the three can be kept at the
                top. It sits in a banner above every page for the people who got
                it, until you unpin it — they can&apos;t dismiss it.
              </p>
            </div>
            <Switch
              id="announcement-pinned"
              checked={form.pinned}
              onCheckedChange={(pinned) => setForm((f) => ({ ...f, pinned }))}
              aria-describedby="announcement-pinned-hint"
              disabled={pending}
              className="mt-1"
            />
          </div>

          {error && (
            <Alert variant="error">
              <TriangleAlert aria-hidden />
              <span>{error}</span>
            </Alert>
          )}

          <Button
            type="button"
            className="w-full"
            onClick={handleSave}
            disabled={
              pending || rowPending || !form.title.trim() || !form.body.trim()
            }
          >
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {form.editingId ? "Update draft" : "Save draft"}
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !rowPending) setDeleting(null);
        }}
        title="Delete this draft?"
        description={
          deleting
            ? `"${deleting.title}" is deleted. It was never sent, so nobody sees it go.`
            : ""
        }
        confirmLabel="Delete draft"
        destructive
        pending={rowPending && busy?.action === "delete"}
        onConfirm={confirmDelete}
      />
      {confirming && (
        <PublishConfirm
          announcement={confirming.announcement}
          audienceName={audienceName(confirming.announcement.audience)}
          recipientCount={confirming.recipientCount}
          error={confirming.error}
          pending={publishing}
          onCancel={() => setConfirming(null)}
          onConfirm={confirmPublish}
        />
      )}
    </div>
  );
}

type DraftAction = "delete" | "publish" | "pin";

function members(n: number): string {
  return `${n} member${n === 1 ? "" : "s"}`;
}

function PublishConfirm({
  announcement: a,
  audienceName,
  recipientCount,
  error,
  pending,
  onCancel,
  onConfirm,
}: {
  announcement: AnnouncementSummary;
  audienceName: string;
  recipientCount: number;
  error: string | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const meta = PRESENTATION_META[a.presentation];
  const Icon = meta.icon;
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title={`Publish "${a.title}"?`}
      description={
        recipientCount === 0
          ? a.audience.scope === "team"
            ? `No members would get it. Nobody else is on ${audienceName} this year.`
            : a.audience.scope === "team_leads"
              ? "No members would get it. Nobody else leads a team this year."
              : "No members would get it. Nobody else is in the camp yet."
          : `It goes to ${members(recipientCount)}${a.audience.scope === "team" ? ` of ${audienceName}` : a.audience.scope === "team_leads" ? (recipientCount === 1 ? " who leads a team" : " who lead teams") : ""} now. You can't edit or recall it after. To fix a mistake, publish a correction.`
      }
      confirmLabel={`Publish to ${members(recipientCount)}`}
      pending={pending}
      error={error}
      onConfirm={onConfirm}
    >
      <div className="flex items-start gap-3 rounded-md border border-border p-3 text-sm">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        <div className="space-y-0.5">
          <p className="font-medium">{meta.label}</p>
          <p className="text-muted-foreground">{meta.hint}</p>
        </div>
      </div>
    </ConfirmDialog>
  );
}

/**
 * The top of an announcement card, like the AfrikaBurn bulletin card: a kicker
 * naming how it lands, the audience beside it, then the title.
 */
function AnnouncementHeader({
  announcement: a,
  audienceName,
}: {
  announcement: AnnouncementSummary;
  audienceName: string;
}) {
  const meta = PRESENTATION_META[a.presentation];
  const Icon = meta.icon;
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span
          title={meta.hint}
          className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          <Icon className="h-3.5 w-3.5 text-accent" aria-hidden />
          {meta.short}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {/* AfrikaBurn's bulletin card wears the pin in the kicker row. On a
              draft it is the composer's mark: the pin only reaches a screen
              once the announcement is published. */}
          {markedPinned(a) && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
              <Pin className="h-3.5 w-3.5" aria-hidden />
              {a.publishedAt === null ? "Will stay at top" : "Pinned"}
            </span>
          )}
          <Badge variant="outline">
            {a.audience.scope === "team"
              ? audienceName
              : a.audience.scope === "team_leads"
                ? "Team leads"
                : "Everyone"}
          </Badge>
        </div>
      </div>
      <h3 className="text-base font-semibold leading-snug tracking-tight [overflow-wrap:anywhere]">
        {a.title}
      </h3>
    </>
  );
}

/**
 * A card body clipped to three lines, with "Show all" when the text runs past
 * them. A captain can always read the whole of what they wrote: the read page
 * is for recipients, and the author is not one.
 */
const ClampedBody = memo(function ClampedBody({ body }: { body: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [body, expanded]);

  // A card is a glimpse of the message, not the message. The body is
  // markdown; rendering it belongs on the surfaces that show the whole thing.
  //
  // Memoised, and the component itself is memo()'d, because the composer's
  // form state lives in the page above: without this, every keystroke in the
  // composer re-stripped every card on screen.
  const text = useMemo(() => plainPreview(body), [body]);

  return (
    <div className="space-y-1">
      <p
        ref={ref}
        className={cn(
          "whitespace-pre-wrap text-sm text-muted-foreground [overflow-wrap:anywhere]",
          !expanded && "line-clamp-3",
        )}
      >
        {text}
      </p>
      {(overflows || expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="rounded-sm text-xs font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? "Show less" : "Show all"}
        </button>
      )}
    </div>
  );
});

function DraftCard({
  announcement: a,
  audienceName,
  currentUserId,
  disabled,
  busyAction,
  onEdit,
  onDelete,
  onPublish,
}: {
  announcement: AnnouncementSummary;
  audienceName: string;
  currentUserId: string;
  /** Another write is running, so no new one may start. */
  disabled: boolean;
  /** The button on this card whose action is running, if any. */
  busyAction: DraftAction | null;
  onEdit: (a: AnnouncementSummary) => void;
  /** Asks to delete this draft; the manager confirms before it goes. */
  onDelete: (a: AnnouncementSummary) => void;
  onPublish: (a: AnnouncementSummary) => void;
}) {
  // Drafts belong to their author: the server refuses anyone else's edit,
  // delete or publish, so another captain's draft shows who wrote it instead of
  // buttons that can only fail.
  const mine = a.senderId === currentUserId;
  return (
    <li>
      <Card>
        <CardContent className="flex flex-col gap-2 p-4">
          <AnnouncementHeader announcement={a} audienceName={audienceName} />
          <ClampedBody body={a.body} />
          <p className="text-xs text-muted-foreground">
            Draft · not sent · for {audienceName}
            {mine ? "" : ` · by ${a.senderName ?? "another captain"}`}
          </p>
          {mine && (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onEdit(a)}
                disabled={disabled}
              >
                <Pencil aria-hidden /> Edit
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onDelete(a)}
                disabled={disabled}
              >
                <BusyIcon busy={busyAction === "delete"} icon={Trash2} /> Delete
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => onPublish(a)}
                disabled={disabled}
              >
                <BusyIcon busy={busyAction === "publish"} icon={Send} />{" "}
                {a.audience.scope === "team"
                  ? `Publish to ${audienceName}`
                  : a.audience.scope === "team_leads"
                    ? "Publish to team leads"
                    : "Publish to camp"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </li>
  );
}

function BusyIcon({ busy, icon: Icon }: { busy: boolean; icon: LucideIcon }) {
  return busy ? (
    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
  ) : (
    <Icon className="h-4 w-4" aria-hidden />
  );
}

function PublishedCard({
  announcement: a,
  audienceName,
  currentUserId,
  canPin,
  disabled,
  busy,
  onPin,
}: {
  announcement: AnnouncementSummary;
  audienceName: string;
  currentUserId: string;
  /** Whether this viewer may address — and so pin to — this audience. */
  canPin: boolean;
  /** Another write is running, so no new one may start. */
  disabled: boolean;
  /** This card's pin control is the one that is running. */
  busy: boolean;
  onPin: (id: string, pinned: boolean) => void;
}) {
  const pinned = a.pinnedAt !== null;
  // The AfrikaBurn read-rate bar. An acknowledge announcement counts who
  // acknowledged it; the kinds nobody acknowledges count who has seen it.
  const acknowledge = a.presentation === "acknowledge";
  const rate = acknowledge
    ? readRate(a.acknowledgedCount, a.recipientCount)
    : readRate(a.readCount, a.recipientCount);
  const RateIcon = acknowledge ? CheckCircle2 : Eye;
  return (
    <li>
      <Card>
        <CardContent className="flex flex-col gap-2 p-4">
          <AnnouncementHeader announcement={a} audienceName={audienceName} />
          <ClampedBody body={a.body} />
          <p className="text-xs text-muted-foreground">
            {a.publishedAt && (
              <>Published {dateFmt.format(new Date(a.publishedAt))} · </>
            )}
            Sent to {a.recipientCount} member
            {a.recipientCount === 1 ? "" : "s"}
            {a.audience.scope === "team" ? ` of ${audienceName}` : ""}
            {a.senderId === currentUserId ? " · by you" : ""}
          </p>
          <div className="flex flex-col gap-1 pt-1">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1 font-medium text-accent">
                <RateIcon className="h-3.5 w-3.5" aria-hidden />
                {acknowledge
                  ? `${a.acknowledgedCount}/${a.recipientCount} acknowledged`
                  : `${rate.read}/${rate.of} seen`}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {rate.percent}%
              </span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={rate.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={acknowledge ? "Acknowledged" : "Seen"}
            >
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${rate.percent}%` }}
              />
            </div>
          </div>
          {canPin && (
            <div className="flex items-center justify-between gap-2 border-t pt-3">
              <p className="text-xs text-muted-foreground">
                {pinned
                  ? `Sitting at the top of ${a.audience.scope === "team" ? audienceName : "everyone"}’s pages.`
                  : "Not at the top of anyone’s pages."}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onPin(a.id, !pinned)}
                disabled={disabled}
              >
                <BusyIcon busy={busy} icon={pinned ? PinOff : Pin} />{" "}
                {pinned ? "Unpin" : "Pin to top"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </li>
  );
}
