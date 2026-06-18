"use client";

import * as React from "react";
import type {
  LongTextQuestion,
  Question,
  QuestionnaireResponseValue,
} from "@camp404/types";
import { Checkbox } from "@camp404/ui/components/checkbox";
import { Combobox } from "@camp404/ui/components/combobox";
import { DateControl } from "@camp404/ui/components/date-control";
import { Input } from "@camp404/ui/components/input";
import { Label } from "@camp404/ui/components/label";
import { OptionCardGroup } from "@camp404/ui/components/option-card-group";
import { SegmentedControl } from "@camp404/ui/components/segmented-control";
import { Slider } from "@camp404/ui/components/slider";
import { Textarea } from "@camp404/ui/components/textarea";
import { CircleAlert } from "lucide-react";
import { DictatePill } from "@camp404/ui/components/dictate-pill";
import { RecorderPanel } from "../voice/recorder-panel";
import { AvatarUpload } from "@camp404/ui/components/avatar-upload";
import { cropResizeToSquare } from "@/lib/image";

// Per-kind questionnaire field renderer, recomposed onto the S05 field-kind
// board affordances + the shared @camp404/ui primitives. The data model is
// unchanged: every kind emits the same QuestionnaireResponseValue it always did
// (scale/toggle emit the chosen option's string value; slider a number; …).

interface QuestionFieldProps {
  question: Question;
  value: QuestionnaireResponseValue | undefined;
  onChange: (value: QuestionnaireResponseValue) => void;
  error?: string;
  /**
   * Page-level hint that this question owns the full viewport (single
   * long_text / image). Lets the field grow vertically instead of sitting at a
   * fixed height.
   */
  fullScreen?: boolean;
}

