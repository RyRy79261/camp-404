"use client";

import { useState, useTransition } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { Alert } from "@camp404/ui/components/alert";
import { Button } from "@camp404/ui/components/button";
import { InputField } from "@camp404/ui/components/input-field";
import { Label } from "@camp404/ui/components/label";
import { Switch } from "@camp404/ui/components/switch";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import { updateCampBlurb } from "../actions";

// "What I am in camp": an optional title and a short blurb other members see.
// A captain can also put theirs on join.camp-404.com's CREW.DB.
export function CampBlurbForm({
  initial,
  isCaptain,
}: {
  initial: { title: string | null; blurb: string | null; showOnJoin: boolean };
  isCaptain: boolean;
}) {
  const [title, setTitle] = useState(initial.title ?? "");
  const [blurb, setBlurb] = useState(initial.blurb ?? "");
  const [showOnJoin, setShowOnJoin] = useState(initial.showOnJoin);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      aria-label="What I am in camp"
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const res = await updateCampBlurb({ title, blurb, showOnJoin });
          if (res.ok) toast.success("Saved.");
          else setError(res.error);
        });
      }}
    >
      <InputField
        id="campTitle"
        label="Title"
        helper="Optional. Like “The Original Error Code” or “Chief Cat Herder”."
        maxLength={60}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="campBlurb">Blurb</Label>
        <Textarea
          id="campBlurb"
          rows={3}
          maxLength={280}
          value={blurb}
          onChange={(e) => setBlurb(e.target.value)}
          aria-describedby="campBlurb-helper"
        />
        <p id="campBlurb-helper" className="text-xs text-muted-foreground">
          Optional. A line or two about what you do in camp.{" "}
          {280 - blurb.length} characters left.
        </p>
      </div>
      {isCaptain && (
        <label className="flex items-start gap-3 text-sm">
          <Switch
            checked={showOnJoin}
            onCheckedChange={setShowOnJoin}
            aria-describedby="showOnJoin-helper"
          />
          <span>
            Show me on join.camp-404.com
            <span
              id="showOnJoin-helper"
              className="block text-xs text-muted-foreground"
            >
              Your name, title and blurb appear among this year&apos;s captains
              on the public site. Nothing else about you does.
            </span>
          </span>
        </label>
      )}
      {error && (
        <Alert variant="error">
          <TriangleAlert />
          <span>{error}</span>
        </Alert>
      )}
      <div className="flex justify-end border-t border-border pt-4">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
