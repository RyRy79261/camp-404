"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CircleAlert,
  CircleCheck,
  Eye,
  Globe,
  PenLine,
  Plus,
  Save,
  Send,
  Trash2,
  Undo2,
} from "lucide-react";
import { dutyCardProblem } from "@camp404/core";
import {
  DUTY_CARD_MAX,
  GUIDE_TITLE_MAX,
  type DutyCard,
  type DutyCardDraft,
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
import { cn } from "@camp404/ui/lib/utils";
import { ChapterView } from "./chapter-view";
import { MarkdownEditor } from "./markdown-editor";
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
  guideTopicOptions,
  guideTopicToSave,
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
  /** A guide topic, or a free-text one the Claude connector wrote. */
  category: string;
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

/**
 * The Write and Preview panes: the same frame and the same height, side by
 * side from a medium window up, where together they fill what the window has
 * left under the details (at least 18rem). On a phone the open tab fills the
 * screen under its sticky tabs. Each scrolls inside itself.
 */
const PANE =
  "h-[calc(100dvh-10rem)] min-w-0 page-md:h-[max(18rem,calc(100dvh-38rem))] flex-col overflow-hidden rounded-lg border border-border bg-card";

function PaneLabel({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <p className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
      {icon}
      {children}
    </p>
  );
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
  const [category, setCategory] = React.useState(initial.category);
  const topics = React.useMemo(
    () => guideTopicOptions(initial.category),
    [initial.category],
  );
  const [team, setTeam] = React.useState(initial.team);
  const [markdown, setMarkdown] = React.useState(initial.markdown);
  const card = initial.card;
  // A key typed before shifts linked to their cards (#250) is kept as it is,
  // unseen: each shift now picks its card in its own set-up.
  const legacyShiftKey = card?.shiftTypeKey;
  const [subRoles, setSubRoles] = React.useState<SubRoleRow[]>(
    (card?.subRoles ?? []).map((r, i) => ({
      key: i,
      name: r.name,
      min: String(r.min),
      max: String(r.max),
    })),
  );
  // Row ids the same on the server and in the browser (a module counter
  // would differ between the two and break hydration).
  const rowIds = React.useId();
  const rowCount = React.useRef(subRoles.length);
  const nextKey = () => rowCount.current++;
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
          ...(legacyShiftKey ? { shiftTypeKey: legacyShiftKey } : {}),
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
    category: guideTopicToSave(category),
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
      ? dutyCardProblem(cardDraft, markdown)
      : markdown.trim() === ""
        ? "Write something in the chapter before you publish it."
        : null;
  const [view, setView] = React.useState<"write" | "preview">("write");
  // The preview is the reader's own rendering (ChapterView), fed the card as
  // it stands: a half-written card shows what it has so far.
  const previewCard = cardDraft as DutyCard | null;
  const previewEmpty =
    markdown.trim() === "" &&
    (!cardDraft ||
      (cardDraft.subRoles.length === 0 &&
        cardDraft.steps.length === 0 &&
        cardDraft.hardRules.length === 0 &&
        cardDraft.checklist.length === 0 &&
        cardDraft.askRole === ""));
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
        <CardContent className="flex flex-col gap-3 p-4">
          {mode.kind === "new" ? (
            <Field
              label="What are you writing?"
              htmlFor="chapter-kind"
              help={
                kind === "duty_card"
                  ? "A duty card is pinned up on site: who is on the shift, the steps, the hard rules and the lead's checklist."
                  : "A chapter is text with headings, lists and links, like a page in a book."
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

          <div className="grid grid-cols-2 gap-3">
            <Field label="Topic" htmlFor="chapter-topic" required>
              <Select
                value={category}
                onValueChange={setCategory}
                disabled={pending}
              >
                <SelectTrigger id="chapter-topic" className="text-left">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {topics.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Team" htmlFor="chapter-team" required>
              <Select value={team} onValueChange={setTeam} disabled={pending}>
                <SelectTrigger id="chapter-team" className="text-left">
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
          <p className="text-xs text-muted-foreground">
            {canPickWholeCamp
              ? "A team's leads can edit its chapters too. A whole-camp chapter is the captains'."
              : "You can write chapters for the teams you lead this year."}
          </p>
        </CardContent>
      </Card>

      <section
        aria-label="Write and preview"
        className="flex min-w-0 flex-col gap-3"
      >
        {/* On a phone the writing and the preview are two tabs, kept at the
            top while the page scrolls; from a medium window up the two panes
            sit side by side and the tabs go. */}
        <div className="sticky top-0 z-10 bg-background py-1 page-md:hidden">
          <SegmentedControl
            aria-label="Write or preview"
            value={view}
            onValueChange={(v) =>
              setView(v === "preview" ? "preview" : "write")
            }
            options={[
              { value: "write", label: "Write" },
              { value: "preview", label: "Preview" },
            ]}
          />
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 page-md:grid-cols-2">
          <div
            data-testid="write-panel"
            className={cn(
              PANE,
              view === "write" ? "flex" : "hidden page-md:flex",
            )}
          >
            <PaneLabel icon={<PenLine className="h-3 w-3" aria-hidden />}>
              Write
            </PaneLabel>
            {kind === "duty_card" ? (
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
                <p className="text-xs text-muted-foreground">
                  The card is pinned up where anyone can read it: name roles,
                  never phone numbers.
                </p>
                <p className="text-xs text-muted-foreground">
                  Which shifts use it is set on Shifts: each shift&apos;s set-up
                  picks its duty card.
                </p>
                <div className="grid gap-4 page-sm:grid-cols-2">
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
                      <li
                        aria-hidden
                        className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_2.25rem] gap-2 text-xs font-medium text-muted-foreground"
                      >
                        <span>Job</span>
                        <span>Fewest</span>
                        <span>Most</span>
                        <span />
                      </li>
                      {subRoles.map((r, index) => (
                        <li
                          key={r.key}
                          className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_2.25rem] items-center gap-2"
                        >
                          <Input
                            id={`${rowIds}-role-name-${r.key}`}
                            aria-label="Job"
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

                          <Input
                            id={`${rowIds}-role-min-${r.key}`}
                            aria-label="Fewest"
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

                          <Input
                            id={`${rowIds}-role-max-${r.key}`}
                            aria-label="Most"
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
                <Field
                  label="Good to know (optional)"
                  htmlFor="chapter-body"
                  help="Anything else the shift should know."
                >
                  <MarkdownEditor
                    value={markdown}
                    onChange={setMarkdown}
                    ariaLabel="Good to know"
                    describedBy="chapter-body-help"
                    disabled={pending}
                  />
                </Field>
              </div>
            ) : (
              <div className="min-h-0 flex-1">
                <MarkdownEditor
                  fill
                  value={markdown}
                  onChange={setMarkdown}
                  ariaLabel="The chapter"
                  disabled={pending}
                />
              </div>
            )}
          </div>
          <div
            data-testid="preview-panel"
            className={cn(
              PANE,
              view === "preview" ? "flex" : "hidden page-md:flex",
            )}
          >
            <PaneLabel icon={<Eye className="h-3 w-3" aria-hidden />}>
              Preview: as members read it
            </PaneLabel>
            <div className="min-h-0 flex-1 overflow-y-auto bg-background p-4">
              {previewEmpty ? (
                <p className="text-sm text-muted-foreground">
                  Nothing to show yet. Start writing and it appears here.
                </p>
              ) : (
                <ChapterView
                  kind={kind}
                  card={previewCard}
                  markdown={markdown}
                  bare
                />
              )}
            </div>
          </div>
        </div>
      </section>

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
