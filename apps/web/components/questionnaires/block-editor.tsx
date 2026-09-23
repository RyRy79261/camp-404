"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  CornerDownRight,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  BUILDER_ROLES,
  SHORT_LABEL_MAX_LENGTH,
  SUBMIT_TARGET,
  builderRolesFor,
  isAllowedBuilderImageUrl,
  isAnswerableBlock,
  type ImageBlock,
  type PageBlock,
  type Question,
  type QuestionOption,
  type QuestionRole,
  type VisibleIf,
} from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { Card, CardContent } from "@camp404/ui/components/card";
import { Input } from "@camp404/ui/components/input";
import { SegmentedControl } from "@camp404/ui/components/segmented-control";
import { Textarea } from "@camp404/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@camp404/ui/components/select";
import { cn } from "@camp404/ui/lib/utils";

import {
  PALETTE,
  PALETTE_BY_KIND,
  blockLabel,
  blockPaletteKind,
  type PaletteKind,
} from "./block-kinds";
import {
  IssueNote,
  blockAnchor,
  blockIssues,
  optionIssues,
  type LocatedIssue,
} from "./definition-issues";
import { Labelled, ToggleRow, numberOrUndefined } from "./editor-parts";
import { ImageUploadButton } from "./image-upload-button";
import { VisibilityEditor } from "./visibility-editor";

// One block's editor: the type selector, the prompt, the per-type controls,
// the validation-rule controls, and (single choice only) the branching editor.
// Camp 404 adds, inside the same card: a short label, the role an answer plays
// in the app, voice dictation on a paragraph, the "Show only when…" condition,
// and pictures uploaded to the app's own store.
//
// Two invariants this file protects:
//   1. Block ids are NEVER recomputed here — not on reorder, not on retype,
//      not on relabel. A question id is the key its answers are stored under.
//   2. Option VALUES are allocated once and shown read-only. Editing a label is
//      a display change; editing a value would silently orphan collected data.

/** "Continue to the next section" — Radix Select forbids an empty item value. */
const CONTINUE = "__continue__";
/** "No role" — the same reason. */
const NO_ROLE = "__none__";

export interface BranchTarget {
  value: string;
  label: string;
}

/**
 * The branch picker only ever offers FORWARD targets. A stored value that is
 * no longer one of them (a section was moved or deleted) is still shown — as a
 * flagged item — so the author can see what the validator is complaining about
 * instead of staring at an empty dropdown.
 */
export function withCurrentTarget(
  targets: readonly BranchTarget[],
  current: string | undefined,
): BranchTarget[] {
  if (!current || targets.some((t) => t.value === current)) return [...targets];
  return [...targets, { value: current, label: `${current} — invalid target` }];
}

// The roles the builder cannot set, named so a question that already carries
// one (written by a code questionnaire or over MCP) shows what it is instead
// of being silently cleared.
const OTHER_ROLE_LABELS: Record<QuestionRole, string> = {
  profile_photo: "Profile photo",
  bio: "Bio",
  emergency_contact_name: "Emergency contact name",
  emergency_contact_phone: "Emergency contact phone",
  emergency_contact_relationship: "Emergency contact relationship",
  telegram_handle: "Telegram username",
  ...Object.fromEntries(
    Object.entries(BUILDER_ROLES).map(([role, meta]) => [role, meta.label]),
  ),
} as Record<QuestionRole, string>;

/** Free option value within one question — allocated once, never re-derived. */
function allocateOptionValue(
  options: readonly { value: string }[],
  prefix = "option",
): string {
  const taken = new Set(options.map((o) => o.value));
  let n = options.length + 1;
  while (taken.has(`${prefix}_${n}`)) n += 1;
  return `${prefix}_${n}`;
}

/** Free grid row id — allocated once (it keys the per-row response map). */
function allocateRowId(rows: readonly { id: string }[]): string {
  const taken = new Set(rows.map((r) => r.id));
  let n = rows.length + 1;
  while (taken.has(`row_${n}`)) n += 1;
  return `row_${n}`;
}

/** Free grid column value — allocated once (it is the stored answer). */
function allocateColumnValue(columns: readonly { value: string }[]): string {
  const taken = new Set(columns.map((c) => c.value));
  let n = columns.length + 1;
  while (taken.has(`col_${n}`)) n += 1;
  return `col_${n}`;
}

/** A number box that keeps the last number when it is cleared. */
function numberOr(raw: string, fallback: number): number {
  return numberOrUndefined(raw) ?? fallback;
}

