"use client";

import * as React from "react";
import type {
  LongTextQuestion,
  Question,
  QuestionnaireResponseValue,
  ScaleQuestion,
  ToggleQuestion,
} from "@camp404/types";
import { cn } from "@camp404/ui/lib/utils";
import { Button } from "@camp404/ui/components/button";
import { Checkbox } from "@camp404/ui/components/checkbox";
import { Combobox } from "@camp404/ui/components/combobox";
import { Input } from "@camp404/ui/components/input";
import { Label } from "@camp404/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@camp404/ui/components/select";
import { Slider } from "@camp404/ui/components/slider";
import { Textarea } from "@camp404/ui/components/textarea";
import { Mic } from "lucide-react";
import { RecorderPanel } from "../voice/recorder-panel";

interface QuestionFieldProps {
  question: Question;
  value: QuestionnaireResponseValue | undefined;
  onChange: (value: QuestionnaireResponseValue) => void;
  error?: string;
  /**
   * Page-level hint that this question owns the full viewport (single
   * scale, single long_text). Lets the LongTextField grow vertically
   * instead of sitting at a fixed 4-row height.
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
    <div
      className={
        fullScreen
          ? "flex flex-1 flex-col gap-2"
          : "flex flex-col gap-2"
      }
    >
      <Label htmlFor={fieldId}>
        {question.prompt}
        {"required" in question && question.required && (
          <span className="ml-1 text-[color:var(--color-primary)]">*</span>
        )}
      </Label>
      {question.helper && (
        <p className="text-xs text-[color:var(--color-muted-foreground)]">
          {question.helper}
        </p>
      )}
      <FieldInput
        id={fieldId}
        question={question}
        value={value}
        onChange={onChange}
        fullScreen={fullScreen}
      />
      {error && (
        <p className="text-xs text-red-600" role="alert">
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
      // Default to the min when the user hasn't touched it yet — the
      // most honest "no preference" position for an interest slider.
      const current = typeof value === "number" ? value : question.min;
      return (
        <div className="flex flex-col gap-2">
          <Slider
            id={id}
            value={[current]}
            onValueChange={(v) => onChange(v[0] ?? current)}
            min={question.min}
            max={question.max}
            step={question.step}
          />
          <div className="flex justify-between text-xs text-[color:var(--color-muted-foreground)]">
            <span>{question.minLabel ?? question.min}</span>
            <span
              aria-live="polite"
              className="font-medium text-[color:var(--color-foreground)]"
            >
              {current}
            </span>
            <span>{question.maxLabel ?? question.max}</span>
          </div>
        </div>
      );
    }
    case "single_select":
      return (
        <Select
          value={typeof value === "string" ? value : undefined}
          onValueChange={onChange}
        >
          <SelectTrigger id={id}>
            <SelectValue placeholder="Choose one…" />
          </SelectTrigger>
          <SelectContent>
            {question.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "multi_select": {
      const selected = Array.isArray(value)
        ? new Set(value as string[])
        : new Set<string>();
      return (
        <div className="flex flex-col gap-2">
          {question.options.map((o) => {
            const checkboxId = `${id}-${o.value}`;
            return (
              <div key={o.value} className="flex items-center gap-2">
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
        <Input
          id={id}
          type="date"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
      );
    case "scale":
      return (
        <ScaleField
          id={id}
          question={question}
          value={typeof value === "string" ? value : undefined}
          onChange={onChange}
        />
      );
    case "toggle":
      return (
        <ToggleField
          id={id}
          question={question}
          value={typeof value === "string" ? value : undefined}
          onChange={onChange}
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
  }
}

/**
 * Segmented-control renderer for the `toggle` question kind. A row of
 * equal-width buttons; the selected one carries the primary colour, the
 * others are bordered ghosts. Wraps to multiple rows if a label is long.
 */
function ToggleField({
  id,
  question,
  value,
  onChange,
}: {
  id: string;
  question: ToggleQuestion;
  value: string | undefined;
  onChange: (value: QuestionnaireResponseValue) => void;
}) {
  return (
    <div
      id={id}
      role="radiogroup"
      className="inline-flex w-full rounded-md border border-[color:var(--color-border)] p-1"
    >
      {question.options.map((o) => {
        const selected = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 rounded-sm px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary)]",
              selected
                ? "bg-[color:var(--color-primary)] text-[color:var(--color-primary-foreground)] shadow-sm"
                : "text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)]",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Discrete labelled scale. On mobile this fills the viewport height as a
 * vertical column (top = highest level, bottom = lowest) with a vertical
 * slider running alongside the labels. On md+ it falls back to a
 * horizontal slider with labels above each tick. The underlying value is
 * the index of the chosen step in `steps`.
 */
function ScaleField({
  id,
  question,
  value,
  onChange,
}: {
  id: string;
  question: ScaleQuestion;
  value: string | undefined;
  onChange: (value: QuestionnaireResponseValue) => void;
}) {
  const steps = question.steps;
  // `steps` is ordered top→bottom for the vertical UI; the slider's
  // numeric axis runs bottom→top so the top label corresponds to the
  // highest value.
  const indexOfValue =
    value !== undefined ? steps.findIndex((s) => s.value === value) : -1;
  const currentIndex = indexOfValue >= 0 ? indexOfValue : Math.floor(steps.length / 2);
  const sliderValue = steps.length - 1 - currentIndex;

  function commitFromSlider(next: number[]) {
    const v = next[0];
    if (v === undefined) return;
    const idx = steps.length - 1 - v;
    const step = steps[idx];
    if (step) onChange(step.value);
  }

  return (
    <>
      {/* Mobile: full-height vertical scale.
        * Three-column grid puts the slider track dead-centre with
        * equal-width gutters on either side. Left column is empty for
        * now — reserved for a future secondary label set. Right column
        * carries the step labels, distributed top-to-bottom matching
        * the slider's max-at-top / min-at-bottom orientation.
        */}
      <div
        id={id}
        className="grid h-[70dvh] grid-cols-[1fr_auto_1fr] items-stretch gap-4 md:hidden"
      >
        <div aria-hidden />
        <Slider
          orientation="vertical"
          value={[sliderValue]}
          onValueChange={commitFromSlider}
          min={0}
          max={steps.length - 1}
          step={1}
          aria-labelledby={`${id}-label`}
        />
        <ol
          className="flex h-full flex-col justify-between py-1"
          aria-hidden="true"
        >
          {steps.map((s, i) => {
            const selected = i === currentIndex;
            return (
              <li
                key={s.value}
                className={
                  "text-sm leading-tight transition-colors " +
                  (selected
                    ? "font-semibold text-[color:var(--color-foreground)]"
                    : "text-[color:var(--color-muted-foreground)]")
                }
              >
                {s.label}
              </li>
            );
          })}
        </ol>
      </div>

      {/* Desktop: horizontal scale with labels above each tick */}
      <div className="hidden md:block">
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
          {[...steps].reverse().map((s, i) => {
            const reversedIdx = steps.length - 1 - i;
            const selected = reversedIdx === currentIndex;
            return (
              <p
                key={s.value}
                className={
                  "text-center text-xs leading-tight " +
                  (selected
                    ? "font-semibold text-[color:var(--color-foreground)]"
                    : "text-[color:var(--color-muted-foreground)]")
                }
              >
                {s.label}
              </p>
            );
          })}
        </div>
        <Slider
          value={[sliderValue]}
          onValueChange={commitFromSlider}
          min={0}
          max={steps.length - 1}
          step={1}
          className="mt-3"
        />
      </div>
    </>
  );
}

/**
 * Long-form textarea with optional dictation revealed on demand —
 * pattern mirrored from RyRy79261/intake-tracker's bug-report dialog.
 * Textarea is the primary input; "Dictate instead" sits beneath as a
 * compact button. Tapping it swaps the button for a bordered recorder
 * panel (big circular mic, waveform, timer). Each completed recording
 * appends to whatever's already in the textarea, so the user can mix
 * typing and dictation freely.
 *
 * In `fullScreen` mode (single long_text on its own page — bio, this
 * year's ideas) the textarea grows to fill the viewport instead of
 * sitting at a fixed row count.
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
    <div
      className={
        fullScreen ? "flex flex-1 flex-col gap-3" : "flex flex-col gap-3"
      }
    >
      <Textarea
        id={id}
        maxLength={question.maxLength}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        rows={fullScreen ? undefined : 6}
        className={
          fullScreen ? "min-h-[40dvh] flex-1 resize-none" : undefined
        }
      />
      {dictating ? (
        <RecorderPanel
          onTranscript={appendTranscript}
          onDismiss={() => setDictating(false)}
          promptKey="questionnaire"
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => setDictating(true)}
          className="h-auto gap-3 self-end px-8 py-4"
        >
          <Mic className="h-5 w-5" />
          Dictate instead
        </Button>
      )}
    </div>
  );
}
