"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  GripVertical,
  Layers,
  Loader2,
  Plus,
  Tent,
  Trash2,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  definitionLimitErrors,
  validateQuestionnaireDefinition,
  type DefinitionIssue,
} from "@camp404/core";
import {
  Questionnaire,
  SUBMIT_TARGET,
  flattenQuestions,
  pageBlocks,
  type PageBlock,
  type QuestionnairePage,
  type VisibleIf,
} from "@camp404/types";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { useConfirm } from "@camp404/ui/components/confirm-dialog";
import { Input } from "@camp404/ui/components/input";
import { Textarea } from "@camp404/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@camp404/ui/components/select";
import { toast } from "@camp404/ui/components/toast";
import { cn } from "@camp404/ui/lib/utils";

import {
  BlockEditor,
  withCurrentTarget,
  type BranchTarget,
} from "./block-editor";
import {
  PALETTE,
  PALETTE_BY_KIND,
  allocateId,
  blockLabel,
  blockPaletteKind,
  convertBlock,
  createBlock,
  createSection,
  duplicateBlock,
  idPrefixFor,
  takenIds,
  type PaletteKind,
} from "./block-kinds";
import {
  DefinitionIssuePanel,
  IssueNote,
  blockAnchor,
  locateIssues,
  questionnaireIssues,
  sectionAnchor,
  sectionIssues,
  type LocatedIssue,
} from "./definition-issues";
import { Labelled, ToggleRow } from "./editor-parts";
import { VisibilityEditor } from "./visibility-editor";
import { fieldsBefore } from "./visibility";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import {
  publishAction,
  updateDefinitionAction,
} from "@/app/(console)/captains/questionnaires/actions";
import { LifecycleRail } from "@/app/(console)/captains/questionnaires/[key]/lifecycle-controls";

// The questionnaire builder (AfrikaBurn's Builder v2 — "Google Forms parity").
//
// The editor state IS the definition: a unified `Questionnaire` mutated
// immutably. That buys two things for free — question ids never drift on
// reorder (we move the object, not a projection of it), and @camp404/core's
// `validateQuestionnaireDefinition` can be run against the live draft to place
// its issues inline. Nothing here re-implements validation, branching or
// reachability; the engine owns all three.
//
// Camp 404 differences, each kept on purpose:
//   * A draft is saved by "Save draft" and may be half-built; only a question
//     or option with no words stops a save (the draft schema). Publishing runs
//     every rule, on the server, and its refusals show beside the blocks.
//   * Publishing is its own step in the right rail, captain-only, and the
//     audience is chosen afterwards on the Send page.
//   * Deleting a block or a section asks first. Leaving with unsaved changes
//     asks first.
//   * Blocks also reorder by dragging (keyboard too), not only by arrows.

const CONTINUE = "__continue__";

export interface BuilderV2Initial {
  key: string;
  definition: Questionnaire;
  status: "draft" | "published" | "unpublished";
  /** The latest published version, or null before the first publish. */
  version: string | null;
}

type SaveState = "idle" | "saving" | "saved" | "error";

function sectionLabel(page: QuestionnairePage, index: number): string {
  const title = page.kind === "questions" ? page.title : page.heading;
  return `${index + 1}. ${title?.trim() || "Untitled section"}`;
}

const LEAVE_CONFIRM = {
  title: "Leave without saving?",
  description:
    "Your changes to this questionnaire are not saved. If you leave now, they are lost.",
  confirmLabel: "Leave without saving",
  cancelLabel: "Stay",
  destructive: true,
} as const;

/**
 * While there are unsaved changes: the browser asks before a reload or a tab
 * close, and a click on any in-app link asks with the camp's own dialog first.
 */
