"use client";

import * as React from "react";
import { Eye } from "lucide-react";
import type { Questionnaire } from "@camp404/types";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@camp404/ui/components/dialog";
import { BuilderPreview } from "@/components/questionnaire/builder-preview";

/**
 * The builder's Preview button (AfrikaBurn's questionnaire-preview): the draft
 * as it stands in the editor, saved or not, walked in the real runner with
 * nothing saved and nothing sent.
 */
export function QuestionnairePreview({
  definition,
  disabled,
}: {
  definition: Questionnaire;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [ended, setEnded] = React.useState(false);
  // Each open starts the walk fresh.
  const [run, setRun] = React.useState(0);

  function openPreview() {
    setEnded(false);
    setRun((n) => n + 1);
    setOpen(true);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={openPreview}
        disabled={disabled}
      >
        <Eye aria-hidden />
        Preview
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {/* Capped, with the walk scrolling inside, so a long section never
            takes the Back and Next buttons off the bottom of the screen. */}
        <DialogContent className="flex max-h-[85svh] max-w-2xl flex-col">
          <DialogHeader>
            <DialogTitle>Preview</DialogTitle>
            <DialogDescription>
              What a member sees, branching and all. Nothing here is saved, and
              nothing is sent.
            </DialogDescription>
          </DialogHeader>
          <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6">
            {ended ? (
              <div className="flex flex-col items-center gap-4 py-10 text-center">
                <Badge variant="success">End of questionnaire</Badge>
                <p className="max-w-sm text-sm text-muted-foreground">
                  This is where a member would submit. Nothing was saved: this
                  is only a preview.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEnded(false);
                    setRun((n) => n + 1);
                  }}
                >
                  Start over
                </Button>
              </div>
            ) : open ? (
              <BuilderPreview
                key={run}
                questionnaire={definition}
                onComplete={() => setEnded(true)}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
