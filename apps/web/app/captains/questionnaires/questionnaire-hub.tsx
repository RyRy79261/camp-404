"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Copy, FileText, Loader2, Plus, Trash2 } from "lucide-react";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { Card } from "@camp404/ui/components/card";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { InputField } from "@camp404/ui/components/input-field";
import { toast } from "@camp404/ui/components/toast";
import {
  createDraftAction,
  deleteDraftAction,
  duplicateDraftAction,
} from "./actions";

export interface HubItem {
  key: string;
  title: string;
  status: "draft" | "published" | "unpublished";
  questionCount: number;
  editedLabel: string;
  canDelete: boolean;
}

const STATUS: Record<
  HubItem["status"],
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  published: { label: "Published", variant: "default" },
  draft: { label: "Draft", variant: "outline" },
  unpublished: { label: "Unpublished", variant: "secondary" },
};

// Hub island (board 49): a "New questionnaire" composer that opens the canvas on
// create, and a list of rows (each links to the canvas) with inline duplicate /
// delete. Rename lives in the canvas. Every mutation routes through the
// captain/team-lead-gated server actions; the page re-renders from the server.
export function QuestionnaireHub({ items }: { items: HubItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

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

  function remove(key: string, title: string) {
    if (!window.confirm(`Delete "${title}"? This can't be undone.`)) return;
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
    <div className="flex flex-col gap-4">
      {creating ? (
        <Card className="flex flex-col gap-3 p-4">
          <InputField
            label="Questionnaire name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder="e.g. Camp feedback"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
            }}
          />
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
        </Card>
      ) : (
        <Button onClick={() => setCreating(true)} className="self-start">
          <Plus /> New questionnaire
        </Button>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<FileText aria-hidden />}
          title="No questionnaires yet"
          description="Create your first one to start collecting answers from members."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const status = STATUS[item.status];
            return (
              <li key={item.key}>
                <Card className="flex items-center gap-2">
                  <Link
                    href={`/captains/questionnaires/${item.key}`}
                    className="flex flex-1 items-center gap-3 p-4"
                  >
                    <div className="flex flex-1 flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{item.title}</span>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {item.questionCount} question
                        {item.questionCount === 1 ? "" : "s"} · Edited{" "}
                        {item.editedLabel}
                      </span>
                    </div>
                    <ChevronRight
                      aria-hidden
                      className="size-5 text-muted-foreground"
                    />
                  </Link>
                  <div className="flex items-center gap-1 pr-3">
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
                        onClick={() => remove(item.key, item.title)}
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
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
