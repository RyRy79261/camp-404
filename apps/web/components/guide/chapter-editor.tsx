"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CircleAlert,
  CircleCheck,
  Globe,
  Plus,
  Save,
  Send,
  Trash2,
  Undo2,
} from "lucide-react";
import { dutyCardProblem } from "@camp404/core";
import {
  DUTY_CARD_MAX,
  GUIDE_CATEGORIES,
  GUIDE_CATEGORY_LABELS,
  GUIDE_TITLE_MAX,
  type DutyCardDraft,
  type GuideCategory,
} from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { Field } from "@camp404/ui/components/field";
import { Input } from "@camp404/ui/components/input";
import { SegmentedControl } from "@camp404/ui/components/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@camp404/ui/components/select";
import { Switch } from "@camp404/ui/components/switch";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import {
  MarkdownHint,
  MarkdownPreview,
} from "@/components/announcements/markdown-body";
import {
  createGuideChapterAction,
  publishGuideChapterAction,
  saveGuideChapterAction,
  setGuideChapterPublicAction,
  unpublishGuideChapterAction,
} from "@/app/(console)/guide/actions";
import {
  guideChapterPath,
  guideEditPath,
  KIND_LABEL,
  WHOLE_CAMP_LABEL,
} from "@/lib/guide-copy";

// The Survival Guide's editor (#250), laid out like the meeting editor: the
// fields in cards, Markdown with the announcements' live preview, then the
// footer with Save draft and Publish. A duty card adds its parts, one card
// each, and says beside Publish what is still missing. The form's checks are a
// convenience: the action checks the shape, and the write checks the writer
// and the card again inside its transaction.

/** The Team select's value for a whole-camp chapter. */
export const WHOLE_CAMP = "camp";

export interface ChapterEditorTeam {
  value: string;
  label: string;
}

export interface ChapterEditorValues {
  kind: "chapter" | "duty_card";
  title: string;
  category: GuideCategory;
  /** A team key, or WHOLE_CAMP. */
  team: string;
  markdown: string;
  card: DutyCardDraft | null;
}

export type ChapterEditorMode =
  | { kind: "new" }
  | {
      kind: "edit";
      slug: string;
      /** The save the page read; each save moves it on. */
      version: number;
      published: boolean;
      /** Has ever been published (so it has versions). */
      everPublished: boolean;
      changedSincePublish: boolean;
      public: boolean;
    };

interface SubRoleRow {
  key: number;
  name: string;
  min: string;
  max: string;
}

let rowKey = 0;
const nextKey = () => ++rowKey;

const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

function headcount(text: string): number {
  const n = Number.parseInt(text, 10);
  return Number.isFinite(n)
    ? Math.max(0, Math.min(n, DUTY_CARD_MAX.headcount))
    : 0;
}