export function BlockEditor({
  block,
  pageIndex,
  blockIndex,
  total,
  issues,
  branchTargets,
  questionnaireKey,
  fields,
  dragHandle,
  dragging = false,
  onChange,
  onConvert,
  onMove,
  onDuplicate,
  onRemove,
}: {
  block: PageBlock;
  pageIndex: number;
  blockIndex: number;
  total: number;
  issues: readonly LocatedIssue[];
  /** Sections this block may branch to (forward only) + "Submit". */
  branchTargets: readonly BranchTarget[];
  /** The questionnaire being edited, for picture uploads. */
  questionnaireKey: string;
  /** The questions before this block, which a condition may reference. */
  fields: readonly Question[];
  /** The drag handle (the builder wires it to the sortable list). */
  dragHandle?: React.ReactNode;
  /** This block is the one being dragged (its copy follows the pointer). */
  dragging?: boolean;
  onChange: (next: PageBlock) => void;
  onConvert: (kind: PaletteKind) => void;
  onMove: (delta: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const paletteKind = blockPaletteKind(block);
  const entry = PALETTE_BY_KIND[paletteKind];
  const Icon = entry.icon;
  const label = blockLabel(block, blockIndex);
  const mine = blockIssues(issues, pageIndex, blockIndex);
  const ownIssues = mine.filter((i) => !/options(\[|\.)\d/.test(i.path));

  function setVisibleIf(visibleIf: VisibleIf | undefined) {
    const { visibleIf: _drop, ...rest } = block;
    onChange((visibleIf ? { ...rest, visibleIf } : rest) as PageBlock);
  }

  return (
    <Card
      id={blockAnchor(block.id)}
      role="group"
      aria-label={`${entry.short}: ${label}`}
      className={cn(
        "scroll-mt-32 border-l-4",
        mine.length > 0 ? "border-l-destructive" : "border-l-transparent",
        dragging && "opacity-40",
      )}
    >
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {dragHandle}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <Icon className="h-3 w-3" aria-hidden />
            {entry.short}
          </span>
          <span className="max-w-[10rem] truncate font-mono text-[11px] text-muted-foreground">
            {block.id}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Move ${label} up`}
              disabled={blockIndex === 0}
              onClick={() => onMove(-1)}
            >
              <ArrowUp aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Move ${label} down`}
              disabled={blockIndex === total - 1}
              onClick={() => onMove(1)}
            >
              <ArrowDown aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Duplicate ${label}`}
              onClick={onDuplicate}
            >
              <Copy aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${label}`}
              onClick={onRemove}
            >
              <Trash2 aria-hidden className="text-destructive" />
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_13rem]">
          <PrimaryInput block={block} onChange={onChange} />
          <Select
            value={paletteKind}
            onValueChange={(v) => onConvert(v as PaletteKind)}
          >
            <SelectTrigger aria-label="Block type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PALETTE.map((p) => (
                <SelectItem key={p.kind} value={p.kind}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isAnswerableBlock(block) ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Labelled
              label="Helper text (optional)"
              hint="Shown under the question."
            >
              <Input
                value={block.helper ?? ""}
                onChange={(e) =>
                  onChange({ ...block, helper: e.target.value || undefined })
                }
                aria-label="Helper text"
              />
            </Labelled>
            <Labelled
              label="Short label (optional)"
              hint="A few words that name this question in the My forms change log, e.g. Driving."
            >
              <Input
                value={block.shortLabel ?? ""}
                maxLength={SHORT_LABEL_MAX_LENGTH}
                aria-label="Short label (optional)"
                onChange={(e) =>
                  onChange({
                    ...block,
                    shortLabel: e.target.value.trim()
                      ? e.target.value
                      : undefined,
                  })
                }
              />
            </Labelled>
          </div>
        ) : null}

        <BlockBody
          block={block}
          pageIndex={pageIndex}
          blockIndex={blockIndex}
          issues={issues}
          branchTargets={branchTargets}
          questionnaireKey={questionnaireKey}
          onChange={onChange}
        />

        {isAnswerableBlock(block) ? (
          <RoleSelect block={block} onChange={onChange} />
        ) : null}

        {isAnswerableBlock(block) ? (
          <div className="flex flex-col gap-3 border-t border-border pt-3">
            {block.kind === "long_text" ? (
              <ToggleRow
                label="Voice dictation"
                hint="Members can speak their answer instead of typing it."
                checked={block.enableDictation ?? false}
                onCheckedChange={(enableDictation) =>
                  onChange({
                    ...block,
                    enableDictation: enableDictation || undefined,
                  })
                }
              />
            ) : null}
            <ToggleRow
              label="Required"
              hint="Only if a missing answer gets in the camp's way."
              checked={block.required}
              onCheckedChange={(required) => onChange({ ...block, required })}
            />
          </div>
        ) : null}

        <VisibilityEditor
          value={block.visibleIf}
          fields={fields}
          subject="block"
          onChange={setVisibleIf}
        />

        <IssueNote issues={ownIssues} />
      </CardContent>
    </Card>
  );
}

