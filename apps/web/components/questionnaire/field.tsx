"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Check, Heart, Star } from "lucide-react";
import {
  attendedYearOptions,
  isAllowedBuilderImageUrl,
  isOtherAnswer,
  otherAnswerText,
  toOtherAnswer,
  type LongTextQuestion,
  type Question,
  type QuestionOption,
  type QuestionnaireResponseValue,
  type TextFormat,
} from "@camp404/types";
import { AvatarUpload } from "@camp404/ui/components/avatar-upload";
import { Combobox } from "@camp404/ui/components/combobox";
import { DateControl } from "@camp404/ui/components/date-control";
import { DictatePill } from "@camp404/ui/components/dictate-pill";
import { Input } from "@camp404/ui/components/input";
import { OptionCardGroup } from "@camp404/ui/components/option-card-group";
import { SegmentedControl } from "@camp404/ui/components/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@camp404/ui/components/select";
import { Slider } from "@camp404/ui/components/slider";
import { TextareaWithCount } from "@camp404/ui/components/textarea-with-count";
import { cn } from "@camp404/ui/lib/utils";
import { RecorderPanel } from "../voice/recorder-panel";
import { useDictationToggle } from "../voice/use-dictation-toggle";
import { useVoiceSupported } from "../voice/use-voice-recorder";
import { cropResizeToSquare } from "@/lib/image";

// AfrikaBurn's questionnaire field (`components/questionnaire/field.tsx`),
// ported onto @camp404/ui. AB's kinds keep AB's controls; Camp 404's own kinds
// (slider, number, scale, toggle, combobox, image) render with Camp 404's kit.
// Every kind emits the same QuestionnaireResponseValue the validators expect.

interface FieldProps {
  question: Question;
  value: QuestionnaireResponseValue | undefined;
  error?: string;
  onChange: (value: QuestionnaireResponseValue) => void;
  /** Presentation-ordered options (from `presentationOptions` — seeded shuffle).
   * Falls back to the definition's own order. */
  options?: readonly QuestionOption[];
  /**
   * The author preview: nothing is saved, so an upload has nowhere to go (the
   * upload route needs a real send). An image field says so instead.
   */
  uploadsOff?: boolean;
}

/** Sentinel for the "Other…" choice in a dropdown (never a stored value — the
 * stored value is always `other:<text>`; see @camp404/types OTHER_PREFIX). */
const OTHER_SENTINEL = "__other__";

/** The longest typed "Other…" answer. */
const OTHER_MAX_LENGTH = 200;

/** A number or scale row wider than this is typed, not tapped. */
const MAX_TAPPABLE_STEPS = 11;

/**
 * The DOM id of a question's control. Prefixed, so a question id can never
 * collide with another element's id on the page.
 */
export function questionFieldId(questionId: string): string {
  return `q-${questionId}`;
}

/**
 * True when this question's control is a single HTML labelable element carrying
 * the field id — i.e. when `<label for>` actually resolves to something.
 *
 * Everything else (the yes/no pair, the scale, the rating, radio rows, chips,
 * grids, the year toggles, the uploader) is a COMPOSITE of buttons with no such
 * element, so `<label for>` on those pointed at nothing: the prompt was on
 * screen but was announced by nothing, clicking it focused nothing, and a
 * screen-reader user heard "Yes button / No button" with no idea what was being
 * asked. Those get an ARIA group labelled by the prompt instead. */
function isLabelableControl(question: Question): boolean {
  switch (question.kind) {
    case "short_text":
    case "email":
    case "phone":
    case "long_text":
    case "date":
    case "time":
    case "file_link":
    case "combobox":
      return true;
    // The dropdown variant renders a real <button> trigger with the id; the
    // radio-row and image-grid variants do not.
    case "single_select":
      return question.display === "dropdown";
    // A wide range is a plain number box; a narrow one is a row of cells.
    case "number":
      return !isTappableRange(question.min, question.max, 1);
    default:
      return false;
  }
}

/** Render one questionnaire question as a labelled control. Data-driven — the
 * `kind` (and, for choice questions, the `display` variant) picks the control;
 * the value shape follows the question kind. */
