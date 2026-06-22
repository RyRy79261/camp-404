"use client";

import { useId, useState } from "react";
import { Trash2 } from "lucide-react";
import type { BuilderPage } from "@camp404/types";
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

export type PagePatch = Pick<
  BuilderPage,
  "title" | "intro" | "type" | "requiredToContinue"
>;

export function PageSettingsDialog({
  page,
  canDelete,
  onSave,
  onDelete,
  onClose,
}: {
  page: BuilderPage;
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
  const requiredId = useId();

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex flex-col gap-4">
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
              onClick={() =>
                onSave({
                  title,
                  intro: intro.trim() || undefined,
                  type,
                  requiredToContinue,
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