function PrimaryInput({
  block,
  onChange,
}: {
  block: PageBlock;
  onChange: (next: PageBlock) => void;
}) {
  if (isAnswerableBlock(block)) {
    return (
      <Input
        value={block.prompt}
        onChange={(e) => onChange({ ...block, prompt: e.target.value })}
        placeholder="Question prompt"
        aria-label="Question prompt"
      />
    );
  }
  switch (block.kind) {
    case "info_block":
      return (
        <Input
          value={block.heading ?? ""}
          onChange={(e) =>
            onChange({ ...block, heading: e.target.value || undefined })
          }
          placeholder="Heading (optional)"
          aria-label="Info heading"
        />
      );
    case "image_block":
      return (
        <Input
          value={block.caption ?? ""}
          onChange={(e) =>
            onChange({ ...block, caption: e.target.value || undefined })
          }
          placeholder="Caption (optional)"
          aria-label="Image caption"
        />
      );
    case "header_break":
      return (
        <Input
          value={block.headingText}
          onChange={(e) => onChange({ ...block, headingText: e.target.value })}
          placeholder="Heading"
          aria-label="Heading"
        />
      );
    case "explainer":
      return (
        <p className="self-center text-sm text-muted-foreground">
          A paragraph in a styled box.
        </p>
      );
    case "divider":
      return (
        <p className="self-center text-sm text-muted-foreground">
          A thin line between blocks. It has nothing to set.
        </p>
      );
  }
}