export function QuestionField({
  question,
  value,
  error,
  onChange,
  options,
  uploadsOff = false,
}: FieldProps) {
  const fieldId = questionFieldId(question.id);
  const labelId = `${fieldId}-label`;
  const helpId = question.helper ? `${fieldId}-help` : null;
  const errorId = error ? `${fieldId}-error` : null;
  // BOTH the hint and the error, in reading order. Previously the error
  // REPLACED the hint, so the one moment a respondent most needs "dd/mm/yyyy"
  // is the moment it stopped being announced.
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;
  const required = "required" in question && question.required === true;
  const labelable = isLabelableControl(question);

  const prompt = (
    <>
      {question.prompt}
      {required && (
        <span className="ml-1 text-primary" aria-hidden>
          *
        </span>
      )}
      {/* The asterisk is decorative. A labelable control announces required-ness
          through `aria-required`; a composite has no element that may carry it
          (`aria-required` is not valid on role="group"), so say it in words. */}
      {required && !labelable && <span className="sr-only"> (required)</span>}
    </>
  );

  return (
    <div className="flex flex-col gap-1.5">
      {labelable ? (
        <label id={labelId} htmlFor={fieldId} className="text-sm font-medium">
          {prompt}
        </label>
      ) : (
        <span id={labelId} className="text-sm font-medium">
          {prompt}
        </span>
      )}
      {question.helper && (
        <p id={helpId ?? undefined} className="text-xs text-muted-foreground">
          {question.helper}
        </p>
      )}

      <Control
        question={question}
        value={value}
        onChange={onChange}
        options={options}
        fieldId={fieldId}
        describedBy={describedBy}
        labelledBy={labelId}
        invalid={Boolean(error)}
        required={required}
        uploadsOff={uploadsOff}
      />

      {error && (
        // `role="alert"` because nothing else tells a non-sighted respondent
        // that Next didn't advance: the message simply appeared under a control
        // they may not be on. aria-describedby covers re-reading it later.
        <p
          id={errorId ?? undefined}
          role="alert"
          className="text-xs text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}

/** ARIA wiring every control gets, derived once by `QuestionField`. */
interface ControlAria {
  fieldId: string;
  describedBy?: string;
  /** Id of the prompt element — the accessible name for composite controls. */
  labelledBy: string;
  invalid: boolean;
  required: boolean;
}

/** ARIA attributes spread onto a composite control's wrapper. */
interface GroupAria {
  "aria-labelledby": string;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
}

function Control({
  question,
  value,
  onChange,
  options,
  fieldId,
  describedBy,
  labelledBy,
  invalid,
  required,
  uploadsOff = false,
}: FieldProps & ControlAria) {
  // Spread onto the labelable controls (the ones `<label for>` resolves to).
  const inputAria = {
    "aria-describedby": describedBy,
    "aria-invalid": invalid || undefined,
    "aria-required": required || undefined,
  } as const;
  // Spread onto a composite's wrapper, which stands in as the control.
  const groupAria: GroupAria = {
    "aria-labelledby": labelledBy,
    "aria-describedby": describedBy,
    "aria-invalid": invalid || undefined,
  };
  // The kit's radio groups take a plain name, so they carry the required state
  // in words, as the prompt's hidden suffix does for the other composites.
  const kitGroupName = required
    ? `${question.prompt} (required)`
    : question.prompt;

  switch (question.kind) {
    case "short_text":
      return (
        <Input
          id={fieldId}
          maxLength={question.maxLength}
          {...FORMAT_INPUT[question.format ?? "text"]}
          value={typeof value === "string" ? value : ""}
          placeholder={question.placeholder}
          {...inputAria}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
      );

    case "email":
      return (
        <Input
          id={fieldId}
          {...FORMAT_INPUT.email}
          value={typeof value === "string" ? value : ""}
          placeholder={question.placeholder}
          {...inputAria}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
      );

    // AfrikaBurn uses a country-code phone picker; Camp 404 takes no new
    // dependency for it, so this is a phone keyboard on a plain input.
    case "phone":
      return (
        <Input
          id={fieldId}
          {...FORMAT_INPUT.phone}
          value={typeof value === "string" ? value : ""}
          placeholder={question.placeholder}
          {...inputAria}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
      );

    case "long_text":
      return (
        <LongTextField
          id={fieldId}
          question={question}
          value={typeof value === "string" ? value : ""}
          onChange={(v) => onChange(v)}
          inputAria={inputAria}
        />
      );

    case "date":
      return (
        <DateControl
          id={fieldId}
          value={typeof value === "string" ? value : ""}
          {...inputAria}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
      );

    // Time of day, 24h hh:mm.
    case "time":
      return (
        <Input
          id={fieldId}
          type="time"
          className="max-w-[10rem]"
          value={typeof value === "string" ? value : ""}
          {...inputAria}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
      );

    // A link to a file the respondent hosts. AfrikaBurn uploads the file when
    // its deployment has Blob storage for it; Camp 404's upload routes take
    // images only, so the respondent pastes a link (AfrikaBurn's own fallback).
    case "file_link":
      return (
        <Input
          id={fieldId}
          type="url"
          inputMode="url"
          value={typeof value === "string" ? value : ""}
          placeholder={question.placeholder ?? "https://…"}
          {...inputAria}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
      );

    case "boolean":
      return (
        <div role="group" {...groupAria} className="flex gap-2">
          {[
            { v: true, label: "Yes" },
            { v: false, label: "No" },
          ].map(({ v, label }) => (
            <button
              key={label}
              type="button"
              aria-pressed={value === v}
              onClick={() => onChange(v)}
              className={cn(
                "flex-1 rounded-md border px-3 py-2 text-sm transition-colors",
                value === v
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-input bg-background text-muted-foreground hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      );

    // 0/1..max scale with optional end labels.
    case "linear_scale":
      return (
        <ScaleCells
          steps={rangeSteps(question.min, question.max, 1)}
          value={typeof value === "number" ? value : null}
          onChange={onChange}
          minLabel={question.minLabel}
          maxLabel={question.maxLabel}
          groupAria={groupAria}
        />
      );

    // 3–10 step rating, star/heart/number glyph.
    case "rating": {
      const current = typeof value === "number" ? value : 0;
      const steps = Array.from({ length: question.steps }, (_, i) => i + 1);
      const Glyph = question.glyph === "heart" ? Heart : Star;
      return (
        <div className="flex flex-col gap-1.5">
          <div
            role="radiogroup"
            {...groupAria}
            className="flex flex-wrap items-center gap-1"
          >
            {steps.map((n) => {
              const on = current >= n;
              const label = `${n} out of ${question.steps}`;
              if (question.glyph === "number") {
                return (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={current === n}
                    aria-label={label}
                    onClick={() => onChange(n)}
                    className={cn(
                      "h-9 w-9 rounded-md border text-sm tabular-nums transition-colors",
                      current === n
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-background hover:bg-muted",
                    )}
                  >
                    {n}
                  </button>
                );
              }
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={current === n}
                  aria-label={label}
                  onClick={() => onChange(n)}
                  className="rounded-sm p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Glyph
                    className={cn(
                      "h-7 w-7 transition-colors",
                      on ? "fill-accent text-accent" : "text-muted-foreground",
                    )}
                    aria-hidden
                  />
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {current > 0
              ? `${current} out of ${question.steps}`
              : `Tap to rate — up to ${question.steps}`}
          </p>
        </div>
      );
    }

    case "single_select": {
      const opts = options ?? question.options;
      const raw = typeof value === "string" ? value : "";
      const other = isOtherAnswer(raw);
      const otherText = otherAnswerText(raw);
      const otherLabel = question.otherLabel ?? "Other…";
      const otherInputLabel = `Your other answer to: ${question.prompt}`;

      // Long option lists render as a dropdown (the `display` variant).
      if (question.display === "dropdown") {
        return (
          <div className="flex flex-col gap-2">
            <Select
              value={other ? OTHER_SENTINEL : raw || undefined}
              onValueChange={(v) =>
                onChange(
                  v === OTHER_SENTINEL
                    ? toOtherAnswer(other ? otherText : "")
                    : v,
                )
              }
            >
              <SelectTrigger id={fieldId} {...inputAria}>
                <SelectValue placeholder="Choose an option" />
              </SelectTrigger>
              <SelectContent>
                {opts.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
                {question.allowOther && (
                  <SelectItem value={OTHER_SENTINEL}>{otherLabel}</SelectItem>
                )}
              </SelectContent>
            </Select>
            {other && (
              <OtherInput
                id={`${fieldId}-other`}
                label={otherInputLabel}
                value={otherText}
                onChange={(text) => onChange(toOtherAnswer(text))}
              />
            )}
          </div>
        );
      }

      // Image grid — multiple-choice-with-images.
      if (question.display === "image_grid") {
        return (
          <div className="flex flex-col gap-2">
            <div
              role="radiogroup"
              {...groupAria}
              className="grid grid-cols-2 gap-2 sm:grid-cols-3"
            >
              {opts.map((opt) => (
                <ImageOption
                  key={opt.value}
                  option={opt}
                  selected={raw === opt.value}
                  role="radio"
                  onToggle={() => onChange(opt.value)}
                />
              ))}
            </div>
            {question.allowOther && (
              <OtherChoiceRow
                label={otherLabel}
                role="radio"
                selected={other}
                text={otherText}
                inputId={`${fieldId}-other`}
                inputLabel={otherInputLabel}
                onSelect={() => onChange(toOtherAnswer(other ? otherText : ""))}
                onText={(text) => onChange(toOtherAnswer(text))}
              />
            )}
          </div>
        );
      }

      // Default: radio rows (with option thumbnails when the author set them).
      return (
        <div className="flex flex-col gap-1.5" role="radiogroup" {...groupAria}>
          {opts.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={raw === opt.value}
              onClick={() => onChange(opt.value)}
              className={cn(
                "flex items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                raw === opt.value
                  ? "border-primary bg-primary/10"
                  : "border-input bg-background hover:bg-muted",
              )}
            >
              {opt.imageUrl && isAllowedBuilderImageUrl(opt.imageUrl) && (
                <OptionThumb
                  url={opt.imageUrl}
                  alt={opt.imageAlt ?? opt.label}
                />
              )}
              <span className="min-w-0 flex-1">{opt.label}</span>
              <RadioDot on={raw === opt.value} />
            </button>
          ))}
          {question.allowOther && (
            <OtherChoiceRow
              label={otherLabel}
              role="radio"
              selected={other}
              text={otherText}
              inputId={`${fieldId}-other`}
              inputLabel={otherInputLabel}
              onSelect={() => onChange(toOtherAnswer(other ? otherText : ""))}
              onText={(text) => onChange(toOtherAnswer(text))}
            />
          )}
        </div>
      );
    }

    case "multi_select": {
      const opts = options ?? question.options;
      const selected = Array.isArray(value) ? value.map(String) : [];
      const selectedSet = new Set(selected);
      const otherValue = selected.find((v) => isOtherAnswer(v));
      const otherText = otherValue ? otherAnswerText(otherValue) : "";
      const otherLabel = question.otherLabel ?? "Other…";
      const otherInputLabel = `Your other answer to: ${question.prompt}`;

      const toggle = (v: string) => {
        const next = selected.filter((s) => s !== v);
        if (next.length === selected.length) next.push(v);
        onChange(next);
      };
      const setOther = (text: string) => {
        const next = selected.filter((s) => !isOtherAnswer(s));
        next.push(toOtherAnswer(text));
        onChange(next);
      };
      const clearOther = () =>
        onChange(selected.filter((s) => !isOtherAnswer(s)));

      const limits = selectionHint(
        question.minSelections,
        question.maxSelections,
      );
      const otherRow = question.allowOther && (
        <OtherChoiceRow
          label={otherLabel}
          role="checkbox"
          selected={otherValue !== undefined}
          text={otherText}
          inputId={`${fieldId}-other`}
          inputLabel={otherInputLabel}
          onSelect={() =>
            otherValue === undefined ? setOther("") : clearOther()
          }
          onText={setOther}
        />
      );

      if (question.display === "image_grid") {
        return (
          <div className="flex flex-col gap-2">
            <div
              role="group"
              {...groupAria}
              className="grid grid-cols-2 gap-2 sm:grid-cols-3"
            >
              {opts.map((opt) => (
                <ImageOption
                  key={opt.value}
                  option={opt}
                  selected={selectedSet.has(opt.value)}
                  role="checkbox"
                  onToggle={() => toggle(opt.value)}
                />
              ))}
            </div>
            {otherRow}
            {limits && (
              <p className="text-xs text-muted-foreground">{limits}</p>
            )}
          </div>
        );
      }

      return (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2" role="group" {...groupAria}>
            {opts.map((opt) => {
              const on = selectedSet.has(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(opt.value)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                    on
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-input bg-background text-muted-foreground hover:bg-muted",
                  )}
                >
                  {on && (
                    <Check className="h-3.5 w-3.5 text-primary" aria-hidden />
                  )}
                  {opt.label}
                </button>
              );
            })}
          </div>
          {otherRow}
          {limits && <p className="text-xs text-muted-foreground">{limits}</p>}
        </div>
      );
    }

    case "multi_choice_grid":
    case "checkbox_grid":
      return (
        <GridControl
          question={question}
          value={value}
          onChange={onChange}
          groupAria={groupAria}
        />
      );

    case "years": {
      const selected = Array.isArray(value) ? value.map((v) => String(v)) : [];
      const toggle = (year: string) =>
        onChange(
          selected.includes(year)
            ? selected.filter((y) => y !== year)
            : [...selected, year],
        );
      return (
        <div role="group" {...groupAria} className="flex flex-wrap gap-2">
          {attendedYearOptions().map(({ year, disabled }) => {
            const key = String(year);
            const on = selected.includes(key);
            return (
              <button
                key={year}
                type="button"
                aria-pressed={on}
                disabled={disabled}
                aria-label={disabled ? `${year} — no burn was held` : key}
                title={disabled ? "No burn was held this year" : undefined}
                onClick={() => toggle(key)}
                className={cn(
                  "flex min-w-14 flex-col items-center rounded-md border px-2.5 py-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  on
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-input bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                <span className="text-sm tabular-nums">{year}</span>
                {disabled && (
                  <span className="text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
                    no burn
                  </span>
                )}
              </button>
            );
          })}
        </div>
      );
    }

    // --- Camp 404 kinds --------------------------------------------------

    case "slider": {
      if (question.display === "segmented") {
        // The builder's "Scale": whole-number cells to tap, `step` apart.
        return (
          <ScaleCells
            steps={rangeSteps(question.min, question.max, question.step)}
            value={typeof value === "number" ? value : null}
            onChange={onChange}
            minLabel={question.minLabel ?? String(question.min)}
            maxLabel={question.maxLabel ?? String(question.max)}
            groupAria={groupAria}
          />
        );
      }
      // Default to the min when the member hasn't touched it yet — the most
      // honest "no preference" position for an interest slider.
      const current = typeof value === "number" ? value : question.min;
      return (
        <div className="flex flex-col gap-2">
          <div className="flex justify-end">
            <span
              aria-live="polite"
              className="font-mono text-sm font-medium tabular-nums text-accent"
            >
              {current}
            </span>
          </div>
          <Slider
            id={fieldId}
            aria-labelledby={labelledBy}
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
      const current = typeof value === "number" ? value : null;
      // A whole number in a small range is tapped, like a linear scale; a wide
      // or inverted range would be a wall of cells, so it is typed.
      if (isTappableRange(question.min, question.max, 1)) {
        return (
          <ScaleCells
            steps={rangeSteps(question.min, question.max, 1)}
            value={current}
            onChange={onChange}
            minLabel={question.minLabel}
            maxLabel={question.maxLabel}
            groupAria={groupAria}
          />
        );
      }
      return (
        <Input
          id={fieldId}
          type="number"
          inputMode="numeric"
          className="max-w-[12rem]"
          min={question.min}
          max={question.max}
          step={1}
          value={current ?? ""}
          {...inputAria}
          onChange={(e) => {
            const raw = e.currentTarget.value;
            onChange(raw === "" ? null : Number(raw));
          }}
        />
      );
    }

    case "scale":
      // Labelled categorical steps (not a numeric range): option cards,
      // emitting the step's string value.
      return (
        <OptionCardGroup
          id={fieldId}
          aria-label={kitGroupName}
          options={question.steps.map((s) => ({
            value: s.value,
            label: s.label,
          }))}
          value={typeof value === "string" ? value : undefined}
          onValueChange={onChange}
        />
      );

    case "toggle":
      return (
        <SegmentedControl
          id={fieldId}
          aria-label={kitGroupName}
          options={question.options}
          value={typeof value === "string" ? value : undefined}
          onValueChange={onChange}
        />
      );

    case "combobox":
      return (
        <Combobox
          id={fieldId}
          options={question.options}
          value={typeof value === "string" ? value : undefined}
          onChange={onChange}
          placeholder={question.placeholder ?? "Select…"}
          searchPlaceholder={question.searchPlaceholder ?? "Search…"}
        />
      );

    case "image":
      return (
        <ImageField
          question={question}
          value={value}
          onChange={onChange}
          groupAria={groupAria}
          uploadsOff={uploadsOff}
        />
      );
  }
}

/** Grid question control — rows down the side, shared columns across. A
 * multiple-choice grid takes one column per row (radio); a checkbox grid takes
 * any number (checkbox). The value is a `{ [rowId]: columnValue[] }` map. */
function GridControl({
  question,
  value,
  onChange,
  groupAria,
}: {
  question: Extract<Question, { kind: "multi_choice_grid" | "checkbox_grid" }>;
  value: QuestionnaireResponseValue | undefined;
  onChange: (value: QuestionnaireResponseValue) => void;
  groupAria: GroupAria;
}) {
  const single = question.kind === "multi_choice_grid";
  const answer: Record<string, string[]> =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, string[]>)
      : {};

  function setCell(rowId: string, columnValue: string) {
    const current = answer[rowId] ?? [];
    const on = current.includes(columnValue);
    const nextRow = single
      ? on
        ? [] // clicking the chosen column again clears the row
        : [columnValue]
      : on
        ? current.filter((v) => v !== columnValue)
        : [...current, columnValue];
    const next: Record<string, string[]> = { ...answer };
    if (nextRow.length === 0) delete next[rowId];
    else next[rowId] = nextRow;
    onChange(next);
  }

  return (
    <div className="overflow-x-auto" role="group" {...groupAria}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <td className="p-2" />
            {question.columns.map((column) => (
              <th
                key={column.value}
                scope="col"
                className="p-2 text-center text-xs font-medium text-muted-foreground"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {question.rows.map((row) => {
            const picks = answer[row.id] ?? [];
            return (
              <tr key={row.id} className="border-t border-border">
                <th
                  scope="row"
                  className="p-2 text-left text-sm font-normal text-foreground"
                >
                  {row.label}
                </th>
                {question.columns.map((column) => {
                  const on = picks.includes(column.value);
                  return (
                    <td key={column.value} className="p-2 text-center">
                      <button
                        type="button"
                        role={single ? "radio" : "checkbox"}
                        aria-checked={on}
                        aria-label={`${row.label}: ${column.label}`}
                        onClick={() => setCell(row.id, column.value)}
                        className={cn(
                          "inline-flex h-6 w-6 items-center justify-center border transition-colors",
                          single ? "rounded-full" : "rounded",
                          on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input bg-background hover:bg-muted",
                        )}
                      >
                        {on && <Check className="h-3.5 w-3.5" aria-hidden />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A row of numbered circles to tap, with optional end labels: AfrikaBurn's
 * linear scale, also used for Camp 404's small-range `number` and segmented
 * `slider`. The chosen number is the value.
 */
function ScaleCells({
  steps,
  value,
  onChange,
  minLabel,
  maxLabel,
  groupAria,
}: {
  steps: number[];
  value: number | null;
  onChange: (value: QuestionnaireResponseValue) => void;
  minLabel?: string;
  maxLabel?: string;
  groupAria: GroupAria;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="radiogroup"
        {...groupAria}
        className="flex flex-wrap items-end gap-2"
      >
        {steps.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(n)}
            className="flex w-10 flex-col items-center gap-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="text-xs tabular-nums text-muted-foreground">
              {n}
            </span>
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full border transition-colors",
                value === n
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background hover:bg-muted",
              )}
              aria-hidden
            >
              {value === n && <Check className="h-4 w-4" />}
            </span>
          </button>
        ))}
      </div>
      {(minLabel || maxLabel) && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{minLabel ?? ""}</span>
          <span>{maxLabel ?? ""}</span>
        </div>
      )}
    </div>
  );
}

/** Whether min..max in `step`s is short enough to draw as cells. */
function isTappableRange(min: number, max: number, step: number): boolean {
  if (!Number.isFinite(min) || !Number.isFinite(max) || step <= 0) return false;
  if (max < min) return false;
  return Math.floor((max - min) / step) + 1 <= MAX_TAPPABLE_STEPS;
}

/**
 * The numbers from min to max, `step` apart. Built by index rather than by
 * adding `step` repeatedly, so a fractional step never drifts into float noise
 * (0.30000000000000004). Capped, so a malformed range can't freeze the page.
 */
function rangeSteps(min: number, max: number, step: number): number[] {
  if (
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    step <= 0 ||
    max < min
  ) {
    return [];
  }
  const count = Math.min(Math.floor((max - min) / step) + 1, 101);
  return Array.from({ length: count }, (_, i) =>
    Number((min + i * step).toPrecision(12)),
  );
}

/** The keyboard and autofill a short text format should get on a phone. */
const FORMAT_INPUT: Record<
  TextFormat,
  Pick<React.ComponentProps<"input">, "type" | "inputMode" | "autoComplete">
> = {
  text: {},
  email: { type: "email", inputMode: "email", autoComplete: "email" },
  url: { type: "url", inputMode: "url" },
  phone: { type: "tel", inputMode: "tel", autoComplete: "tel" },
  // AfrikaBurn's numeric text formats: the answer stays text, so the box stays
  // a text box with a number keyboard.
  number: { inputMode: "decimal" },
  integer: { inputMode: "numeric" },
  alphanumeric: {},
};

function selectionHint(
  min: number | undefined,
  max: number | undefined,
): string | null {
  if (min != null && max != null) return `Pick ${min}–${max} options.`;
  if (min != null) return `Pick at least ${min}.`;
  if (max != null) return `Pick at most ${max}.`;
  return null;
}

function RadioDot({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
        on ? "border-primary" : "border-input",
      )}
      aria-hidden
    >
      {on && <Check className="h-3.5 w-3.5 text-primary" />}
    </span>
  );
}

function OptionThumb({ url, alt }: { url: string; alt: string }) {
  return (
    // A plain img: next/image needs a host allowlist, and the URL is already
    // held to Camp 404's own storage (isAllowedBuilderImageUrl).
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className="h-12 w-12 shrink-0 rounded-md border border-border object-cover"
    />
  );
}

function ImageOption({
  option,
  selected,
  role,
  onToggle,
}: {
  option: QuestionOption;
  selected: boolean;
  role: "radio" | "checkbox";
  onToggle: () => void;
}) {
  // Only images Camp 404 stores. A definition saved before that rule could
  // hold another site's link, and showing it would make every member's
  // browser call that site.
  const url =
    option.imageUrl && isAllowedBuilderImageUrl(option.imageUrl)
      ? option.imageUrl
      : null;
  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      onClick={onToggle}
      className={cn(
        "flex flex-col gap-2 rounded-md border p-2 text-left text-sm transition-colors",
        selected
          ? "border-primary bg-primary/10"
          : "border-input bg-background hover:bg-muted",
      )}
    >
      {url ? (
        <img
          src={url}
          alt={option.imageAlt ?? option.label}
          loading="lazy"
          className="aspect-video w-full rounded-sm border border-border object-cover"
        />
      ) : (
        <span
          className="flex aspect-video w-full items-center justify-center rounded-sm bg-muted text-xs text-muted-foreground"
          aria-hidden
        >
          No image
        </span>
      )}
      <span className="flex items-center gap-1.5">
        {selected && (
          <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        )}
        <span className="min-w-0 truncate">{option.label}</span>
      </span>
    </button>
  );
}

/** The "Other…" row on a choice question: a selectable row plus its free-text
 * input. The stored value is `other:<text>` (@camp404/types OTHER_PREFIX). */
function OtherChoiceRow({
  label,
  role,
  selected,
  text,
  inputId,
  inputLabel,
  onSelect,
  onText,
}: {
  label: string;
  /** A radio beside single-choice rows, a checkbox beside multi-choice ones. */
  role: "radio" | "checkbox";
  selected: boolean;
  text: string;
  inputId: string;
  inputLabel: string;
  onSelect: () => void;
  onText: (text: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        role={role}
        aria-checked={selected}
        onClick={onSelect}
        className={cn(
          "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
          selected
            ? "border-primary bg-primary/10"
            : "border-input bg-background text-muted-foreground hover:bg-muted",
        )}
      >
        {selected && (
          <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        )}
        {label}
      </button>
      {selected && (
        <OtherInput
          id={inputId}
          label={inputLabel}
          value={text}
          onChange={onText}
        />
      )}
    </div>
  );
}

function OtherInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (text: string) => void;
}) {
  return (
    <Input
      id={id}
      value={value}
      maxLength={OTHER_MAX_LENGTH}
      placeholder="Tell us more…"
      aria-label={label}
      onChange={(e) => onChange(e.currentTarget.value)}
    />
  );
}

/**
 * A photo answer. The member's own profile photo uploads through the avatar
 * route (onboarding mirrors it onto users.profile_image_url); every other image
 * question is a separate picture with its own folder, posted to the
 * questionnaire-image route with the activation it is answered under, so the
 * route checks the question against THAT send's pinned definition.
 */
function ImageField({
  question,
  value,
  onChange,
  groupAria,
  uploadsOff,
}: {
  question: Extract<Question, { kind: "image" }>;
  value: QuestionnaireResponseValue | undefined;
  onChange: (value: QuestionnaireResponseValue) => void;
  groupAria: GroupAria;
  uploadsOff: boolean;
}) {
  // Typed non-null but null outside a route context (a unit test rendering the
  // field bare), so it is read defensively.
  const routeParams: Partial<Record<string, string | string[]>> | null =
    useParams();
  const activationId =
    typeof routeParams?.activationId === "string"
      ? routeParams.activationId
      : undefined;

  if (uploadsOff) {
    return (
      <p
        role="group"
        {...groupAria}
        className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground"
      >
        Uploads are off in the preview. Members can add a photo here.
      </p>
    );
  }
  return (
    <div
      role="group"
      {...groupAria}
      className="flex flex-col items-center py-2"
    >
      <AvatarUpload
        value={typeof value === "string" ? value : null}
        onChange={(url) => onChange(url)}
        preprocessImage={cropResizeToSquare}
        uploadUrl={
          question.role === "profile_photo"
            ? undefined
            : questionnaireImageUploadUrl(question.id, activationId)
        }
      />
    </div>
  );
}

/** Upload endpoint for one image answer, carrying the activation when there is one. */
function questionnaireImageUploadUrl(
  questionId: string,
  activationId: string | undefined,
): string {
  const params = new URLSearchParams({ question: questionId });
  if (activationId) params.set("activation", activationId);
  return `/api/uploads/questionnaire-image?${params}`;
}

/**
 * Long-form answer with a character count and, where the author enabled it,
 * dictation revealed on demand. "Dictate instead" sits beneath; tapping it
 * swaps in the recorder panel, and each accepted recording is appended to what
 * is already typed, so the member can mix typing and dictation.
 */
function LongTextField({
  id,
  question,
  value,
  onChange,
  inputAria,
}: {
  id: string;
  question: LongTextQuestion;
  value: string;
  onChange: (value: string) => void;
  inputAria: {
    "aria-describedby": string | undefined;
    "aria-invalid": true | undefined;
    "aria-required": true | undefined;
  };
}) {
  const dictation = useDictationToggle();
  const voiceSupported = useVoiceSupported();

  function appendTranscript(text: string) {
    const cleaned = text.trim();
    if (!cleaned) return;
    const joiner = value && !/\n\s*$/.test(value) ? "\n" : "";
    onChange(`${value}${joiner}${cleaned}`.slice(0, question.maxLength));
  }

  return (
    <div className="flex flex-col gap-3">
      <TextareaWithCount
        id={id}
        rows={5}
        maxLength={question.maxLength}
        value={value}
        placeholder={question.placeholder}
        {...inputAria}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
      {question.enableDictation &&
        voiceSupported &&
        (dictation.dictating ? (
          <RecorderPanel
            onTranscript={appendTranscript}
            onDismiss={dictation.close}
            promptKey="questionnaire"
          />
        ) : (
          <DictatePill
            ref={dictation.pillRef}
            onActivate={dictation.open}
            className="self-end"
          />
        ))}
    </div>
  );
}
