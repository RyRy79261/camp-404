"use client";

import { useId, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BarChart3,
  CalendarCheck,
  Copy,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { Input } from "@camp404/ui/components/input";
import { Label } from "@camp404/ui/components/label";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { toast } from "@camp404/ui/components/toast";
import { useConfirm } from "@camp404/ui/components/confirm-dialog";
import { BlockingBadge } from "@/components/questionnaire/blocking-chrome";
import { ATTENDANCE_CHECK_KEY } from "@/lib/attendance-check";
import {
  createAttendanceCheckAction,
  createDraftAction,
  deleteDraftAction,
  duplicateDraftAction,
} from "./actions";

/** The page's heading copy; the island draws it so its action opens the composer. */
export interface HubHeading {
  eyebrow: string;
  title: string;
  description: string;
}

export interface HubItem {
  key: string;
  title: string;
  status: "draft" | "published" | "unpublished";
  questionCount: number;
  editedLabel: string;
  /** This viewer may open it in the builder (a captain, or its author). */
  canEdit: boolean;
  canDelete: boolean;
  /** Results are captain-only. */
  canSeeResults: boolean;
  /** Its open send's blocking flag, or null when nothing is sent right now. */
  openSendBlocking: boolean | null;
}

interface RowBusy {
  key: string;
  action: "duplicate" | "delete";
}

const STATUS: Record<
  HubItem["status"],
  { label: string; variant: "success" | "secondary" | "outline" }
> = {
  published: { label: "Published", variant: "success" },
  draft: { label: "Draft", variant: "outline" },
  unpublished: { label: "Unpublished", variant: "secondary" },
};

// The hub, laid out like the AfrikaBurn console's questionnaire list: a list
// section per where a questionnaire stands, each questionnaire a card with its
// status, counts and key, and Edit / Results / Send beside it. AfrikaBurn splits
// the list by audience; Camp 404 chooses the audience per send, so it splits by
// whether a send is open. "New questionnaire" names the draft first, then opens
// the builder on it. A captain also has one click for the yearly "Coming this
// year?" check: it creates and publishes that questionnaire, then opens its
// Send page, where the captain picks who it reaches. Every mutation routes
// through the captain/team-lead-gated server actions; the page re-renders from
// the server.
export function QuestionnaireHub({
  heading,
  items,
  canCreateAttendanceCheck = false,
}: {
  heading: HubHeading;
  items: HubItem[];
  /** A captain: the only rank that publishes and sends. */
  canCreateAttendanceCheck?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [, startRowTransition] = useTransition();
  // Only the control that was tapped spins; the row's others wait.
  const [busy, setBusy] = useState<RowBusy | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const nameId = useId();
  const errorId = useId();
  const [checking, startCheckTransition] = useTransition();
  const [checkError, setCheckError] = useState<string | null>(null);
  const checkErrorId = useId();
  const hasAttendanceCheck = items.some((i) => i.key === ATTENDANCE_CHECK_KEY);

  function attendanceCheck() {
    setCheckError(null);
    startCheckTransition(async () => {
      const result = await createAttendanceCheckAction();
      if (!result.ok) {
        setCheckError(result.error);
        return;
      }
      router.push(`/captains/questionnaires/${result.key}/send`);
    });
  }

  function create() {
    const title = name.trim();
    if (!title) return;
    startTransition(async () => {
      const result = await createDraftAction(title);
      if (!result.ok) {
        // A problem with the name the captain typed shows beside it.
        setNameError(result.error);
        return;
      }
      router.push(`/captains/questionnaires/${result.key}`);
    });
  }

  function duplicate(key: string) {
    setBusy({ key, action: "duplicate" });
    startRowTransition(async () => {
      try {
        const result = await duplicateDraftAction(key);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Duplicated");
        router.refresh();
      } finally {
        setBusy(null);
      }
    });
  }

  async function remove(key: string, title: string) {
    const sure = await confirm({
      title: `Delete "${title}"?`,
      description:
        "It is a draft, so nobody has answered it. This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!sure) return;
    setBusy({ key, action: "delete" });
    startRowTransition(async () => {
      try {
        const result = await deleteDraftAction(key);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Deleted");
        router.refresh();
      } finally {
        setBusy(null);
      }
    });
  }

  const sent = items.filter((i) => i.openSendBlocking !== null);
  const notSent = items.filter((i) => i.openSendBlocking === null);
  const actions = {
    busy,
    onDuplicate: duplicate,
    onDelete: (key: string, title: string) => void remove(key, title),
  };

  return (
    <div>
      {confirmDialog}
      <PageHeading
        {...heading}
        actions={
          <div className="flex flex-col gap-1.5 sm:items-end">
            <div className="flex flex-wrap items-center gap-2">
              {canCreateAttendanceCheck ? (
                <Button
                  variant="outline"
                  onClick={attendanceCheck}
                  disabled={checking}
                  aria-describedby={checkError ? checkErrorId : undefined}
                >
                  {checking ? (
                    <Loader2 aria-hidden className="motion-safe:animate-spin" />
                  ) : (
                    <CalendarCheck aria-hidden />
                  )}
                  {hasAttendanceCheck
                    ? "Send this year's attendance check"
                    : "Create this year's attendance check"}
                </Button>
              ) : null}
              <Button onClick={() => setCreating(true)} disabled={creating}>
                <Plus aria-hidden />
                New questionnaire
              </Button>
            </div>
            {checkError ? (
              <p
                id={checkErrorId}
                role="alert"
                className="text-xs text-destructive"
              >
                {checkError}
              </p>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-col gap-8">
        {creating ? (
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>New questionnaire</CardTitle>
              <CardDescription>
                Name it, then build its sections and questions.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={nameId}>Questionnaire name</Label>
                <Input
                  id={nameId}
                  value={name}
                  onChange={(e) => {
                    setName(e.currentTarget.value);
                    setNameError(null);
                  }}
                  placeholder="e.g. Gear check"
                  autoFocus
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={nameError ? errorId : undefined}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") create();
                  }}
                />
                {nameError ? (
                  <p
                    id={errorId}
                    role="alert"
                    className="text-xs text-destructive"
                  >
                    {nameError}
                  </p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button onClick={create} disabled={pending || !name.trim()}>
                  {pending ? (
                    <Loader2 aria-hidden className="motion-safe:animate-spin" />
                  ) : null}
                  Create
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setCreating(false);
                    setName("");
                    setNameError(null);
                  }}
                  disabled={pending}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {items.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
              <FileText className="h-8 w-8 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium">No questionnaires yet</p>
              <p className="text-sm text-muted-foreground">
                Build one to collect answers from members. Keep it short — every
                question is one a camp member has to answer.
              </p>
              {!creating ? (
                <Button onClick={() => setCreating(true)}>
                  <Plus aria-hidden />
                  Build a questionnaire
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <>
            <ListSection
              icon={<Users className="h-4 w-4" aria-hidden />}
              label="Sent now"
              caption="Out with members, who can answer them now."
              items={sent}
              emptyCopy="Nothing is out with members right now."
              {...actions}
            />
            {notSent.length > 0 ? (
              <ListSection
                icon={<FileText className="h-4 w-4" aria-hidden />}
                label="Not sent"
                caption="Drafts, and questionnaires with no open send."
                items={notSent}
                emptyCopy=""
                {...actions}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function ListSection({
  icon,
  label,
  caption,
  items,
  emptyCopy,
  busy,
  onDuplicate,
  onDelete,
}: {
  icon: ReactNode;
  label: string;
  caption: string;
  items: HubItem[];
  emptyCopy: string;
  busy: RowBusy | null;
  onDuplicate: (key: string) => void;
  onDelete: (key: string, title: string) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {icon}
          {label}
          <Badge variant="outline">{items.length}</Badge>
        </h2>
        <p className="text-xs text-muted-foreground">{caption}</p>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            {emptyCopy}
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((item) => (
            <li key={item.key}>
              <QuestionnaireCard
                item={item}
                busy={busy?.key === item.key ? busy.action : null}
                locked={busy !== null}
                onDuplicate={() => onDuplicate(item.key)}
                onDelete={() => onDelete(item.key, item.title)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function QuestionnaireCard({
  item,
  busy,
  locked,
  onDuplicate,
  onDelete,
}: {
  item: HubItem;
  busy: RowBusy["action"] | null;
  locked: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const status = STATUS[item.status];
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="break-words text-lg font-semibold">
                {item.title}
              </h3>
              <Badge variant={status.variant}>{status.label}</Badge>
              {item.openSendBlocking !== null ? (
                <BlockingBadge blocking={item.openSendBlocking} />
              ) : null}
              <Badge variant="secondary">
                {item.questionCount}{" "}
                {item.questionCount === 1 ? "question" : "questions"}
              </Badge>
            </div>
            <p className="font-mono text-xs text-muted-foreground">
              {item.key} · updated {item.editedLabel}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {item.canEdit ? (
              <Button
                asChild
                variant="outline"
                size="sm"
                aria-label={`Edit ${item.title}`}
              >
                <Link href={`/captains/questionnaires/${item.key}`}>
                  <Pencil aria-hidden />
                  Edit
                </Link>
              </Button>
            ) : null}
            {/* Results only exist once something has been published and sent
                — a draft has no answers to show, and an empty metrics page
                reads as broken rather than as "not yet". */}
            {item.canSeeResults && item.status !== "draft" ? (
              <Button
                asChild
                variant="outline"
                size="sm"
                aria-label={`See results for ${item.title}`}
              >
                <Link href={`/captains/questionnaires/${item.key}/metrics`}>
                  <BarChart3 aria-hidden />
                  Results
                </Link>
              </Button>
            ) : null}
            {/* The way a team lead reaches Send: a lead can't open a captain's
                questionnaire in the builder. */}
            {item.status === "published" ? (
              <Button asChild size="sm" aria-label={`Send ${item.title}`}>
                <Link href={`/captains/questionnaires/${item.key}/send`}>
                  <Send aria-hidden />
                  Send
                </Link>
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Duplicate ${item.title}`}
              onClick={onDuplicate}
              disabled={locked}
            >
              {busy === "duplicate" ? (
                <Loader2 aria-hidden className="motion-safe:animate-spin" />
              ) : (
                <Copy aria-hidden />
              )}
            </Button>
            {item.canDelete ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${item.title}`}
                onClick={onDelete}
                disabled={locked}
              >
                {busy === "delete" ? (
                  <Loader2 aria-hidden className="motion-safe:animate-spin" />
                ) : (
                  <Trash2 aria-hidden className="text-destructive" />
                )}
              </Button>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