export function ChapterEditor({
  mode,
  initial,
  teams,
  canPickWholeCamp,
  canSetPublic,
}: {
  mode: ChapterEditorMode;
  initial: ChapterEditorValues;
  /** The teams this writer may write for. */
  teams: ChapterEditorTeam[];
  canPickWholeCamp: boolean;
  /** A captain: may mark the chapter Public. */
  canSetPublic: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [kind, setKind] = React.useState(initial.kind);
  const [title, setTitle] = React.useState(initial.title);
  const [category, setCategory] = React.useState<GuideCategory>(
    initial.category,
  );
  const [team, setTeam] = React.useState(initial.team);
  const [markdown, setMarkdown] = React.useState(initial.markdown);
  const card = initial.card;
  const [shiftKey, setShiftKey] = React.useState(card?.shiftTypeKey ?? "");
  const [subRoles, setSubRoles] = React.useState<SubRoleRow[]>(
    (card?.subRoles ?? []).map((r) => ({
      key: nextKey(),
      name: r.name,
      min: String(r.min),
      max: String(r.max),
    })),
  );
  const [steps, setSteps] = React.useState((card?.steps ?? []).join("\n"));
  const [rules, setRules] = React.useState((card?.hardRules ?? []).join("\n"));
  const [checklist, setChecklist] = React.useState(
    (card?.checklist ?? []).join("\n"),
  );
  const [askRole, setAskRole] = React.useState(card?.askRole ?? "");
  const [isPublic, setIsPublic] = React.useState(
    mode.kind === "edit" && mode.public,
  );
  const [publicPending, setPublicPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [titleError, setTitleError] = React.useState<string | null>(null);

  const cardDraft: DutyCardDraft | null =
    kind === "duty_card"
      ? {
          shiftTypeKey: shiftKey.trim(),
          subRoles: subRoles
            .filter((r) => r.name.trim() || r.min || r.max)
            .map((r) => ({
              name: r.name.trim(),
              min: headcount(r.min),
              max: headcount(r.max),
            })),
          steps: lines(steps),
          hardRules: lines(rules),
          checklist: lines(checklist),
          askRole: askRole.trim(),
        }
      : null;
  const fields = {
    title,
    category,
    team: team === WHOLE_CAMP ? null : team,
    markdown,
    card: cardDraft,
  };
  const snapshot = JSON.stringify(fields);
  const [savedSnapshot, setSavedSnapshot] = React.useState(snapshot);
  const [version, setVersion] = React.useState(
    mode.kind === "edit" ? mode.version : 0,
  );
  const dirty = mode.kind === "new" || snapshot !== savedSnapshot;
  const problem =
    kind === "duty_card"
      ? dutyCardProblem(cardDraft)
      : markdown.trim() === ""
        ? "Write something in the chapter before you publish it."
        : null;
  const teamLabel =
    team === WHOLE_CAMP
      ? WHOLE_CAMP_LABEL
      : (teams.find((t) => t.value === team)?.label ?? team);

  /** Save the draft; the save count to publish on, or null on a refusal. */
  async function save(): Promise<{ slug: string; version: number } | null> {
    if (title.trim() === "") {
      setTitleError("Give the chapter a title.");
      return null;
    }
    setTitleError(null);
    if (mode.kind === "new") {
      const result = await createGuideChapterAction({ kind, ...fields });
      if (!result.ok) {
        setError(result.error);
        return null;
      }
      return { slug: result.data.slug, version: 1 };
    }
    if (!dirty) return { slug: mode.slug, version };
    const result = await saveGuideChapterAction({
      slug: mode.slug,
      expectedVersion: version,
      ...fields,
    });
    if (!result.ok) {
      setError(result.error);
      return null;
    }
    setVersion(result.data.version);
    setSavedSnapshot(snapshot);
    return { slug: mode.slug, version: result.data.version };
  }

  function saveDraft(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const saved = await save();
      if (!saved) return;
      toast.success("Draft saved");
      if (mode.kind === "new") router.push(guideEditPath(saved.slug));
      router.refresh();
    });
  }

  function publish() {
    setError(null);
    if (problem) {
      setError(problem);
      return;
    }
    startTransition(async () => {
      const saved = await save();
      if (!saved) return;
      const result = await publishGuideChapterAction({
        slug: saved.slug,
        expectedVersion: saved.version,
      });
      if (!result.ok) {
        setError(result.error);
        if (mode.kind === "new") router.push(guideEditPath(saved.slug));
        return;
      }
      toast.success(
        result.data.created
          ? `Published as version ${result.data.version}`
          : "Back on the guide",
      );
      router.push(guideChapterPath(saved.slug));
      router.refresh();
    });
  }

  function takeOff() {
    if (mode.kind !== "edit") return;
    setError(null);
    startTransition(async () => {
      const result = await unpublishGuideChapterAction({ slug: mode.slug });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Taken off the guide");
      router.refresh();
    });
  }

  async function changePublic(next: boolean) {
    if (mode.kind !== "edit") return;
    setPublicPending(true);
    const result = await setGuideChapterPublicAction({
      slug: mode.slug,
      public: next,
    });
    setPublicPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setIsPublic(next);
    toast.success(next ? "Marked public" : "Members only");
  }

  return (
    <form
      onSubmit={saveDraft}
      noValidate
      className="flex min-w-0 flex-col gap-6"
    >
      <Card>
        <CardContent className="flex flex-col gap-5 p-5">
          {mode.kind === "new" ? (
            <Field
              label="What are you writing?"
              htmlFor="chapter-kind"
              help={
                kind === "duty_card"
                  ? "A duty card is pinned up on site: who is on the shift, the steps, the hard rules and the lead's checklist."
                  : "A chapter is Markdown: headings, lists, bold."
              }
            >
              <SegmentedControl
                id="chapter-kind"
                aria-label="What are you writing?"
                value={kind}
                onValueChange={(v) =>
                  setKind(v === "duty_card" ? "duty_card" : "chapter")
                }
                options={[
                  { value: "chapter", label: KIND_LABEL.chapter },
                  { value: "duty_card", label: KIND_LABEL.duty_card },
                ]}
                disabled={pending}
              />
            </Field>
          ) : null}

          <Field
            label="Title"
            htmlFor="chapter-title"
            required
            error={titleError}
          >
            <Input
              id="chapter-title"
              value={title}
              maxLength={GUIDE_TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                kind === "duty_card" ? "e.g. Morning clean" : "e.g. Driving in"
              }
              disabled={pending}
              required
            />
          </Field>

          <div className="grid gap-5 page-sm:grid-cols-2">
            <Field label="Topic" htmlFor="chapter-topic" required>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as GuideCategory)}
                disabled={pending}
              >
                <SelectTrigger id="chapter-topic">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GUIDE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {GUIDE_CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="Team"
              htmlFor="chapter-team"
              required
              help={
                canPickWholeCamp
                  ? "Its team's leads can edit it too. A whole-camp chapter is the captains'."
                  : "A team you lead this year."
              }
            >
              <Select value={team} onValueChange={setTeam} disabled={pending}>
                <SelectTrigger id="chapter-team">
                  <SelectValue>{teamLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {canPickWholeCamp ? (
                    <SelectItem value={WHOLE_CAMP}>
                      {WHOLE_CAMP_LABEL}
                    </SelectItem>
                  ) : null}
                  {teams.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </CardContent>
      </Card>

      {kind === "duty_card" ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">The duty card</CardTitle>
            <CardDescription>
              Name roles, never phone numbers: the card is pinned up where
              anyone can read it.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="grid gap-5 page-sm:grid-cols-2">
              <Field
                label="Shift type"
                htmlFor="card-shift"
                required
                help="The shift's short name, like morning-clean."
              >
                <Input
                  id="card-shift"
                  value={shiftKey}
                  maxLength={DUTY_CARD_MAX.shiftTypeKey}
                  onChange={(e) => setShiftKey(e.target.value)}
                  disabled={pending}
                />
              </Field>
              <Field
                label="Who to ask"
                htmlFor="card-ask"
                required
                help="A role, like the Sanitation lead."
              >
                <Input
                  id="card-ask"
                  value={askRole}
                  maxLength={DUTY_CARD_MAX.askRole}
                  onChange={(e) => setAskRole(e.target.value)}
                  disabled={pending}
                />
              </Field>
            </div>

            <section
              aria-labelledby="card-roles"
              className="flex flex-col gap-2"
            >
              <h2
                id="card-roles"
                className="text-sm font-medium leading-none text-foreground"
              >
                Sub-roles
              </h2>
              {subRoles.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Add the jobs on this shift, like Dishes for 2 to 3 people.
                </p>
              ) : (
                <ol className="flex flex-col gap-2">
                  {subRoles.map((r, index) => (
                    <li
                      key={r.key}
                      className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_auto] items-end gap-2"
                    >
                      <Field label="Job" htmlFor={`role-name-${r.key}`}>
                        <Input
                          id={`role-name-${r.key}`}
                          value={r.name}
                          maxLength={DUTY_CARD_MAX.name}
                          onChange={(e) =>
                            setSubRoles((all) =>
                              all.map((x) =>
                                x.key === r.key
                                  ? { ...x, name: e.target.value }
                                  : x,
                              ),
                            )
                          }
                          disabled={pending}
                        />
                      </Field>
                      <Field label="Fewest" htmlFor={`role-min-${r.key}`}>
                        <Input
                          id={`role-min-${r.key}`}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={DUTY_CARD_MAX.headcount}
                          value={r.min}
                          onChange={(e) =>
                            setSubRoles((all) =>
                              all.map((x) =>
                                x.key === r.key
                                  ? { ...x, min: e.target.value }
                                  : x,
                              ),
                            )
                          }
                          disabled={pending}
                        />
                      </Field>
                      <Field label="Most" htmlFor={`role-max-${r.key}`}>
                        <Input
                          id={`role-max-${r.key}`}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={DUTY_CARD_MAX.headcount}
                          value={r.max}
                          onChange={(e) =>
                            setSubRoles((all) =>
                              all.map((x) =>
                                x.key === r.key
                                  ? { ...x, max: e.target.value }
                                  : x,
                              ),
                            )
                          }
                          disabled={pending}
                        />
                      </Field>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove sub-role ${index + 1}`}
                        onClick={() =>
                          setSubRoles((all) =>
                            all.filter((x) => x.key !== r.key),
                          )
                        }
                        disabled={pending}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ol>
              )}
              {subRoles.length < DUTY_CARD_MAX.subRoles ? (
                <Button
                  type="button"
                  variant="outline"
                  className="self-start"
                  onClick={() =>
                    setSubRoles((all) => [
                      ...all,
                      { key: nextKey(), name: "", min: "1", max: "1" },
                    ])
                  }
                  disabled={pending}
                >
                  <Plus aria-hidden />
                  Add sub-role
                </Button>
              ) : null}
            </section>

            <Field
              label="Steps"
              htmlFor="card-steps"
              required
              help="One step per line, in order."
            >
              <Textarea
                id="card-steps"
                value={steps}
                rows={6}
                onChange={(e) => setSteps(e.target.value)}
                disabled={pending}
              />
            </Field>
            <Field
              label="Hard rules"
              htmlFor="card-rules"
              help="One per line. They are shown in red."
            >
              <Textarea
                id="card-rules"
                value={rules}
                rows={3}
                onChange={(e) => setRules(e.target.value)}
                disabled={pending}
              />
            </Field>
            <Field
              label="Lead's end-of-shift checklist"
              htmlFor="card-checklist"
              help="One per line: what the shift lead checks before handing over."
            >
              <Textarea
                id="card-checklist"
                value={checklist}
                rows={4}
                onChange={(e) => setChecklist(e.target.value)}
                disabled={pending}
              />
            </Field>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="flex flex-col gap-2 p-5">
          <Field
            label={
              kind === "duty_card" ? "Good to know (optional)" : "The chapter"
            }
            htmlFor="chapter-markdown"
          >
            <Textarea
              id="chapter-markdown"
              value={markdown}
              rows={kind === "duty_card" ? 4 : 14}
              onChange={(e) => setMarkdown(e.target.value)}
              aria-describedby="chapter-markdown-hint"
              disabled={pending}
            />
          </Field>
          <MarkdownHint id="chapter-markdown-hint" />
          <MarkdownPreview body={markdown} />
        </CardContent>
      </Card>

      {mode.kind === "edit" ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4 text-accent" aria-hidden />
              Who can read it
            </CardTitle>
            <CardDescription>
              Every approved member reads a published chapter. Captains can mark
              one public for the guide&apos;s own site, which is not built yet:
              nothing is shown outside the camp today.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {canSetPublic ? (
              <label className="flex items-center gap-3 text-sm">
                <Switch
                  checked={isPublic}
                  onCheckedChange={changePublic}
                  disabled={publicPending}
                  aria-label="Public"
                />
                {isPublic ? "Public" : "Members only"}
              </label>
            ) : (
              <p className="text-sm">
                {isPublic ? "Public (a captain's mark)" : "Members only"}
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-border pt-4 page-sm:flex-row page-sm:items-center page-sm:justify-between">
        <p
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
          aria-live="polite"
        >
          {problem ? (
            <>
              <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Not ready to publish: {problem}
            </>
          ) : (
            <>
              <CircleCheck
                className="h-3.5 w-3.5 shrink-0 text-success"
                aria-hidden
              />
              {mode.kind === "edit" &&
              mode.published &&
              !dirty &&
              !mode.changedSincePublish
                ? "Members read this version."
                : "Ready to publish. Members read it once you do."}
            </>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {mode.kind === "edit" && mode.published ? (
            <Button
              type="button"
              variant="ghost"
              onClick={takeOff}
              disabled={pending}
            >
              <Undo2 aria-hidden />
              Take off the guide
            </Button>
          ) : null}
          <Button type="submit" variant="outline" disabled={pending}>
            <Save aria-hidden />
            {pending ? "Saving…" : "Save draft"}
          </Button>
          <Button type="button" onClick={publish} disabled={pending}>
            <Send aria-hidden />
            Publish
          </Button>
        </div>
      </div>
    </form>
  );
}
