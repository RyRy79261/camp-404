"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCircle2,
  Loader2,
  Megaphone,
  MessageSquare,
  Pencil,
  Send,
  Trash2,
  X,
} from "lucide-react";
import type { AnnouncementPresentation } from "@camp404/types";
import type { AnnouncementSummary } from "@camp404/db/broadcasts";
import { Button } from "@camp404/ui/components/button";
import { Input } from "@camp404/ui/components/input";
import { Textarea } from "@camp404/ui/components/textarea";
import { Label } from "@camp404/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@camp404/ui/components/select";
import { cn } from "@camp404/ui/lib/utils";
import {
  deleteDraftAction,
  publishAction,
  saveDraftAction,
  updateDraftAction,
} from "./actions";

// Captain composer + list. Compose a draft up top; below, drafts can be
// edited / published / deleted and published announcements show their
// delivery roll-up. Every mutation routes through the captain-gated server
// actions; the page re-renders from the server on success.

const PRESENTATION_META: Record<
  AnnouncementPresentation,
  { label: string; hint: string; icon: React.ReactNode }
> = {
  acknowledge: {
    label: "Full-screen — must acknowledge",
    hint: "Takes over each member's screen. They scroll and press Acknowledge to dismiss.",
    icon: <Megaphone className="h-4 w-4" aria-hidden />,
  },
  popup: {
    label: "Pop-up — dismissable",
    hint: "A transient pop-up. No acknowledgement required.",
    icon: <MessageSquare className="h-4 w-4" aria-hidden />,
  },
  feed: {
    label: "Quiet — inbox only",
    hint: "No interruption. Lands behind the header bell.",
    icon: <Bell className="h-4 w-4" aria-hidden />,
  },
};

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
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const drafts = announcements.filter((a) => a.publishedAt === null);
  const published = announcements.filter((a) => a.publishedAt !== null);

  const reset = () => {
    setForm(EMPTY_FORM);
    setError(null);
  };

  const handleSave = () => {
    setError(null);
    setNotice(null);
    const payload = {
      title: form.title,
      body: form.body,
      presentation: form.presentation,
    };
    startTransition(async () => {
      const result = form.editingId
        ? await updateDraftAction(form.editingId, payload)
        : await saveDraftAction(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(form.editingId ? "Draft updated." : "Draft saved.");
      reset();
      router.refresh();
    });
  };

  const handleEdit = (a: AnnouncementSummary) => {
    setError(null);
    setNotice(null);
    setForm({
      editingId: a.id,
      title: a.title,
      body: a.body,
      presentation: a.presentation,
    });
  };

  const handleDelete = (id: string) => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await deleteDraftAction(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (form.editingId === id) reset();
      setNotice("Draft deleted.");
      router.refresh();
    });
  };

  const handlePublish = (id: string) => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await publishAction(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (form.editingId === id) reset();
      const n = result.data.recipientCount;
      setNotice(`Published to ${n} member${n === 1 ? "" : "s"}.`);
      router.refresh();
    });
  };

  return (
    <div className="space-y-8">
      {/* Composer */}
      <section className="rounded-lg border p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">
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

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="announcement-title">Title</Label>
            <Input
              id="announcement-title"
              value={form.title}
              maxLength={120}
              placeholder="Burn-night briefing"
              onChange={(e) =>
                setForm((f) => ({ ...f, title: e.target.value }))
              }
              disabled={pending}
            />
          </div>

          <div className="space-y-1.5">
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
          </div>

          <div className="space-y-1.5">
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
                ).map((key) => (
                  <SelectItem key={key} value={key}>
                    <span className="flex items-center gap-2">
                      {PRESENTATION_META[key].icon}
                      {PRESENTATION_META[key].label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {PRESENTATION_META[form.presentation].hint}
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          {notice && !error && (
            <p className="text-sm text-emerald-400">
              {notice}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              onClick={handleSave}
              disabled={pending || !form.title.trim() || !form.body.trim()}
              className="gap-1.5"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Pencil className="h-4 w-4" />
              )}
              {form.editingId ? "Update draft" : "Save draft"}
            </Button>
          </div>
        </div>
      </section>

      {/* Drafts */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Drafts {drafts.length > 0 && `(${drafts.length})`}
        </h2>
        {drafts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No drafts.</p>
        ) : (
          <ul className="space-y-3">
            {drafts.map((a) => (
              <li key={a.id} className="rounded-lg border p-4">
                <AnnouncementHeader announcement={a} />
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {a.body}
                </p>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => handleEdit(a)}
                    disabled={pending}
                  >
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(a.id)}
                    disabled={pending}
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => handlePublish(a.id)}
                    disabled={pending}
                  >
                    <Send className="h-4 w-4" /> Publish to camp
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Published */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Published {published.length > 0 && `(${published.length})`}
        </h2>
        {published.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing published yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {published.map((a) => (
              <li key={a.id} className="rounded-lg border p-4">
                <AnnouncementHeader announcement={a} />
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {a.body}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Sent to {a.recipientCount} member
                    {a.recipientCount === 1 ? "" : "s"}
                    {a.senderId === currentUserId ? " · by you" : ""}
                  </span>
                  {a.presentation === "acknowledge" && (
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {a.acknowledgedCount}/{a.recipientCount} acknowledged
                    </span>
                  )}
                  {a.publishedAt && (
                    <span>{new Date(a.publishedAt).toLocaleString()}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AnnouncementHeader({
  announcement: a,
}: {
  announcement: AnnouncementSummary;
}) {
  const meta = PRESENTATION_META[a.presentation];
  return (
    <div className="flex items-start justify-between gap-3">
      <h3 className="text-sm font-semibold leading-tight">{a.title}</h3>
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground",
        )}
        title={meta.hint}
      >
        {meta.icon}
        {a.presentation === "acknowledge"
          ? "Acknowledge"
          : a.presentation === "popup"
            ? "Pop-up"
            : "Inbox"}
      </span>
    </div>
  );
}
