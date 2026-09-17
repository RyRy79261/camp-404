"use client";

import { useId, useState } from "react";
import { Trash2, TriangleAlert } from "lucide-react";
import {
  visibleIfProblem,
  type BuilderPage,
  type Question,
  type VisibleIf,
} from "@camp404/types";
import { Alert } from "@camp404/ui/components/alert";
import { Button } from "@camp404/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@camp404/ui/components/dialog";
import { InputField } from "@camp404/ui/components/input-field";
import { Label } from "@camp404/ui/components/label";
import { SegmentedControl } from "@camp404/ui/components/segmented-control";
import { Switch } from "@camp404/ui/components/switch";
import { Textarea } from "@camp404/ui/components/textarea";
import { VisibilityEditor } from "./visibility-editor";

export type PagePatch = Pick<
  BuilderPage,
  "title" | "intro" | "type" | "requiredToContinue" | "visibleIf"
>;

export function PageSettingsDialog({
  page,
  fields = [],
  canDelete,
  onSave,
  onDelete,
  onClose,
}: {
  page: BuilderPage;
  /** The questions on earlier pages, which a condition may reference. */
  fields?: readonly Question[];
  canDelete: boolean;
  onSave: (patch: PagePatch) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(page.title);
  const [intro, setIntro] = useState(page.intro ?? "");
  const [type, setType] = useState<BuilderPage["type"]>(page.type);
  const [requiredToContinue, setRequired] = useState(
    page.requiredToContinue ?? false,
  );
  const [visibleIf, setVisibleIf] = useState<VisibleIf | undefined>(
    page.visibleIf,
  );
  const conditionOk =
    !visibleIf ||
    visibleIfProblem(
      visibleIf,
      fields.find((f) => f.id === visibleIf.fieldId),
    ) === null;
  const requiredId = useId();
  // Switching type never deletes a question, but publish refuses a content
  // page that still holds one, so say so before the captain saves.
  const questionCount = page.blocks.filter(
    (block) => block.kind === "question",
  ).length;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[90dvh] flex-col gap-4 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Page settings</DialogTitle>
          <DialogDescription>
            Rename the page, set its type, and control whether members must finish
            it before continuing.
          </DialogDescription>
        </DialogHeader>

        <InputField
          label="Page title"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
        />
        <div className="flex flex-col gap-1.5">
          <Label>Page intro (optional)</Label>
          <Textarea value={intro} onChange={(e) => setIntro(e.currentTarget.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Page type</Label>
          <SegmentedControl
            aria-label="Page type"
            options={[
              { value: "question", label: "Question page" },
              { value: "content", label: "Content page" },
            ]}
            value={type}
            onValueChange={(v) => setType(v as BuilderPage["type"])}
          />
          <p className="text-xs text-muted-foreground">
            Content pages hold only text, explainers, and images — no input
            fields.
          </p>
          {type === "content" && questionCount > 0 && (
            <Alert variant="warning">
              <TriangleAlert aria-hidden />
              <span>
                {questionCount === 1
                  ? "This page still has 1 question."
                  : `This page still has ${questionCount} questions.`}{" "}
                You can&apos;t publish until you move or delete{" "}
                {questionCount === 1 ? "it" : "them"}, or make this a question
                page again.
              </span>
            </Alert>
          )}
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <Label htmlFor={requiredId}>Required to continue</Label>
            <p className="text-xs text-muted-foreground">
              Members must finish this page before moving on.
            </p>
          </div>
          <Switch
            id={requiredId}
            checked={requiredToContinue}
            onCheckedChange={setRequired}
          />
        </div>
        <VisibilityEditor
          value={visibleIf}
          fields={fields}
          subject="page"
          onChange={setVisibleIf}
        />

        <DialogFooter className="flex-row items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={!canDelete}
            onClick={onDelete}
          >
            <Trash2 className="text-destructive" /> Delete page
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!conditionOk}
              onClick={() =>
                onSave({
                  title,
                  intro: intro.trim() || undefined,
                  type,
                  requiredToContinue,
                  visibleIf,
                })
              }
            >
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