function RoleSelect({
  block,
  onChange,
}: {
  block: Question;
  onChange: (next: PageBlock) => void;
}) {
  const current = "role" in block ? block.role : undefined;
  const roles: string[] = builderRolesFor(block.kind);
  if (current && !roles.includes(current)) roles.push(current);
  if (roles.length === 0) return null;
  return (
    <Labelled
      label="The app uses this answer as"
      hint="On submit, the answer is also saved where the roster, the member export and messages to drivers read it. Only one question may have each use."
    >
      <Select
        value={current ?? NO_ROLE}
        onValueChange={(v) => {
          const { role: _drop, ...rest } = block as Question & {
            role?: string;
          };
          onChange((v === NO_ROLE ? rest : { ...rest, role: v }) as PageBlock);
        }}
      >
        <SelectTrigger aria-label="The app uses this answer as">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_ROLE}>Nothing else</SelectItem>
          {roles.map((role) => (
            <SelectItem key={role} value={role}>
              {OTHER_ROLE_LABELS[role as QuestionRole] ?? role}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Labelled>
  );
}

function BlockBody({
  block,
  pageIndex,
  blockIndex,
  issues,
  branchTargets,
  questionnaireKey,
  onChange,
}: {
  block: PageBlock;
  pageIndex: number;
  blockIndex: number;
  issues: readonly LocatedIssue[];
  branchTargets: readonly BranchTarget[];
  questionnaireKey: string;
  onChange: (next: PageBlock) => void;
}) {
  switch (block.kind) {
    case "info_block":
      return (
        <Labelled label="Body" hint="Shown to members; takes no answer.">
          <Textarea
            value={block.body}
            onChange={(e) => onChange({ ...block, body: e.target.value })}
            rows={3}
            placeholder="The information you want people to read."
            aria-label="Body"
          />
        </Labelled>
      );

    case "header_break":
      return (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Labelled label="Eyebrow (optional)">
              <Input
                value={block.eyebrow ?? ""}
                aria-label="Eyebrow"
                onChange={(e) =>
                  onChange({ ...block, eyebrow: e.target.value || undefined })
                }
              />
            </Labelled>
            <Labelled label="Alignment">
              <SegmentedControl
                aria-label="Heading alignment"
                options={[
                  { value: "left", label: "Left" },
                  { value: "center", label: "Centre" },
                ]}
                value={block.alignment ?? "left"}
                onValueChange={(v) =>
                  onChange({ ...block, alignment: v as "left" | "center" })
                }
              />
            </Labelled>
          </div>
          <Labelled label="Subtext (optional)">
            <Textarea
              value={block.subtext ?? ""}
              rows={2}
              aria-label="Subtext"
              onChange={(e) =>
                onChange({ ...block, subtext: e.target.value || undefined })
              }
            />
          </Labelled>
        </div>
      );

    case "explainer":
      return (
        <div className="flex flex-col gap-3">
          <Labelled label="Text" hint="Shown to members; takes no answer.">
            <Textarea
              value={block.bodyText}
              rows={3}
              aria-label="Note text"
              placeholder="The note you want people to read."
              onChange={(e) => onChange({ ...block, bodyText: e.target.value })}
            />
          </Labelled>
          <Labelled label="Style">
            <SegmentedControl
              aria-label="Note style"
              options={[
                { value: "plain", label: "Plain" },
                { value: "note", label: "Note" },
                { value: "callout", label: "Callout" },
                { value: "warning", label: "Warning" },
              ]}
              value={block.style}
              onValueChange={(v) =>
                onChange({ ...block, style: v as typeof block.style })
              }
            />
          </Labelled>
        </div>
      );

    case "divider":
      return null;

    case "image_block":
      return (
        <ImageBlockBody
          block={block}
          questionnaireKey={questionnaireKey}
          onChange={onChange}
        />
      );

    case "single_select":
    case "multi_select":
      return (
        <ChoiceBody
          block={block}
          pageIndex={pageIndex}
          blockIndex={blockIndex}
          issues={issues}
          branchTargets={branchTargets}
          questionnaireKey={questionnaireKey}
          onChange={onChange}
        />
      );

    case "toggle":
    case "combobox":
      return (
        <div className="flex flex-col gap-3">
          {block.kind === "combobox" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Labelled label="Placeholder">
                <Input
                  value={block.placeholder ?? ""}
                  aria-label="Placeholder"
                  onChange={(e) =>
                    onChange({
                      ...block,
                      placeholder: e.target.value || undefined,
                    })
                  }
                />
              </Labelled>
              <Labelled label="Search box placeholder">
                <Input
                  value={block.searchPlaceholder ?? ""}
                  aria-label="Search box placeholder"
                  onChange={(e) =>
                    onChange({
                      ...block,
                      searchPlaceholder: e.target.value || undefined,
                    })
                  }
                />
              </Labelled>
            </div>
          ) : null}
          <LabelledValuesEditor
            title="Options"
            noun="Option"
            prefix="option"
            values={block.options}
            pageIndex={pageIndex}
            blockIndex={blockIndex}
            issues={issues}
            hint={
              block.kind === "toggle"
                ? "Shown as a row of buttons. Best with 2 to 4 options."
                : "Members type to find an option. Good for long lists."
            }
            onChange={(options) => onChange({ ...block, options })}
          />
        </div>
      );

    case "scale":
      return (
        <LabelledValuesEditor
          title="Steps"
          noun="Step"
          prefix="step"
          values={block.steps}
          pageIndex={pageIndex}
          blockIndex={blockIndex}
          issues={issues}
          hint="Members pick one step. List them from the top of the scale to the bottom."
          onChange={(steps) => onChange({ ...block, steps })}
        />
      );

    case "multi_choice_grid":
    case "checkbox_grid":
      return <GridBody block={block} onChange={onChange} />;

    case "short_text":
      return <ShortTextBody block={block} onChange={onChange} />;

    case "long_text":
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <Labelled label="Placeholder">
            <Input
              value={block.placeholder ?? ""}
              aria-label="Placeholder"
              onChange={(e) =>
                onChange({ ...block, placeholder: e.target.value || undefined })
              }
            />
          </Labelled>
          <Labelled label="Min length">
            <Input
              type="number"
              min={0}
              aria-label="Min length"
              value={block.minLength ?? ""}
              onChange={(e) =>
                onChange({
                  ...block,
                  minLength: numberOrUndefined(e.target.value),
                })
              }
            />
          </Labelled>
          <Labelled label="Max length">
            <Input
              type="number"
              min={1}
              aria-label="Max length"
              value={block.maxLength}
              onChange={(e) =>
                onChange({
                  ...block,
                  maxLength: Math.max(
                    1,
                    numberOr(e.target.value, block.maxLength),
                  ),
                })
              }
            />
          </Labelled>
        </div>
      );

    case "linear_scale":
      return (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Labelled label="Starts at">
              <Select
                value={String(block.min)}
                onValueChange={(v) =>
                  onChange({ ...block, min: v === "0" ? 0 : 1 })
                }
              >
                <SelectTrigger aria-label="Scale start">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0</SelectItem>
                  <SelectItem value="1">1</SelectItem>
                </SelectContent>
              </Select>
            </Labelled>
            <Labelled label="Ends at">
              <Select
                value={String(block.max)}
                onValueChange={(v) => onChange({ ...block, max: Number(v) })}
              >
                <SelectTrigger aria-label="Scale end">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Labelled>
          </div>
          <EndLabels block={block} onChange={onChange} />
        </div>
      );

    case "slider":
      return (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <Labelled label="Min">
              <Input
                type="number"
                aria-label="Min"
                value={block.min}
                onChange={(e) =>
                  onChange({
                    ...block,
                    min: numberOr(e.target.value, block.min),
                  })
                }
              />
            </Labelled>
            <Labelled label="Max">
              <Input
                type="number"
                aria-label="Max"
                value={block.max}
                onChange={(e) =>
                  onChange({
                    ...block,
                    max: numberOr(e.target.value, block.max),
                  })
                }
              />
            </Labelled>
            <Labelled label="Step">
              <Input
                type="number"
                min={0}
                aria-label="Step"
                value={block.step}
                onChange={(e) => {
                  const step = numberOr(e.target.value, block.step);
                  onChange({ ...block, step: step > 0 ? step : block.step });
                }}
              />
            </Labelled>
            <Labelled label="Shown as">
              <Select
                value={block.display ?? "continuous"}
                onValueChange={(v) =>
                  onChange({
                    ...block,
                    display: v as "continuous" | "segmented",
                  })
                }
              >
                <SelectTrigger aria-label="Slider display">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="continuous">A slider</SelectItem>
                  <SelectItem value="segmented">A row of numbers</SelectItem>
                </SelectContent>
              </Select>
            </Labelled>
          </div>
          <EndLabels block={block} onChange={onChange} />
        </div>
      );

    case "number":
      return (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Labelled label="Lowest number">
              <Input
                type="number"
                step={1}
                aria-label="Lowest number"
                value={block.min}
                onChange={(e) =>
                  onChange({
                    ...block,
                    min: Math.trunc(numberOr(e.target.value, block.min)),
                  })
                }
              />
            </Labelled>
            <Labelled label="Highest number">
              <Input
                type="number"
                step={1}
                aria-label="Highest number"
                value={block.max}
                onChange={(e) =>
                  onChange({
                    ...block,
                    max: Math.trunc(numberOr(e.target.value, block.max)),
                  })
                }
              />
            </Labelled>
          </div>
          <EndLabels block={block} onChange={onChange} />
          <p className="text-xs text-muted-foreground">
            Members tap one whole number in the range.
          </p>
        </div>
      );

    case "rating":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Labelled label="Steps">
            <Select
              value={String(block.steps)}
              onValueChange={(v) => onChange({ ...block, steps: Number(v) })}
            >
              <SelectTrigger aria-label="Rating steps">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Labelled>
          <Labelled label="Glyph">
            <Select
              value={block.glyph ?? "star"}
              onValueChange={(v) =>
                onChange({
                  ...block,
                  glyph: v as "star" | "heart" | "number",
                })
              }
            >
              <SelectTrigger aria-label="Rating glyph">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="star">Stars</SelectItem>
                <SelectItem value="heart">Hearts</SelectItem>
                <SelectItem value="number">Numbers</SelectItem>
              </SelectContent>
            </Select>
          </Labelled>
        </div>
      );

    case "file_link":
    case "email":
    case "phone":
      return (
        <Labelled
          label="Placeholder"
          hint={
            block.kind === "file_link"
              ? "Members paste a link to a file they keep somewhere else, such as Google Drive."
              : undefined
          }
        >
          <Input
            value={block.placeholder ?? ""}
            aria-label="Placeholder"
            onChange={(e) =>
              onChange({ ...block, placeholder: e.target.value || undefined })
            }
          />
        </Labelled>
      );

    case "image":
      return (
        <p className="text-xs text-muted-foreground">
          Members upload a photo from their phone or computer. Only the camp can
          see it.
        </p>
      );

    case "boolean":
    case "date":
    case "time":
    case "years":
      return null;
  }
}

