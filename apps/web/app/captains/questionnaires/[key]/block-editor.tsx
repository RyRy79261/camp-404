"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { Block, ContentBlock, Question } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@camp404/ui/components/dialog";
import { InputField } from "@camp404/ui/components/input-field";
import { Label } from "@camp404/ui/components/label";
import { SegmentedControl } from "@camp404/ui/components/segmented-control";
import { Switch } from "@camp404/ui/components/switch";
import { Textarea } from "@camp404/ui/components/textarea";
import { QuestionField } from "@/components/questionnaire/question";
import { ContentBlockRenderer } from "@/components/questionnaire/content-block";
import { OptionsEditor } from "./options-editor";
import {
  BUILDER_FIELD_KINDS,
  morphQuestion,
  type BuilderFieldKind,
} from "./field-kinds";

function blockValid(block: Block): boolean {
  if (block.kind === "question") {
    const q = block.question;
    if (!q.prompt.trim()) return false;
    if (
      (q.kind === "single_select" ||
        q.kind === "multi_select" ||
        q.kind === "combobox") &&
      q.options.length < 2
    ) {
      return false;
    }
    return true;
  }
  if (block.kind === "image_block") {
    return block.altText.trim().length > 0 && block.imageUrl.trim().length > 0;
  }
  if (block.kind === "header_break") return block.headingText.trim().length > 0;
  if (block.kind === "explainer") return block.bodyText.trim().length > 0;
  return true;
}

