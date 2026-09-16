"use client";

import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CAMP_TIME_ZONE } from "@camp404/core";
import {
  CheckCircle2,
  Inbox,
  Loader2,
  type LucideIcon,
  Megaphone,
  MessageSquare,
  Pencil,
  Send,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import type { AnnouncementPresentation } from "@camp404/types";
import type { AnnouncementSummary } from "@camp404/db/broadcasts";
import { Alert } from "@camp404/ui/components/alert";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { Card } from "@camp404/ui/components/card";
import { ConfirmDialog } from "@camp404/ui/components/confirm-dialog";
import { DictatePill } from "@camp404/ui/components/dictate-pill";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { InputField } from "@camp404/ui/components/input-field";
import { Label } from "@camp404/ui/components/label";
import { SectionHeader } from "@camp404/ui/components/section-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@camp404/ui/components/select";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import { cn } from "@camp404/ui/lib/utils";
import { RecorderPanel } from "@/components/voice/recorder-panel";
import { useVoiceSupported } from "@/components/voice/use-voice-recorder";
import {
  deleteDraftAction,
  previewPublishAction,
  publishAction,
  saveDraftAction,
  updateDraftAction,
} from "./actions";
import { appendTranscript } from "./transcript";

// Captain composer + list (board S18). Compose a draft up top; below, drafts can
// be edited / published / deleted and published announcements show their delivery
// roll-up. Every mutation routes through the captain-gated server actions; the
// page re-renders from the server on success. Presentation is composed onto the
// @camp404/ui leaves (Card / InputField / Alert / Badge / SectionHeader /
// EmptyState); all the island logic is unchanged.

const PRESENTATION_META: Record<
  AnnouncementPresentation,
  {
    label: string;
    short: string;
    hint: string;
    icon: LucideIcon;
    badge: "default" | "secondary" | "outline";
    /** Tint override where the board's pill colour has no matching Badge variant. */
    badgeClassName?: string;
  }
> = {
  acknowledge: {
    label: "Full-screen — must acknowledge",
    short: "Acknowledge",
    hint: "Takes over each member's screen. They scroll and press Acknowledge to dismiss.",
    icon: Megaphone,
    badge: "default",
  },
  popup: {
    label: "Pop-up — dismissable",
    short: "Pop-up",
    hint: "Shows once as a pop-up on each member's screen, then stays in their inbox.",
    icon: MessageSquare,
    badge: "secondary",
  },
  feed: {
    label: "Quiet — inbox only",
    short: "Inbox",
    hint: "No interruption. Lands behind the header bell.",
    icon: Inbox,
    // The board tints the inbox pill accent (#00dcff26 + $accent); Badge has no
    // accent variant, so override onto the same accent token used elsewhere.
    badge: "outline",
    badgeClassName: "border-transparent bg-accent/15 text-accent",
  },
};

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
}

const EMPTY_FORM: FormState = {
  editingId: null,
  title: "",
  body: "",
  presentation: "acknowledge",
};