function EndLabels({
  block,
  onChange,
}: {
  block: Extract<Question, { kind: "linear_scale" | "slider" | "number" }>;
  onChange: (next: PageBlock) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Labelled label={`Label for ${block.min}`}>
        <Input
          value={block.minLabel ?? ""}
          aria-label="Label for the lowest end"
          onChange={(e) =>
            onChange({ ...block, minLabel: e.target.value || undefined })
          }
          placeholder="e.g. Not at all"
        />
      </Labelled>
      <Labelled label={`Label for ${block.max}`}>
        <Input
          value={block.maxLabel ?? ""}
          aria-label="Label for the highest end"
          onChange={(e) =>
            onChange({ ...block, maxLabel: e.target.value || undefined })
          }
          placeholder="e.g. Completely"
        />
      </Labelled>
    </div>
  );
}

function ShortTextBody({
  block,
  onChange,
}: {
  block: Extract<Question, { kind: "short_text" }>;
  onChange: (next: PageBlock) => void;
}) {
  const numeric = block.format === "number" || block.format === "integer";
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Labelled label="Placeholder">
          <Input
            value={block.placeholder ?? ""}
            aria-label="Placeholder"
            onChange={(e) =>
              onChange({ ...block, placeholder: e.target.value || undefined })
            }
          />
        </Labelled>
        <Labelled
          label="Answer must be"
          hint="Checked on the server when the answer is sent."
        >
          <Select
            value={block.format ?? "text"}
            onValueChange={(v) => {
              const { format: _format, min: _min, max: _max, ...rest } = block;
              const nextNumeric = v === "number" || v === "integer";
              onChange({
                ...rest,
                // Plain text stores no format at all.
                ...(v === "text"
                  ? {}
                  : { format: v as NonNullable<typeof block.format> }),
                // min/max only mean anything for the numeric presets.
                ...(nextNumeric ? { min: block.min, max: block.max } : {}),
              } as PageBlock);
            }}
          >
            <SelectTrigger aria-label="Answer format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Any text</SelectItem>
              <SelectItem value="email">An email address</SelectItem>
              <SelectItem value="url">A link</SelectItem>
              <SelectItem value="phone">A phone number</SelectItem>
              <SelectItem value="telegram">A Telegram username</SelectItem>
              <SelectItem value="number">A number</SelectItem>
              <SelectItem value="integer">A whole number</SelectItem>
              <SelectItem value="alphanumeric">Letters and numbers</SelectItem>
            </SelectContent>
          </Select>
        </Labelled>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Labelled label="Min length">
          <Input
            type="number"
            min={0}
            aria-label="Min length"
            value={block.minLength ?? ""}
            onChange={(e) =>
              onChange({
                ...block,
                minLength: numberOrUndefined(e.target.value),
              })
            }
          />
        </Labelled>
        <Labelled label="Max length">
          <Input
            type="number"
            min={1}
            aria-label="Max length"
            value={block.maxLength}
            onChange={(e) =>
              onChange({
                ...block,
                maxLength: Math.max(
                  1,
                  numberOr(e.target.value, block.maxLength),
                ),
              })
            }
          />
        </Labelled>
        <Labelled label="Min value" hint={numeric ? undefined : "Numbers only"}>
          <Input
            type="number"
            disabled={!numeric}
            aria-label="Min value"
            value={block.min ?? ""}
            onChange={(e) =>
              onChange({ ...block, min: numberOrUndefined(e.target.value) })
            }
          />
        </Labelled>
        <Labelled label="Max value" hint={numeric ? undefined : "Numbers only"}>
          <Input
            type="number"
            disabled={!numeric}
            aria-label="Max value"
            value={block.max ?? ""}
            onChange={(e) =>
              onChange({ ...block, max: numberOrUndefined(e.target.value) })
            }
          />
        </Labelled>
      </div>
    </div>
  );
}