// One editor for both field and content blocks (buffers a local draft; persists
// only on Save). Per-kind params + a live respondent preview via the real
// member renderers (QuestionField / ContentBlockRenderer).
export function BlockEditorDialog({
  block,
  onSave,
  onDelete,
  onClose,
}: {
  block: Block;
  onSave: (block: Block) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Block>(block);

  function setQuestion(question: Question) {
    setDraft((d) => (d.kind === "question" ? { ...d, question } : d));
  }
  function patchQuestion(patch: Record<string, unknown>) {
    setDraft((d) =>
      d.kind === "question"
        ? { ...d, question: { ...d.question, ...patch } as Question }
        : d,
    );
  }
  function patchContent(patch: Record<string, unknown>) {
    setDraft((d) => (d.kind !== "question" ? ({ ...d, ...patch } as Block) : d));
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[90dvh] flex-col gap-4 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {draft.kind === "question" ? "Edit field" : "Edit block"}
          </DialogTitle>
        </DialogHeader>

        {draft.kind === "question" ? (
          <QuestionEditor
            question={draft.question}
            patch={patchQuestion}
            setQuestion={setQuestion}
          />
        ) : (
          <ContentEditor block={draft} patch={patchContent} />
        )}

        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Respondent preview
          </span>
          {draft.kind === "question" ? (
            <QuestionField
              question={draft.question}
              value={undefined}
              onChange={() => {}}
            />
          ) : (
            <ContentBlockRenderer block={draft} />
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2">
          <Button type="button" variant="ghost" onClick={onDelete}>
            <Trash2 className="text-destructive" /> Delete
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!blockValid(draft)}
              onClick={() => onSave(draft)}
            >
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const SELECT_CLASS =
  "h-10 rounded-md border border-border bg-muted px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function QuestionEditor({
  question,
  patch,
  setQuestion,
}: {
  question: Question;
  patch: (patch: Record<string, unknown>) => void;
  setQuestion: (question: Question) => void;
}) {
  const num = (raw: string, fallback: number) => {
    if (raw.trim() === "") return fallback; // clearing the box keeps the prior value (not 0)
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="field-kind">Field type</Label>
        <select
          id="field-kind"
          className={SELECT_CLASS}
          value={question.kind}
          onChange={(e) =>
            setQuestion(
              morphQuestion(question, e.currentTarget.value as BuilderFieldKind),
            )
          }
        >
          {BUILDER_FIELD_KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
      </div>

      <InputField
        label="Question"
        value={question.prompt}
        onChange={(e) => patch({ prompt: e.currentTarget.value })}
      />
      <InputField
        label="Helper text"
        value={question.helper ?? ""}
        onChange={(e) => patch({ helper: e.currentTarget.value || undefined })}
      />
      <div className="flex items-center justify-between">
        <Label htmlFor="field-required">Required</Label>
        <Switch
          id="field-required"
          checked={question.required}
          onCheckedChange={(c) => patch({ required: c })}
        />
      </div>

      {(question.kind === "short_text" || question.kind === "long_text") && (
        <InputField
          label="Max length"
          type="number"
          value={String(question.maxLength)}
          onChange={(e) =>
            patch({ maxLength: Math.max(1, num(e.currentTarget.value, question.maxLength)) })
          }
        />
      )}
      {(question.kind === "short_text" ||
        question.kind === "email" ||
        question.kind === "phone") && (
        <InputField
          label="Placeholder"
          value={question.placeholder ?? ""}
          onChange={(e) =>
            patch({ placeholder: e.currentTarget.value || undefined })
          }
        />
      )}
      {question.kind === "long_text" && (
        <div className="flex items-center justify-between">
          <Label htmlFor="field-dictation">Enable voice dictation</Label>
          <Switch
            id="field-dictation"
            checked={question.enableDictation ?? false}
            onCheckedChange={(c) => patch({ enableDictation: c })}
          />
        </div>
      )}
      {(question.kind === "number" || question.kind === "slider") && (
        <div className="grid grid-cols-2 gap-2">
          <InputField
            label="Min"
            type="number"
            value={String(question.min)}
            onChange={(e) =>
              patch({
                min: Math.min(question.max, num(e.currentTarget.value, question.min)),
              })
            }
          />
          <InputField
            label="Max"
            type="number"
            value={String(question.max)}
            onChange={(e) =>
              patch({
                max: Math.max(question.min, num(e.currentTarget.value, question.max)),
              })
            }
          />
        </div>
      )}
      {question.kind === "slider" && (
        <div className="flex flex-col gap-1.5">
          <Label>Display</Label>
          <SegmentedControl
            options={[
              { value: "continuous", label: "Slider" },
              { value: "segmented", label: "Number row" },
            ]}
            value={question.display ?? "continuous"}
            onValueChange={(v) => patch({ display: v })}
          />
        </div>
      )}
      {(question.kind === "single_select" ||
        question.kind === "multi_select" ||
        question.kind === "combobox") && (
        <div className="flex flex-col gap-1.5">
          <Label>Options</Label>
          <OptionsEditor
            options={question.options}
            onChange={(options) => patch({ options })}
          />
        </div>
      )}
    </div>
  );
}

function ContentEditor({
  block,
  patch,
}: {
  block: ContentBlock;
  patch: (patch: Record<string, unknown>) => void;
}) {
  switch (block.kind) {
    case "header_break":
      return (
        <div className="flex flex-col gap-4">
          <InputField
            label="Heading"
            value={block.headingText}
            onChange={(e) => patch({ headingText: e.currentTarget.value })}
          />
          <InputField
            label="Eyebrow (optional)"
            value={block.eyebrow ?? ""}
            onChange={(e) => patch({ eyebrow: e.currentTarget.value || undefined })}
          />
          <div className="flex flex-col gap-1.5">
            <Label>Subtext (optional)</Label>
            <Textarea
              value={block.subtext ?? ""}
              onChange={(e) => patch({ subtext: e.currentTarget.value || undefined })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Alignment</Label>
            <SegmentedControl
              options={[
                { value: "left", label: "Left" },
                { value: "center", label: "Center" },
              ]}
              value={block.alignment ?? "left"}
              onValueChange={(v) => patch({ alignment: v })}
            />
          </div>
        </div>
      );
    case "explainer":
      return (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Body text</Label>
            <Textarea
              value={block.bodyText}
              onChange={(e) => patch({ bodyText: e.currentTarget.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Style</Label>
            <SegmentedControl
              options={[
                { value: "plain", label: "Plain" },
                { value: "note", label: "Note" },
                { value: "callout", label: "Callout" },
                { value: "warning", label: "Warning" },
              ]}
              value={block.style}
              onValueChange={(v) => patch({ style: v })}
            />
          </div>
        </div>
      );
    case "image_block":
      return (
        <div className="flex flex-col gap-4">
          <InputField
            label="Image URL"
            value={block.imageUrl}
            onChange={(e) => patch({ imageUrl: e.currentTarget.value })}
            placeholder="https://…"
          />
          <InputField
            label="Caption (optional)"
            value={block.caption ?? ""}
            onChange={(e) => patch({ caption: e.currentTarget.value || undefined })}
          />
          <InputField
            label="Alt text"
            value={block.altText}
            helper="Describe the image for people using screen readers."
            onChange={(e) => patch({ altText: e.currentTarget.value })}
          />
          <div className="flex flex-col gap-1.5">
            <Label>Size &amp; fit</Label>
            <SegmentedControl
              options={[
                { value: "fit", label: "Fit" },
                { value: "fill", label: "Fill" },
                { value: "full-width", label: "Full-width" },
              ]}
              value={block.sizeFit}
              onValueChange={(v) => patch({ sizeFit: v })}
            />
          </div>
        </div>
      );
    case "divider":
      return (
        <p className="text-sm text-muted-foreground">
          A divider has no options.
        </p>
      );
  }
}