function useLeaveGuard(
  dirty: boolean,
  confirm: (options: typeof LEAVE_CONFIRM) => Promise<boolean>,
) {
  const router = useRouter();
  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (
        !anchor ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      ) {
        return;
      }
      const url = new URL(anchor.href, window.location.href);
      // Another site unloads the page, which the browser's own prompt covers.
      if (url.origin !== window.location.origin) return;
      // A link to a place on this page (an issue's anchor) leaves nothing.
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      void confirm(LEAVE_CONFIRM).then((leave) => {
        if (leave) router.push(`${url.pathname}${url.search}${url.hash}`);
      });
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, confirm, router]);
}

export function QuestionnaireBuilderV2({
  initial,
  isCaptain,
  openActivationId = null,
  openActivationBlocking = null,
}: {
  initial: BuilderV2Initial;
  /** Captains publish; team leads author their own drafts. */
  isCaptain: boolean;
  openActivationId?: string | null;
  openActivationBlocking?: boolean | null;
}) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [confirm, confirmDialog] = useConfirm();
  const questionnaireKey = initial.key;

  const [draft, setDraft] = React.useState<Questionnaire>(initial.definition);
  // Edits count up; a save records the count it wrote. Unsaved = they differ,
  // so an edit made while a save is in flight stays unsaved.
  const [edits, setEdits] = React.useState(0);
  const [savedEdits, setSavedEdits] = React.useState(0);
  const dirty = edits !== savedEdits;
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [busy, setBusy] = React.useState<"save" | "publish" | null>(null);
  const [activeSection, setActiveSection] = React.useState(0);
  const [focusTarget, setFocusTarget] = React.useState<string | null>(null);

  // Which rules the panel shows: none until the author tries a save or a
  // publish, then the live result of that step's rules, so a fix clears its
  // issue as it is typed. A refused publish shows the server's issues until the
  // next edit.
  const [showIssues, setShowIssues] = React.useState<"save" | "publish" | null>(
    null,
  );
  const [serverIssues, setServerIssues] = React.useState<
    DefinitionIssue[] | null
  >(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  useLeaveGuard(dirty, confirm);

  const liveIssues = React.useMemo<DefinitionIssue[]>(() => {
    const result = validateQuestionnaireDefinition(draft);
    return result.ok ? [] : result.issues;
  }, [draft]);
  const saveBlockers = React.useMemo(
    () => liveIssues.filter((issue) => issue.code === "shape"),
    [liveIssues],
  );
  const shown =
    serverIssues ??
    (showIssues === "save"
      ? saveBlockers
      : showIssues === "publish"
        ? liveIssues
        : []);
  const issues = React.useMemo(
    () => locateIssues(shown, draft),
    [shown, draft],
  );

  const sectionTitles = draft.pages.map((p) =>
    p.kind === "questions" ? p.title : p.heading,
  );

  // Move focus to what was just added, and bring it into view.
  React.useEffect(() => {
    if (!focusTarget) return;
    const element = document.getElementById(focusTarget);
    setFocusTarget(null);
    if (!element) return;
    element.scrollIntoView?.({
      block: "center",
      behavior: reducedMotion ? "auto" : "smooth",
    });
    const field = element.querySelector<HTMLElement>(
      "input:not([type=hidden]):not([disabled]), textarea",
    );
    field?.focus({ preventScroll: true });
  }, [focusTarget, reducedMotion]);

  // --- draft mutation ----------------------------------------------------

  function update(change: (prev: Questionnaire) => Questionnaire) {
    setDraft(change);
    setEdits((n) => n + 1);
    setServerIssues(null);
    setSaveState((s) => (s === "saving" ? s : "idle"));
  }

  function updatePage(index: number, next: QuestionnairePage) {
    update((prev) => ({
      ...prev,
      pages: prev.pages.map((p, i) => (i === index ? next : p)),
    }));
  }

  function updateBlocks(pageIndex: number, blocks: PageBlock[]) {
    update((prev) => ({
      ...prev,
      pages: prev.pages.map((page, i) =>
        i === pageIndex && page.kind === "questions"
          ? { ...page, questions: blocks }
          : page,
      ),
    }));
  }

  function setTitle(title: string) {
    update((prev) => ({
      ...prev,
      title,
      // A first section still named after the questionnaire follows a rename,
      // as AfrikaBurn's does; one the author renamed keeps its own title.
      pages: prev.pages.map((page, i) =>
        i === 0 &&
        page.kind === "questions" &&
        page.title === (prev.title ?? "")
          ? { ...page, title }
          : page,
      ),
    }));
  }

  function setDescription(description: string) {
    update((prev) => ({
      ...prev,
      pages: prev.pages.map((page, i) =>
        i === 0 && page.kind === "questions"
          ? { ...page, subtitle: description || undefined }
          : page,
      ),
    }));
  }

  function addBlock(kind: PaletteKind, pageIndex = activeSection) {
    const target = Math.min(pageIndex, draft.pages.length - 1);
    const page = draft.pages[target];
    if (!page || page.kind !== "questions") return;
    const id = allocateId(idPrefixFor(kind), takenIds(draft));
    update((prev) => ({
      ...prev,
      pages: prev.pages.map((p, i) =>
        i === target && p.kind === "questions"
          ? { ...p, questions: [...p.questions, createBlock(kind, id)] }
          : p,
      ),
    }));
    setActiveSection(target);
    setFocusTarget(blockAnchor(id));
  }

  function addSection() {
    const id = allocateId("section", takenIds(draft));
    const section = createSection(id, draft.pages.length);
    update((prev) => ({ ...prev, pages: [...prev.pages, section] }));
    setActiveSection(draft.pages.length);
    setFocusTarget(sectionAnchor(section));
  }

  function moveSection(index: number, delta: number) {
    update((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.pages.length) return prev;
      return { ...prev, pages: arrayMove(prev.pages, index, target) };
    });
    setActiveSection(index + delta);
  }

  async function removeSection(index: number) {
    const page = draft.pages[index];
    if (!page || draft.pages.length <= 1) return;
    const blocks = pageBlocks(page).length;
    const sure = await confirm({
      title: `Delete section ${index + 1}?`,
      description:
        blocks === 0
          ? "It has no blocks."
          : `Its ${blocks === 1 ? "1 block goes" : `${blocks} blocks go`} with it.`,
      confirmLabel: "Delete section",
      destructive: true,
    });
    if (!sure) return;
    update((prev) =>
      prev.pages.length <= 1
        ? prev
        : { ...prev, pages: prev.pages.filter((p) => p.id !== page.id) },
    );
    setActiveSection(0);
  }

  async function removeBlock(pageIndex: number, blockId: string) {
    const page = draft.pages[pageIndex];
    if (!page) return;
    const blockIndex = pageBlocks(page).findIndex((b) => b.id === blockId);
    const block = pageBlocks(page)[blockIndex];
    if (!block) return;
    const sure = await confirm({
      title: `Delete “${blockLabel(block, blockIndex)}”?`,
      description:
        "It leaves this draft now, and the questionnaire when you save.",
      confirmLabel: "Delete block",
      destructive: true,
    });
    if (!sure) return;
    update((prev) => ({
      ...prev,
      pages: prev.pages.map((p) =>
        p.id === page.id && p.kind === "questions"
          ? { ...p, questions: p.questions.filter((b) => b.id !== blockId) }
          : p,
      ),
    }));
  }

  // --- save and publish ---------------------------------------------------

  async function saveDraft(): Promise<boolean> {
    // The draft rules first, here, so the author sees each unwritten question
    // where it is; the server applies the same rules and bounds again.
    const parsed = Questionnaire.safeParse(draft);
    if (!parsed.success) {
      setShowIssues("save");
      toast.error("Not saved", {
        description:
          saveBlockers.length === 1
            ? "1 problem is blocking this save."
            : `${saveBlockers.length} problems are blocking this save.`,
      });
      panelRef.current?.focus();
      return false;
    }
    const tooBig = definitionLimitErrors(parsed.data);
    if (tooBig.length > 0) {
      toast.error("Not saved", { description: tooBig[0] });
      return false;
    }

    const writing = edits;
    setBusy("save");
    setSaveState("saving");
    try {
      const result = await updateDefinitionAction(questionnaireKey, draft);
      if (!result.ok) {
        setSaveState("error");
        toast.error("Not saved", { description: result.error });
        return false;
      }
      setSavedEdits(writing);
      setSaveState("saved");
      setShowIssues((s) => (s === "save" ? null : s));
      return true;
    } catch {
      setSaveState("error");
      toast.error("Not saved", {
        description: "We couldn't reach the server. Try again.",
      });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    if (dirty && !(await saveDraft())) return;
    setBusy("publish");
    try {
      const result = await publishAction(questionnaireKey);
      if (!result.ok) {
        if (result.issues.length > 0) {
          setServerIssues(result.issues);
          setShowIssues("publish");
        }
        const shownMessages = new Set(result.issues.map((i) => i.message));
        const other = result.errors.filter((e) => !shownMessages.has(e));
        toast.error("Not published", {
          description:
            other.length > 0
              ? other.join(" ")
              : result.issues.length === 1
                ? "1 problem is blocking publishing."
                : `${result.issues.length} problems are blocking publishing.`,
        });
        if (result.issues.length > 0) panelRef.current?.focus();
        return;
      }
      setServerIssues(null);
      setShowIssues(null);
      toast.success(
        result.change === "cosmetic"
          ? "Updated the live version"
          : result.change === "breaking"
            ? `Published a new version (${result.version})`
            : "Published",
      );
      router.refresh();
    } catch {
      toast.error("Not published", {
        description: "We couldn't reach the server. Try again.",
      });
    } finally {
      setBusy(null);
    }
  }

  const questionCount = flattenQuestions(draft).length;
  const firstPage = draft.pages[0];
  const topIssues = questionnaireIssues(issues);
  const activeIndex = Math.min(activeSection, draft.pages.length - 1);
  const activePage = draft.pages[activeIndex];

  return (
    <div className="flex flex-col gap-6">
      {confirmDialog}
      {/* Fewer-forms warning — the builder holds ITSELF to the principle. */}
      <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
        <Tent className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
        <div className="text-sm">
          <p className="font-semibold text-foreground">
            Every question you add is a question a camp member has to answer.
          </p>
          <p className="mt-1 text-muted-foreground">
            Ask for the least you need. Mark a question required only if a
            missing answer gets in the camp&apos;s way.
          </p>
        </div>
      </div>

      <DefinitionIssuePanel
        ref={panelRef}
        issues={issues}
        sectionTitles={sectionTitles}
        blocking={serverIssues || showIssues === "publish" ? "publish" : "save"}
        anchorFor={(issue) => {
          const { pageIndex, blockIndex } = issue.location;
          const page = pageIndex === null ? undefined : draft.pages[pageIndex];
          if (!page) return null;
          const block =
            blockIndex === null ? undefined : pageBlocks(page)[blockIndex];
          return block ? blockAnchor(block.id) : sectionAnchor(page);
        }}
      />

      <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] xl:grid-cols-[13rem_minmax(0,1fr)_20rem]">
        <PaletteRail
          activeLabel={activePage ? sectionLabel(activePage, activeIndex) : "—"}
          onAdd={(kind) => addBlock(kind)}
          onAddSection={addSection}
        />

        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium">
                  Title <span className="text-destructive">*</span>
                </span>
                <Input
                  value={draft.title ?? ""}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Gear check"
                />
              </label>
              {firstPage?.kind === "questions" ? (
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium">Description</span>
                  <Textarea
                    value={firstPage.subtitle ?? ""}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    placeholder="One line telling members why you're asking."
                  />
                </label>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {draft.pages.length}{" "}
                {draft.pages.length === 1 ? "section" : "sections"} ·{" "}
                {questionCount} {questionCount === 1 ? "question" : "questions"}
              </p>
              <IssueNote issues={topIssues} />
            </CardContent>
          </Card>

          {draft.pages.map((page, pageIndex) => (
            <SectionEditor
              key={page.id}
              page={page}
              pageIndex={pageIndex}
              definition={draft}
              active={activeSection === pageIndex}
              issues={issues}
              questionnaireKey={questionnaireKey}
              reducedMotion={reducedMotion}
              onActivate={() => setActiveSection(pageIndex)}
              onChangePage={(next) => updatePage(pageIndex, next)}
              onChangeBlocks={(blocks) => updateBlocks(pageIndex, blocks)}
              onMoveSection={(delta) => moveSection(pageIndex, delta)}
              onRemoveSection={() => void removeSection(pageIndex)}
              onRemoveBlock={(blockId) => void removeBlock(pageIndex, blockId)}
              onAddBlock={(kind) => addBlock(kind, pageIndex)}
              onFocusBlock={(id) => setFocusTarget(blockAnchor(id))}
            />
          ))}

          <Button variant="outline" onClick={addSection} className="self-start">
            <Layers aria-hidden />
            Add section
          </Button>
        </div>

        <LifecycleRail
          questionnaireKey={questionnaireKey}
          status={initial.status}
          version={initial.version}
          isCaptain={isCaptain}
          openActivationId={openActivationId}
          openActivationBlocking={openActivationBlocking}
          publishing={busy === "publish"}
          unsaved={dirty}
          onPublish={() => void publish()}
        />
      </div>

      {/* Stays in view, as Camp 404's save bar did: a long questionnaire
          should not hide the one button that keeps the work. */}
      <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <span
          role="status"
          aria-live="polite"
          className="mr-auto flex flex-col text-xs text-muted-foreground"
        >
          <span>
            {saveState === "saving"
              ? "Saving…"
              : saveState === "error"
                ? "Couldn't save."
                : dirty
                  ? "Unsaved changes"
                  : saveState === "saved"
                    ? "All changes saved"
                    : "No changes yet"}
          </span>
          <span className="hidden sm:inline">
            {liveIssues.length > 0
              ? `${liveIssues.length} ${liveIssues.length === 1 ? "problem" : "problems"} to fix before this can be published.`
              : "Ready to publish."}
          </span>
        </span>
        <Button asChild variant="ghost">
          <Link href="/captains/questionnaires">Cancel</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/captains/questionnaires/${questionnaireKey}/preview`}>
            <Eye aria-hidden />
            Preview
          </Link>
        </Button>
        <Button
          variant="outline"
          onClick={() => void saveDraft()}
          disabled={busy !== null}
        >
          {busy === "save" ? (
            <Loader2 aria-hidden className="motion-safe:animate-spin" />
          ) : null}
          Save draft
        </Button>
      </div>
    </div>
  );
}

function PaletteRail({
  activeLabel,
  onAdd,
  onAddSection,
}: {
  activeLabel: string;
  onAdd: (kind: PaletteKind) => void;
  onAddSection: () => void;
}) {
  const content = PALETTE.filter((p) => p.group === "content");
  const questions = PALETTE.filter((p) => p.group === "question");
  return (
    <aside
      aria-label="Add a block"
      className="lg:sticky lg:top-32 lg:max-h-[calc(100svh-9rem)] lg:self-start lg:overflow-y-auto"
    >
      <Card>
        <CardContent className="flex flex-col gap-3 p-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Add a block
            </span>
            <span className="truncate text-xs text-muted-foreground">
              to {activeLabel}
            </span>
          </div>

          <button
            type="button"
            onClick={onAddSection}
            className="flex items-center gap-2 rounded-md border border-input px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Layers className="h-4 w-4 text-accent" aria-hidden />
            Section / page break
          </button>

          <PaletteGroup label="Content" entries={content} onAdd={onAdd} />
          <PaletteGroup
            label="Question types"
            entries={questions}
            onAdd={onAdd}
          />
        </CardContent>
      </Card>
    </aside>
  );
}

function PaletteGroup({
  label,
  entries,
  onAdd,
}: {
  label: string;
  entries: readonly (typeof PALETTE)[number][];
  onAdd: (kind: PaletteKind) => void;
}) {
  return (
    // Two columns until the rail sits beside the sections: stacked above them
    // on a phone, one long list would push the first section a screen away.
    <div
      role="group"
      aria-label={label}
      className="grid grid-cols-2 gap-1 lg:flex lg:flex-col"
    >
      <span className="col-span-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {entries.map((entry) => {
        const Icon = entry.icon;
        return (
          <button
            key={entry.kind}
            type="button"
            onClick={() => onAdd(entry.kind)}
            className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
            {entry.label}
          </button>
        );
      })}
    </div>
  );
}

/** One block in the section's drag-and-drop list. */
function SortableBlock({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: (handle: React.ReactNode, dragging: boolean) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const handle = (
    <button
      ref={setActivatorNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      aria-label={`Reorder ${label}`}
      className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <GripVertical aria-hidden className="h-4 w-4" />
    </button>
  );
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      {children(handle, isDragging)}
    </div>
  );
}

function SectionEditor({
  page,
  pageIndex,
  definition,
  active,
  issues,
  questionnaireKey,
  reducedMotion,
  onActivate,
  onChangePage,
  onChangeBlocks,
  onMoveSection,
  onRemoveSection,
  onRemoveBlock,
  onAddBlock,
  onFocusBlock,
}: {
  page: QuestionnairePage;
  pageIndex: number;
  definition: Questionnaire;
  active: boolean;
  issues: readonly LocatedIssue[];
  questionnaireKey: string;
  reducedMotion: boolean;
  onActivate: () => void;
  onChangePage: (next: QuestionnairePage) => void;
  onChangeBlocks: (blocks: PageBlock[]) => void;
  onMoveSection: (delta: number) => void;
  onRemoveSection: () => void;
  onRemoveBlock: (blockId: string) => void;
  onAddBlock: (kind: PaletteKind) => void;
  onFocusBlock: (blockId: string) => void;
}) {
  const allPages = definition.pages;
  const totalSections = allPages.length;
  const mine = sectionIssues(issues, pageIndex);
  const number = pageIndex + 1;
  // Forward-only: a section may only branch to one that comes AFTER it, or to
  // submit. The validator enforces this; the picker never offers otherwise.
  const branchTargets: BranchTarget[] = [
    ...allPages.slice(pageIndex + 1).map((p, i) => ({
      value: p.id,
      label: sectionLabel(p, pageIndex + 1 + i),
    })),
    { value: SUBMIT_TARGET, label: "Submit the questionnaire" },
  ];

  const blocks = pageBlocks(page);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function setBlock(index: number, next: PageBlock) {
    onChangeBlocks(blocks.map((b, i) => (i === index ? next : b)));
  }

  function onDragEnd(event: DragEndEvent) {
    setDraggingId(null);
    const { active: dragged, over } = event;
    if (!over || dragged.id === over.id) return;
    const from = blocks.findIndex((b) => b.id === dragged.id);
    const to = blocks.findIndex((b) => b.id === over.id);
    if (from < 0 || to < 0) return;
    // Reorder moves the OBJECT — ids ride along untouched.
    onChangeBlocks(arrayMove(blocks, from, to));
  }

  const dragged = blocks.find((b) => b.id === draggingId);
  const sectionFields = fieldsBefore(definition, page.id, null);
  const questionsHere = blocks.filter((b) => "prompt" in b).length;

  return (
    <section
      id={sectionAnchor(page)}
      aria-label={`Section ${number}`}
      onFocusCapture={onActivate}
      onClick={onActivate}
      className={cn(
        "flex scroll-mt-32 flex-col gap-3 rounded-lg border p-4 transition-colors",
        active ? "border-accent/60 bg-accent/5" : "border-border",
        mine.length > 0 && "border-destructive/60",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Section {number}</Badge>
        <span className="max-w-[12rem] truncate font-mono text-[11px] text-muted-foreground">
          {page.id}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Move section ${number} up`}
            disabled={pageIndex === 0}
            onClick={() => onMoveSection(-1)}
          >
            <ArrowUp aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Move section ${number} down`}
            disabled={pageIndex === totalSections - 1}
            onClick={() => onMoveSection(1)}
          >
            <ArrowDown aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Delete section ${number}`}
            disabled={totalSections <= 1}
            onClick={onRemoveSection}
          >
            <Trash2 aria-hidden className="text-destructive" />
          </Button>
        </div>
      </div>

      {page.kind === "questions" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Section title
              </span>
              <Input
                value={page.title}
                onChange={(e) =>
                  onChangePage({ ...page, title: e.target.value })
                }
                placeholder="Section title"
                aria-label={`Section ${number} title`}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Section description
              </span>
              <Input
                value={page.subtitle ?? ""}
                disabled={pageIndex === 0}
                onChange={(e) =>
                  onChangePage({
                    ...page,
                    subtitle: e.target.value || undefined,
                  })
                }
                placeholder="Optional"
                aria-label={`Section ${number} description`}
              />
              {pageIndex === 0 ? (
                <span className="text-xs text-muted-foreground">
                  The first section shows the questionnaire description.
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {blocks.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={(e) => setDraggingId(String(e.active.id))}
                onDragCancel={() => setDraggingId(null)}
                onDragEnd={onDragEnd}
              >
                <SortableContext
                  items={blocks.map((b) => b.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {blocks.map((block, blockIndex) => (
                    <SortableBlock
                      key={block.id}
                      id={block.id}
                      label={blockLabel(block, blockIndex)}
                    >
                      {(handle, dragging) => (
                        <BlockEditor
                          block={block}
                          pageIndex={pageIndex}
                          blockIndex={blockIndex}
                          total={blocks.length}
                          issues={issues}
                          branchTargets={branchTargets}
                          questionnaireKey={questionnaireKey}
                          fields={fieldsBefore(definition, page.id, block.id)}
                          dragHandle={handle}
                          dragging={dragging}
                          onChange={(next) => setBlock(blockIndex, next)}
                          onConvert={(kind) =>
                            setBlock(blockIndex, convertBlock(block, kind))
                          }
                          onMove={(delta) => {
                            const target = blockIndex + delta;
                            if (target < 0 || target >= blocks.length) return;
                            onChangeBlocks(
                              arrayMove(blocks, blockIndex, target),
                            );
                          }}
                          onDuplicate={() => {
                            const id = allocateId(
                              idPrefixFor(blockPaletteKind(block)),
                              takenIds(definition),
                            );
                            const next = [...blocks];
                            next.splice(
                              blockIndex + 1,
                              0,
                              duplicateBlock(block, id),
                            );
                            onChangeBlocks(next);
                            onFocusBlock(id);
                          }}
                          onRemove={() => onRemoveBlock(block.id)}
                        />
                      )}
                    </SortableBlock>
                  ))}
                </SortableContext>
                <DragOverlay dropAnimation={reducedMotion ? null : undefined}>
                  {dragged ? (
                    <DraggedBlock block={dragged} blocks={blocks} />
                  ) : null}
                </DragOverlay>
              </DndContext>
            ) : (
              <p className="rounded-md border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
                No blocks yet. Add one from the list, or below.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Select
                value=""
                onValueChange={(v) => onAddBlock(v as PaletteKind)}
              >
                <SelectTrigger
                  className="w-56"
                  aria-label={`Add a block to section ${number}`}
                >
                  <SelectValue placeholder="Add a block…" />
                </SelectTrigger>
                <SelectContent>
                  {PALETTE.map((entry) => (
                    <SelectItem key={entry.kind} value={entry.kind}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onAddBlock("short_text")}
              >
                <Plus aria-hidden />
                Quick question
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-md border border-border p-3">
            <ToggleRow
              label="Shuffle question order"
              hint="A different order for each member, kept the same when they come back."
              checked={page.shuffleQuestions ?? false}
              onCheckedChange={(shuffleQuestions) =>
                onChangePage({
                  ...page,
                  shuffleQuestions: shuffleQuestions || undefined,
                })
              }
            />
            <ToggleRow
              label="Required to continue"
              hint="Members must finish this section before moving on."
              checked={page.requiredToContinue ?? false}
              onCheckedChange={(requiredToContinue) =>
                onChangePage({
                  ...page,
                  requiredToContinue: requiredToContinue || undefined,
                })
              }
            />
            <ToggleRow
              label="Content only"
              hint="Text, notes and images, with no questions."
              checked={page.pageType === "content"}
              onCheckedChange={(content) =>
                onChangePage({
                  ...page,
                  pageType: content ? "content" : "question",
                })
              }
            />
            {page.pageType === "content" && questionsHere > 0 ? (
              <p className="text-xs text-warning">
                {questionsHere === 1
                  ? "This section still has 1 question."
                  : `This section still has ${questionsHere} questions.`}{" "}
                You can&apos;t publish until you move or delete{" "}
                {questionsHere === 1 ? "it" : "them"}, or turn this off.
              </p>
            ) : null}
            <Labelled
              label="After this section, go to"
              hint="Per-answer branching lives on each multiple-choice question."
            >
              <Select
                value={page.next ?? CONTINUE}
                onValueChange={(v) =>
                  onChangePage({
                    ...page,
                    next: v === CONTINUE ? undefined : v,
                  })
                }
              >
                <SelectTrigger
                  className="max-w-sm"
                  aria-label={`Where section ${number} goes next`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CONTINUE}>The next section</SelectItem>
                  {withCurrentTarget(branchTargets, page.next).map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Labelled>
          </div>

          <VisibilityEditor
            value={page.visibleIf}
            fields={sectionFields}
            subject="section"
            onChange={(visibleIf: VisibleIf | undefined) => {
              const { visibleIf: _drop, ...rest } = page;
              onChangePage(visibleIf ? { ...rest, visibleIf } : rest);
            }}
          />
        </>
      ) : (
        <div className="grid gap-3">
          <Input
            value={page.heading}
            onChange={(e) => onChangePage({ ...page, heading: e.target.value })}
            placeholder="Interstitial heading"
            aria-label="Interstitial heading"
          />
          <Textarea
            value={page.body}
            rows={3}
            onChange={(e) => onChangePage({ ...page, body: e.target.value })}
            placeholder="Interstitial body"
            aria-label="Interstitial body"
          />
        </div>
      )}

      <IssueNote issues={mine} />
    </section>
  );
}

/** The floating copy of a block while it is dragged. */
function DraggedBlock({
  block,
  blocks,
}: {
  block: PageBlock;
  blocks: readonly PageBlock[];
}) {
  const entry = PALETTE_BY_KIND[blockPaletteKind(block)];
  const Icon = entry.icon;
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-accent bg-card px-3 py-2.5 shadow-lg">
      <GripVertical aria-hidden className="h-4 w-4 text-accent" />
      <Icon aria-hidden className="h-4 w-4 text-accent" />
      <span className="truncate text-sm font-medium">
        {blockLabel(block, blocks.indexOf(block))}
      </span>
      <span className="text-xs text-muted-foreground">{entry.short}</span>
    </div>
  );
}