export function AnnouncementsManager({
  announcements,
  currentUserId,
}: {
  announcements: AnnouncementSummary[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [dictating, setDictating] = useState(false);
  const voiceSupported = useVoiceSupported();
  const [pending, startTransition] = useTransition();
  // The draft waiting on the publish confirmation, with the audience it would
  // reach. Publishing cannot be taken back, so the captain sees who and how
  // before it goes out.
  const [confirming, setConfirming] = useState<{
    announcement: AnnouncementSummary;
    recipientCount: number;
    error: string | null;
  } | null>(null);
  const [publishing, startPublish] = useTransition();

  const drafts = announcements.filter((a) => a.publishedAt === null);
  const published = announcements.filter((a) => a.publishedAt !== null);

  const reset = () => {
    setForm(EMPTY_FORM);
    setError(null);
    setDictating(false);
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
    });
  };

  const handleDelete = (id: string) => {
    setError(null);
    startTransition(async () => {
      const result = await deleteDraftAction(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (form.editingId === id) reset();
      toast.success("Draft deleted");
      router.refresh();
    });
  };

  const handlePublish = (announcement: AnnouncementSummary) => {
    setError(null);
    startTransition(async () => {
      const preview = await previewPublishAction();
      if (!preview.ok) {
        setError(preview.error);
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
    <div className="space-y-6">
      {/* Composer */}
      <Card className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">
            {form.editingId ? "Edit draft" : "New announcement"}
          </h2>
          {form.editingId && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={reset}
              disabled={pending}
            >
              <X className="h-4 w-4" /> Cancel edit
            </Button>
          )}
        </div>

        <InputField
          label="Title"
          id="announcement-title"
          value={form.title}
          maxLength={120}
          placeholder="Burn-night briefing"
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          disabled={pending}
        />

        <div className="flex flex-col gap-2">
          <Label htmlFor="announcement-body">Message</Label>
          <Textarea
            id="announcement-body"
            value={form.body}
            maxLength={5000}
            rows={6}
            placeholder="What does everyone need to know?"
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            disabled={pending}
          />
          {/* Voice dictation — same pattern as the questionnaire long-text
              fields: tap to swap in the recorder, each transcript appends. */}
          {!voiceSupported ? null : dictating ? (
            <RecorderPanel
              onTranscript={appendToBody}
              onDismiss={() => setDictating(false)}
            />
          ) : (
            <DictatePill
              onActivate={() => setDictating(true)}
              disabled={pending}
              className="self-end"
            />
          )}
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
            <SelectTrigger id="announcement-presentation">
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
          <p className="text-xs text-muted-foreground">{activeMeta.hint}</p>
        </div>

        {error && (
          <Alert variant="error">
            <TriangleAlert aria-hidden />
            <span>{error}</span>
          </Alert>
        )}

        <Button
          type="button"
          className="w-full gap-1.5"
          onClick={handleSave}
          disabled={pending || !form.title.trim() || !form.body.trim()}
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {form.editingId ? "Update draft" : "Save draft"}
        </Button>
      </Card>

      {/* Drafts */}
      <section className="space-y-3">
        <SectionHeader
          as="h2"
          title={drafts.length > 0 ? `Drafts (${drafts.length})` : "Drafts"}
        />
        {drafts.length === 0 ? (
          <EmptyState title="No drafts." />
        ) : (
          <ul className="space-y-3">
            {drafts.map((a) => (
              <DraftCard
                key={a.id}
                announcement={a}
                pending={pending}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onPublish={handlePublish}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Published */}
      <section className="space-y-3">
        <SectionHeader
          as="h2"
          title={
            published.length > 0
              ? `Published (${published.length})`
              : "Published"
          }
        />
        {published.length === 0 ? (
          <EmptyState title="Nothing published yet." />
        ) : (
          <ul className="space-y-3">
            {published.map((a) => (
              <PublishedCard
                key={a.id}
                announcement={a}
                currentUserId={currentUserId}
              />
            ))}
          </ul>
        )}
      </section>

      {confirming && (
        <PublishConfirm
          announcement={confirming.announcement}
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

function members(n: number): string {
  return `${n} member${n === 1 ? "" : "s"}`;
}

function PublishConfirm({
  announcement: a,
  recipientCount,
  error,
  pending,
  onCancel,
  onConfirm,
}: {
  announcement: AnnouncementSummary;
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
          ? "No members would get it. Nobody else is in the camp yet."
          : `It goes to ${members(recipientCount)} now. You can't edit or recall it after. To fix a mistake, publish a correction.`
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

function AnnouncementHeader({
  announcement: a,
}: {
  announcement: AnnouncementSummary;
}) {
  const meta = PRESENTATION_META[a.presentation];
  const Icon = meta.icon;
  return (
    <div className="flex items-start justify-between gap-3">
      <h3 className="text-base font-bold leading-tight">{a.title}</h3>
      <Badge
        variant={meta.badge}
        title={meta.hint}
        className={cn("shrink-0", meta.badgeClassName)}
      >
        <Icon className="h-3 w-3" aria-hidden />
        {meta.short}
      </Badge>
    </div>
  );
}

/**
 * A card body clipped to three lines, with "Show all" when the text runs past
 * them. A captain can always read the whole of what they wrote: the read page
 * is for recipients, and the author is not one.
 */
function ClampedBody({ body }: { body: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [body, expanded]);

  return (
    <div className="space-y-1">
      <p
        ref={ref}
        className={cn(
          "whitespace-pre-wrap text-sm text-muted-foreground [overflow-wrap:anywhere]",
          !expanded && "line-clamp-3",
        )}
      >
        {body}
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
}

function DraftCard({
  announcement: a,
  pending,
  onEdit,
  onDelete,
  onPublish,
}: {
  announcement: AnnouncementSummary;
  pending: boolean;
  onEdit: (a: AnnouncementSummary) => void;
  onDelete: (id: string) => void;
  onPublish: (a: AnnouncementSummary) => void;
}) {
  return (
    <li>
      <Card className="space-y-3 p-4">
        <AnnouncementHeader announcement={a} />
        <ClampedBody body={a.body} />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => onEdit(a)}
            disabled={pending}
          >
            <Pencil className="h-4 w-4" /> Edit
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onDelete(a.id)}
            disabled={pending}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            onClick={() => onPublish(a)}
            disabled={pending}
          >
            <Send className="h-4 w-4" /> Publish to camp
          </Button>
        </div>
      </Card>
    </li>
  );
}

function PublishedCard({
  announcement: a,
  currentUserId,
}: {
  announcement: AnnouncementSummary;
  currentUserId: string;
}) {
  return (
    <li>
      <Card className="space-y-3 p-4">
        <AnnouncementHeader announcement={a} />
        <ClampedBody body={a.body} />
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
          <span className="text-muted-foreground">
            Sent to {a.recipientCount} member
            {a.recipientCount === 1 ? "" : "s"}
            {a.senderId === currentUserId ? " · by you" : ""}
          </span>
          {a.presentation === "acknowledge" && (
            <span className="inline-flex items-center gap-1 font-medium text-accent">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              {a.acknowledgedCount}/{a.recipientCount} acknowledged
            </span>
          )}
        </div>
        {a.publishedAt && (
          <p className="text-[11px] text-muted-foreground">
            Published {dateFmt.format(new Date(a.publishedAt))}
          </p>
        )}
      </Card>
    </li>
  );
}