function ImageBlockBody({
  block,
  questionnaireKey,
  onChange,
}: {
  block: ImageBlock;
  questionnaireKey: string;
  onChange: (next: PageBlock) => void;
}) {
  const offsite =
    block.url.trim() !== "" && !isAllowedBuilderImageUrl(block.url);
  return (
    <div className="flex flex-col gap-3">
      <Labelled
        label="Image"
        hint="JPEG, PNG or WebP, up to 5 MB. Only pictures stored by Camp 404 can be shown."
      >
        <div className="flex flex-wrap items-center gap-3">
          {block.url && !offsite ? (
            <img
              src={block.url}
              alt=""
              className="h-16 w-24 rounded-md border border-border object-cover"
            />
          ) : null}
          <ImageUploadButton
            questionnaireKey={questionnaireKey}
            label={block.url ? "Replace the picture" : "Upload a picture"}
            onUploaded={(url) => onChange({ ...block, url })}
          />
        </div>
      </Labelled>
      <Labelled label="Picture link">
        <Input
          value={block.url}
          aria-label="Picture link"
          aria-invalid={offsite ? true : undefined}
          onChange={(e) => onChange({ ...block, url: e.target.value })}
          placeholder="Filled in when you upload"
        />
        {offsite ? (
          <span role="alert" className="text-xs text-destructive">
            This links to another website. Upload the picture instead.
          </span>
        ) : null}
      </Labelled>
      <div className="grid gap-3 sm:grid-cols-2">
        <Labelled
          label="Alt text"
          hint="Required. Describe the picture for people using screen readers."
        >
          <Input
            value={block.alt}
            aria-label="Alt text"
            onChange={(e) => onChange({ ...block, alt: e.target.value })}
            placeholder="What the image shows"
          />
        </Labelled>
        <Labelled label="Size and fit">
          <SegmentedControl
            aria-label="Image size and fit"
            options={[
              { value: "fit", label: "Fit" },
              { value: "fill", label: "Fill" },
              { value: "full-width", label: "Full width" },
            ]}
            value={block.sizeFit ?? "fit"}
            onValueChange={(v) =>
              onChange({ ...block, sizeFit: v as ImageBlock["sizeFit"] })
            }
          />
        </Labelled>
      </div>
    </div>
  );
}

