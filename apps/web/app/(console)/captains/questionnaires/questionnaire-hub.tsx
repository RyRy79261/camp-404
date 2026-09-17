"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BarChart3,
  Copy,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Send,
  Trash2,
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
import { EmptyState } from "@camp404/ui/components/empty-state";
import { Input } from "@camp404/ui/components/input";
import { Label } from "@camp404/ui/components/label";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { toast } from "@camp404/ui/components/toast";
import { useConfirm } from "@camp404/ui/components/confirm-dialog";
import { BlockingBadge } from "@/components/questionnaire/blocking-chrome";
import {
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
  canDelete: boolean;
  /** Its open send's blocking flag, or null when nothing is sent right now. */
  openSendBlocking: boolean | null;
}

const STATUS: Record<
  HubItem["status"],
  { label: string; variant: "success" | "secondary" | "outline" }
> = {
  published: { label: "Published", variant: "success" },
  draft: { label: "Draft", variant: "outline" },
  unpublished: { label: "Unpublished", variant: "secondary" },
};

// Hub island, laid out like the AfrikaBurn console's questionnaire list: the
// heading's "New questionnaire" action opens a composer that opens the canvas on
// create, and each questionnaire is a card with Edit / Results / Send and inline
// duplicate / delete. Rename lives in the canvas. Every mutation routes through
// the captain/team-lead-gated server actions; the page re-renders from the
// server.
export function QuestionnaireHub({
  heading,
  items,
}: {
  heading: HubHeading;
  items: HubItem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const [name, setName] = useState("");
  const nameId = useId();

  function create() {
    const title = name.trim();
    if (!title) return;
    startTransition(async () => {
      const result = await createDraftAction(title);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.push(`/captains/questionnaires/${result.key}`);
    });
  }

  function duplicate(key: string) {
    setBusyKey(key);
    startTransition(async () => {
      try {
        const result = await duplicateDraftAction(key);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Duplicated");
        router.refresh();
      } finally {
        setBusyKey(null);
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
    setBusyKey(key);
    startTransition(async () => {
      try {
        const result = await deleteDraftAction(key);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Deleted");
        router.refresh();
      } finally {
        setBusyKey(null);
      }
    });
  }

  return (
    <div className="flex flex-col">
      {confirmDialog}
      <PageHeading
        {...heading}
        actions={
          <Button onClick={() => setCreating(true)} disabled={creating}>
            <Plus aria-hidden /> New questionnaire
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        {creating && (
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle className="text-base">New questionnaire</CardTitle>
              <CardDescription>
                Name it, then build its pages and questions.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={nameId}>Questionnaire name</Label>
                <Input
                  id={nameId}
                  value={name}
                  onChange={(e) => setName(e.currentTarget.value)}
                  placeholder="e.g. Camp feedback"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") create();
                  }}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={create} disabled={pending || !name.trim()}>
                  {pending ? <Loader2 className="animate-spin" /> : "Create"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setCreating(false);
                    setName("");
                  }}
                  disabled={pending}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {items.length === 0 ? (
          <EmptyState
            icon={<FileText aria-hidden />}
            title="No questionnaires yet"
            description="Create your first one to start collecting answers from members."
          />
        ) : (
          <ul className="flex flex-col gap-4">
            {items.map((item) => {
              const status = STATUS[item.status];
              return (
                <li key={item.key}>
                  <Card>
                    <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="break-words text-lg font-semibold normal-case tracking-normal">
                            {item.title}
                          </h2>
                          <Badge variant={status.variant}>{status.label}</Badge>
                          {item.openSendBlocking !== null && (
                            <BlockingBadge blocking={item.openSendBlocking} />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {item.questionCount} question
                          {item.questionCount === 1 ? "" : "s"} · Edited{" "}
                          {item.editedLabel}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
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
                        {/* Results only exist once something has been published
                            and sent — a draft has no answers to show, and an
                            empty metrics page reads as broken rather than as
                            "not yet". */}
                        {item.status !== "draft" && (
                          <Button
                            asChild
                            variant="outline"
                            size="sm"
                            aria-label={`See results for ${item.title}`}
                          >
                            <Link
                              href={`/captains/questionnaires/${item.key}/metrics`}
                            >
                              <BarChart3 aria-hidden />
                              Results
                            </Link>
                          </Button>
                        )}
                        {/* The way a team lead reaches Send: a lead can't open
                            a captain's questionnaire in the editor. */}
                        {item.status === "published" && (
                          <Button
                            asChild
                            size="sm"
                            aria-label={`Send ${item.title}`}
                          >
                            <Link
                              href={`/captains/questionnaires/${item.key}/send`}
                            >
                              <Send aria-hidden />
                              Send
                            </Link>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Duplicate ${item.title}`}
                          onClick={() => duplicate(item.key)}
                          disabled={busyKey !== null}
                        >
                          {busyKey === item.key ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Copy />
                          )}
                        </Button>
                        {item.canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete ${item.title}`}
                            onClick={() => void remove(item.key, item.title)}
                            disabled={busyKey !== null}
                          >
                            {busyKey === item.key ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <Trash2 className="text-destructive" />
                            )}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