export function QuestionField({
  question,
  value,
  onChange,
  error,
  fullScreen,
}: QuestionFieldProps) {
  const fieldId = `q-${question.id}`;

  return (
    <div className={fullScreen ? "flex flex-1 flex-col gap-2" : "flex flex-col gap-2"}>
      <Label htmlFor={fieldId}>
        {question.prompt}
        {"required" in question && question.required && (
          <span className="ml-1 text-primary">*</span>
        )}
      </Label>
      {question.helper && (
        <p className="text-xs text-muted-foreground">{question.helper}</p>
      )}
      <FieldInput
        id={fieldId}
        question={question}
        value={value}
        onChange={onChange}
        fullScreen={fullScreen}
      />
      {error && (
        <p
          role="alert"
          className="flex items-center gap-1.5 text-xs text-destructive"
        >
          <CircleAlert aria-hidden className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

function FieldInput({
  id,
  question,
  value,
  onChange,
  fullScreen,
}: {
  id: string;
  question: Question;
  value: QuestionnaireResponseValue | undefined;
  onChange: (value: QuestionnaireResponseValue) => void;
  fullScreen?: boolean;
}) {
  switch (question.kind) {
    case "slider": {
      // Default to the min when the user hasn't touched it yet — the most
      // honest "no preference" position for an interest slider.
      const current = typeof value === "number" ? value : question.min;
      return (
        <div className="flex flex-col gap-2">
          {/* S04 slider head: the live value sits top-right, accent mono. */}
          <div className="flex justify-end">
            <span
              aria-live="polite"
              className="font-mono text-sm font-medium text-accent"
            >
              {current}
            </span>
          </div>
          <Slider
            id={id}
            aria-label={question.prompt}
            value={[current]}
            onValueChange={(v) => onChange(v[0] ?? current)}
            min={question.min}
            max={question.max}
            step={question.step}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{question.minLabel ?? question.min}</span>
            <span>{question.maxLabel ?? question.max}</span>
          </div>
        </div>
      );
    }
    case "number": {
      // Board OB-step-06 (team interests): a row of equal-width whole-number
      // cells from min..max, the picked one filled $primary, end labels beneath
      // ("Not for me" / "Sign me up"). The value is the chosen integer.
      const cells = Array.from(
        { length: question.max - question.min + 1 },
        (_, i) => question.min + i,
      );
      const current = typeof value === "number" ? value : undefined;
      return (
        <div className="flex flex-col gap-2">
          <SegmentedControl
            id={id}
            aria-label={question.prompt}
            options={cells.map((n) => ({ value: String(n), label: String(n) }))}
            value={current !== undefined ? String(current) : undefined}
            onValueChange={(v) => onChange(Number(v))}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{question.minLabel ?? question.min}</span>
            <span>{question.maxLabel ?? question.max}</span>
          </div>
        </div>
      );
    }
    case "single_select":
      // Board S04/S11 (Divergence #4, "boards win → RadioCardGroup"): a single
      // pick renders as stacked option cards, not a dropdown. OptionCardGroup is
      // the leaf for exactly this — same affordance as `scale` above.
      return (
        <OptionCardGroup
          id={id}
          aria-label={question.prompt}
          options={question.options.map((o) => ({
            value: o.value,
            label: o.label,
          }))}
          value={typeof value === "string" ? value : undefined}
          onValueChange={onChange}
        />
      );
    case "multi_select": {
      const selected = Array.isArray(value)
        ? new Set(value as string[])
        : new Set<string>();
      return (
        <div
          id={id}
          role="group"
          aria-label={question.prompt}
          className="flex flex-col gap-3"
        >
          {question.options.map((o) => {
            const checkboxId = `${id}-${o.value}`;
            return (
              <div key={o.value} className="flex items-center gap-2.5">
                <Checkbox
                  id={checkboxId}
                  checked={selected.has(o.value)}
                  onCheckedChange={(checked) => {
                    const next = new Set(selected);
                    if (checked === true) next.add(o.value);
                    else next.delete(o.value);
                    onChange(Array.from(next));
                  }}
                />
                <Label htmlFor={checkboxId} className="text-sm font-normal">
                  {o.label}
                </Label>
              </div>
            );
          })}
        </div>
      );
    }
    case "short_text":
      return (
        <Input
          id={id}
          maxLength={question.maxLength}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
      );
    case "long_text":
      return (
        <LongTextField
          id={id}
          question={question}
          value={typeof value === "string" ? value : ""}
          onChange={(v) => onChange(v)}
          fullScreen={fullScreen}
        />
      );
    case "date":
      return (
        <DateControl
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
      );
    case "scale":
      // Catalogue scales are labelled categorical steps (not a numeric 1–N
      // range), so they render as labelled option cards — single-select,
      // emitting the step's string value (S04/S05 reconciliation).
      return (
        <OptionCardGroup
          id={id}
          aria-label={question.prompt}
          options={question.steps.map((s) => ({ value: s.value, label: s.label }))}
          value={typeof value === "string" ? value : undefined}
          onValueChange={onChange}
        />
      );
    case "toggle":
      // The only toggle is the 2-option id.type pick, which S04 draws as a
      // segmented control (not the S05 switch-list — that's for multi on/off).
      return (
        <SegmentedControl
          id={id}
          aria-label={question.prompt}
          options={question.options}
          value={typeof value === "string" ? value : undefined}
          onValueChange={onChange}
        />
      );
    case "combobox":
      return (
        <Combobox
          id={id}
          options={question.options}
          value={typeof value === "string" ? value : undefined}
          onChange={onChange}
          placeholder={question.placeholder ?? "Select…"}
          searchPlaceholder={question.searchPlaceholder ?? "Search…"}
        />
      );
    case "image":
      return (
        <div className="flex flex-1 flex-col items-center justify-center py-4">
          <AvatarUpload
            value={typeof value === "string" ? value : null}
            onChange={(url) => onChange(url)}
            preprocessImage={cropResizeToSquare}
          />
        </div>
      );
  }
}

/**
 * Long-form textarea with optional dictation revealed on demand (S05
 * long_text). Textarea is the primary input; "Dictate instead" sits beneath as
 * a bordered pill. Tapping it swaps the button for the recorder panel; each
 * completed recording appends to whatever's already in the textarea, so the
 * user can mix typing and dictation. In `fullScreen` mode (a lone long_text on
 * its own page) the textarea grows to fill the viewport.
 */
function LongTextField({
  id,
  question,
  value,
  onChange,
  fullScreen,
}: {
  id: string;
  question: LongTextQuestion;
  value: string;
  onChange: (value: string) => void;
  fullScreen?: boolean;
}) {
  const [dictating, setDictating] = React.useState(false);

  function appendTranscript(text: string) {
    const cleaned = text.trim();
    if (!cleaned) return;
    const joiner = value && !/\n\s*$/.test(value) ? "\n" : "";
    const next = `${value}${joiner}${cleaned}`.slice(0, question.maxLength);
    onChange(next);
  }

  return (
    <div className={fullScreen ? "flex flex-1 flex-col gap-3" : "flex flex-col gap-3"}>
      <Textarea
        id={id}
        maxLength={question.maxLength}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        rows={fullScreen ? undefined : 6}
        className={fullScreen ? "min-h-[40dvh] flex-1 resize-none" : undefined}
      />
      {dictating ? (
        <RecorderPanel
          onTranscript={appendTranscript}
          onDismiss={() => setDictating(false)}
          promptKey="questionnaire"
        />
      ) : (
        <DictatePill
          onActivate={() => setDictating(true)}
          className="self-end"
        />
      )}
    </div>
  );
}