function ChoiceBody({
  block,
  pageIndex,
  blockIndex,
  issues,
  branchTargets,
  questionnaireKey,
  onChange,
}: {
  block: Extract<Question, { kind: "single_select" | "multi_select" }>;
  pageIndex: number;
  blockIndex: number;
  issues: readonly LocatedIssue[];
  branchTargets: readonly BranchTarget[];
  questionnaireKey: string;
  onChange: (next: PageBlock) => void;
}) {
  const single = block.kind === "single_select";
  const showImages = block.display === "image_grid";
  // Branching is a single-choice-only affordance — the validator rejects a
  // `goTo` on checkboxes, so we never offer one.
  const canBranch = single;

  function setOptions(options: QuestionOption[]) {
    onChange({ ...block, options });
  }

  function setOption(optionIndex: number, next: QuestionOption) {
    const options = [...block.options];
    options[optionIndex] = next;
    setOptions(options);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Labelled label="Shown as">
          {single ? (
            <Select
              value={block.display ?? "radio"}
              onValueChange={(v) =>
                onChange({
                  ...block,
                  display: v as "radio" | "dropdown" | "image_grid",
                })
              }
            >
              <SelectTrigger aria-label="Choice display">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="radio">Radio buttons</SelectItem>
                <SelectItem value="dropdown">Dropdown</SelectItem>
                <SelectItem value="image_grid">Image grid</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Select
              value={block.display ?? "checkbox"}
              onValueChange={(v) =>
                onChange({ ...block, display: v as "checkbox" | "image_grid" })
              }
            >
              <SelectTrigger aria-label="Choice display">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="checkbox">Checkboxes</SelectItem>
                <SelectItem value="image_grid">Image grid</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Labelled>
        {!single ? (
          <div className="grid grid-cols-2 gap-3">
            <Labelled label="Min picks">
              <Input
                type="number"
                min={0}
                aria-label="Min picks"
                value={block.minSelections ?? ""}
                onChange={(e) =>
                  onChange({
                    ...block,
                    minSelections: numberOrUndefined(e.target.value),
                  })
                }
              />
            </Labelled>
            <Labelled label="Max picks">
              <Input
                type="number"
                min={1}
                aria-label="Max picks"
                value={block.maxSelections ?? ""}
                onChange={(e) =>
                  onChange({
                    ...block,
                    maxSelections: numberOrUndefined(e.target.value),
                  })
                }
              />
            </Labelled>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3">
        <span className="text-xs font-medium text-muted-foreground">
          Options
        </span>
        {block.options.map((option, optionIndex) => (
          <div key={option.value} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-start gap-2 sm:flex-nowrap">
              <Input
                value={option.label}
                onChange={(e) =>
                  setOption(optionIndex, { ...option, label: e.target.value })
                }
                placeholder={`Option ${optionIndex + 1}`}
                aria-label={`Option ${optionIndex + 1} label`}
                className="min-w-0 flex-1"
              />
              {canBranch ? (
                <Select
                  value={option.goTo ?? CONTINUE}
                  onValueChange={(v) =>
                    setOption(optionIndex, {
                      ...option,
                      goTo: v === CONTINUE ? undefined : v,
                    })
                  }
                >
                  <SelectTrigger
                    className="w-full sm:w-56 sm:shrink-0"
                    aria-label={`Where option ${optionIndex + 1} goes`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CONTINUE}>
                      Continue to next section
                    </SelectItem>
                    {withCurrentTarget(branchTargets, option.goTo).map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove option ${optionIndex + 1}`}
                disabled={block.options.length <= 2}
                onClick={() =>
                  setOptions(block.options.filter((_, j) => j !== optionIndex))
                }
              >
                <X aria-hidden />
              </Button>
            </div>
            {showImages ? (
              <div className="flex flex-wrap items-center gap-2 pl-1">
                {option.imageUrl ? (
                  <img
                    src={option.imageUrl}
                    alt=""
                    className="h-12 w-16 rounded-md border border-border object-cover"
                  />
                ) : null}
                <ImageUploadButton
                  questionnaireKey={questionnaireKey}
                  size="sm"
                  label={option.imageUrl ? "Replace picture" : "Add picture"}
                  ariaLabel={`Upload a picture for option ${optionIndex + 1}`}
                  onUploaded={(url) =>
                    setOption(optionIndex, { ...option, imageUrl: url })
                  }
                />
                {option.imageUrl ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const {
                        imageUrl: _url,
                        imageAlt: _alt,
                        ...rest
                      } = option;
                      setOption(optionIndex, rest);
                    }}
                  >
                    Remove picture
                  </Button>
                ) : null}
                <Input
                  value={option.imageAlt ?? ""}
                  onChange={(e) =>
                    setOption(optionIndex, {
                      ...option,
                      imageAlt: e.target.value || undefined,
                    })
                  }
                  placeholder="Picture alt text"
                  aria-label={`Option ${optionIndex + 1} picture alt text`}
                  className="min-w-[12rem] flex-1"
                />
              </div>
            ) : null}
            <div className="flex items-center gap-2 pl-1">
              <span className="font-mono text-[11px] text-muted-foreground">
                value: {option.value}
              </span>
              {option.goTo ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-accent">
                  <CornerDownRight className="h-3 w-3" aria-hidden />
                  {option.goTo === SUBMIT_TARGET
                    ? "goes to submit"
                    : `goes to ${option.goTo}`}
                </span>
              ) : null}
            </div>
            <IssueNote
              issues={optionIssues(issues, pageIndex, blockIndex, optionIndex)}
            />
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            setOptions([
              ...block.options,
              { value: allocateOptionValue(block.options), label: "" },
            ])
          }
        >
          <Plus aria-hidden />
          Add option
        </Button>
        {canBranch ? (
          <p className="text-xs text-muted-foreground">
            Branches only ever move forward — a member is never sent back into a
            section they already answered.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-border p-3">
        <ToggleRow
          label="Allow an “Other…” answer"
          hint="Adds a free-text option people can type into."
          checked={block.allowOther ?? false}
          onCheckedChange={(allowOther) =>
            onChange({ ...block, allowOther: allowOther || undefined })
          }
        />
        {block.allowOther ? (
          <Labelled label="“Other” label">
            <Input
              value={block.otherLabel ?? ""}
              aria-label="“Other” label"
              onChange={(e) =>
                onChange({ ...block, otherLabel: e.target.value || undefined })
              }
              placeholder="Other…"
            />
          </Labelled>
        ) : null}
        <ToggleRow
          label="Shuffle option order"
          hint="A different order for each member. Branches follow the option, not its position."
          checked={block.shuffleOptions ?? false}
          onCheckedChange={(shuffleOptions) =>
            onChange({ ...block, shuffleOptions: shuffleOptions || undefined })
          }
        />
      </div>
    </div>
  );
}

/** Options (or a scale's steps) with a label and a fixed value, no pictures. */
function LabelledValuesEditor({
  title,
  noun,
  prefix,
  values,
  pageIndex,
  blockIndex,
  issues,
  hint,
  onChange,
}: {
  title: string;
  noun: string;
  prefix: string;
  values: readonly { value: string; label: string }[];
  pageIndex: number;
  blockIndex: number;
  issues: readonly LocatedIssue[];
  hint: string;
  onChange: (next: { value: string; label: string }[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3">
      <span className="text-xs font-medium text-muted-foreground">{title}</span>
      {values.map((item, index) => (
        <div key={item.value} className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Input
              value={item.label}
              onChange={(e) =>
                onChange(
                  values.map((v, i) =>
                    i === index ? { ...v, label: e.target.value } : v,
                  ),
                )
              }
              placeholder={`${noun} ${index + 1}`}
              aria-label={`${noun} ${index + 1} label`}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${noun.toLowerCase()} ${index + 1}`}
              disabled={values.length <= 2}
              onClick={() => onChange(values.filter((_, j) => j !== index))}
            >
              <X aria-hidden />
            </Button>
          </div>
          <span className="pl-1 font-mono text-[11px] text-muted-foreground">
            value: {item.value}
          </span>
          {prefix === "option" ? (
            <IssueNote
              issues={optionIssues(issues, pageIndex, blockIndex, index)}
            />
          ) : null}
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() =>
          onChange([
            ...values,
            { value: allocateOptionValue(values, prefix), label: "" },
          ])
        }
      >
        <Plus aria-hidden />
        Add {noun.toLowerCase()}
      </Button>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function GridBody({
  block,
  onChange,
}: {
  block: Extract<Question, { kind: "multi_choice_grid" | "checkbox_grid" }>;
  onChange: (next: PageBlock) => void;
}) {
  const single = block.kind === "multi_choice_grid";

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {/* Rows — the labels down the left; each row keys the response map. */}
      <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3">
        <span className="text-xs font-medium text-muted-foreground">Rows</span>
        {block.rows.map((row, rowIndex) => (
          <div key={row.id} className="flex items-center gap-2">
            <Input
              value={row.label}
              onChange={(e) => {
                const rows = [...block.rows];
                rows[rowIndex] = { ...row, label: e.target.value };
                onChange({ ...block, rows });
              }}
              placeholder={`Row ${rowIndex + 1}`}
              aria-label={`Row ${rowIndex + 1} label`}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove row ${rowIndex + 1}`}
              disabled={block.rows.length <= 1}
              onClick={() =>
                onChange({
                  ...block,
                  rows: block.rows.filter((_, j) => j !== rowIndex),
                })
              }
            >
              <X aria-hidden />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            onChange({
              ...block,
              rows: [
                ...block.rows,
                { id: allocateRowId(block.rows), label: "" },
              ],
            })
          }
        >
          <Plus aria-hidden />
          Add row
        </Button>
      </div>

      {/* Columns — shared across every row. */}
      <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3">
        <span className="text-xs font-medium text-muted-foreground">
          Columns
        </span>
        {block.columns.map((column, columnIndex) => (
          <div key={column.value} className="flex items-center gap-2">
            <Input
              value={column.label}
              onChange={(e) => {
                const columns = [...block.columns];
                columns[columnIndex] = { ...column, label: e.target.value };
                onChange({ ...block, columns });
              }}
              placeholder={`Column ${columnIndex + 1}`}
              aria-label={`Column ${columnIndex + 1} label`}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove column ${columnIndex + 1}`}
              disabled={block.columns.length <= 1}
              onClick={() =>
                onChange({
                  ...block,
                  columns: block.columns.filter((_, j) => j !== columnIndex),
                })
              }
            >
              <X aria-hidden />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            onChange({
              ...block,
              columns: [
                ...block.columns,
                { value: allocateColumnValue(block.columns), label: "" },
              ],
            })
          }
        >
          <Plus aria-hidden />
          Add column
        </Button>
      </div>

      <p className="text-xs text-muted-foreground sm:col-span-2">
        {single
          ? "Members pick one column per row."
          : "Members can pick any number of columns per row."}{" "}
        {block.required ? "Every row must be answered." : "Rows are optional."}
      </p>
    </div>
  );
}
