"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  GitBranch,
  GripVertical,
  Heading,
  Image as ImageIcon,
  Loader2,
  Minus,
  Pencil,
  Plus,
  Settings2,
  SlidersHorizontal,
  StickyNote,
  ToggleRight,
  Trash2,
  type LucideIcon,
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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  builderQuestionnaireIssues,
  type Block,
  type BuilderQuestionnaire,
  type DefinitionIssue,
  type Question,
} from "@camp404/types";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { Card } from "@camp404/ui/components/card";
import { InputField } from "@camp404/ui/components/input-field";
import { toast } from "@camp404/ui/components/toast";
import { cn } from "@camp404/ui/lib/utils";
import { updateDefinitionAction } from "../actions";
import {
  addBlock,
  addPage,
  blockId,
  moveBlock,
  movePage,
  newId,
  patchPage,
  removeBlock,
  removePage,
  replaceBlock,
  splitPage,
} from "./builder-ops";
import { useConfirm } from "@camp404/ui/components/confirm-dialog";
import { BlockEditorDialog } from "./block-editor";
import { PageSettingsDialog } from "./page-settings-dialog";
import { BlockCatalogDialog } from "./block-catalog-dialog";
import { BUILDER_FIELD_KINDS } from "./field-kinds";
import { describeVisibleIf, fieldsBefore } from "./visibility";
import {
  EditPublishedBanner,
  LifecycleBar,
  PublishButton,
} from "./lifecycle-controls";

type Status = "draft" | "published" | "unpublished";

// The 12 builder kinds come from the shared palette table; `scale`/`toggle` are
// legacy code-questionnaire kinds the Question union still includes.
const QUESTION_META: Record<Question["kind"], { label: string; icon: LucideIcon }> = {
  ...Object.fromEntries(
    BUILDER_FIELD_KINDS.map(({ kind, label, icon }) => [kind, { label, icon }]),
  ),
  scale: { label: "Scale", icon: SlidersHorizontal },
  toggle: { label: "Toggle", icon: ToggleRight },
} as Record<Question["kind"], { label: string; icon: LucideIcon }>;

function describeBlock(block: Block): {
  label: string;
  kindLabel: string;
  icon: LucideIcon;
  required: boolean;
} {
  if (block.kind === "question") {
    const meta = QUESTION_META[block.question.kind];
    return {
      label: block.question.prompt || "Untitled question",
      kindLabel: meta.label,
      icon: meta.icon,
      required: block.question.required,
    };
  }
  switch (block.kind) {
    case "header_break":
      return {
        label: block.headingText || "Header",
        kindLabel: "Header",
        icon: Heading,
        required: false,
      };
    case "explainer":
      return {
        label: block.bodyText.slice(0, 48) || "Explainer",
        kindLabel: "Explainer",
        icon: StickyNote,
        required: false,
      };
    case "image_block":
      return {
        label: block.caption || "Image",
        kindLabel: "Image",
        icon: ImageIcon,
        required: false,
      };
    case "divider":
      return { label: "Divider", kindLabel: "Divider", icon: Minus, required: false };
  }
}

/** Condition problems are shown by the condition's own badge and line. */
const CONDITION_CODES: ReadonlySet<DefinitionIssue["code"]> = new Set([
  "dangling_visible_if",
  "visible_if_wrong_operator",
  "visible_if_wrong_value",
]);

function BlockRow({
  block,
  condition,
  problems,
  onEdit,
  onDelete,
}: {
  block: Block;
  /** The block's show-when rule as a sentence, when it has one. */
  condition: { text: string; broken: boolean } | null;
  /** What publish would refuse about this block, as sentences. */
  problems: string[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const id = blockId(block);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const { label, kindLabel, icon: Icon, required } = describeBlock(block);
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5",
        isDragging ? "z-10 border-accent opacity-95 shadow-lg" : "border-border",
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${label}`}
        className="cursor-grab touch-none rounded text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <GripVertical aria-hidden className="size-4" />
      </button>
      <Icon aria-hidden className="size-4 shrink-0 text-accent" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{label}</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {kindLabel}
          {required && (
            <Badge variant="default" className="px-1.5 py-0 text-[10px]">
              Required
            </Badge>
          )}
          {problems.length > 0 && (
            <Badge
              variant="warning"
              className="px-1.5 py-0 text-[10px]"
              title={problems.join(" ")}
            >
              Fix before publishing
              <span className="sr-only">: {problems.join(" ")}</span>
            </Badge>
          )}
          {condition && (
            <Badge
              variant={condition.broken ? "destructive" : "outline"}
              className="gap-1 px-1.5 py-0 text-[10px]"
              title={condition.text}
            >
              <GitBranch aria-hidden className="size-3" />
              {condition.broken ? "Fix condition" : "Conditional"}
              <span className="sr-only">: {condition.text}</span>
            </Badge>
          )}
        </span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Edit ${label}`}
        onClick={onEdit}
      >
        <Pencil />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Delete ${label}`}
        onClick={onDelete}
      >
        <Trash2 className="text-destructive" />
      </Button>
    </li>
  );
}

function PageCondition({ text, broken }: { text: string; broken: boolean }) {
  return (
    <span
      className={cn(
        "flex items-center gap-1 text-xs",
        broken ? "text-destructive" : "text-muted-foreground",
      )}
    >
      <GitBranch aria-hidden className="size-3 shrink-0" />
      {text}
    </span>
  );
}

export function BuilderCanvas({
  questionnaireKey,
  definition,
  canPublish,
  status,
  publishedVersion,
  openActivationId,
  openActivationBlocking = null,
}: {
  questionnaireKey: string;
  definition: BuilderQuestionnaire;
  canPublish: boolean;
  status: Status;
  publishedVersion: string | null;
  openActivationId: string | null;
  /** The open send's blocking flag, shown beside "Currently sent". */
  openActivationBlocking?: boolean | null;
}) {
  const [working, setWorking] = useState<BuilderQuestionnaire>(definition);
  const [, startTransition] = useTransition();
  // What the footer says about autosave. Nothing until the first edit, so a
  // fresh page does not claim a save it never made.
  const [save, setSave] = useState<
    | { kind: "idle" | "saving" | "saved" }
    | { kind: "error"; attempted: BuilderQuestionnaire }
  >({ kind: "idle" });
  const [confirm, confirmDialog] = useConfirm();
  const [editing, setEditing] = useState<{
    pageId: string;
    blockId: string;
  } | null>(null);
  // Drives the editor dialog's open state separately from `editing` so the
  // dialog stays mounted through close and its exit animation can run.
  const [editorOpen, setEditorOpen] = useState(false);
  const [settingsPageId, setSettingsPageId] = useState<string | null>(null);
  // What publish would refuse, shown on the page or block that has it, so a
  // captain sees a problem where it is instead of only in the publish dialog.
  const issues = useMemo(() => builderQuestionnaireIssues(working), [working]);
  const problemsAt = (pageId: string, blockId?: string) =>
    issues
      .filter(
        (i) =>
          i.pageId === pageId &&
          i.blockId === blockId &&
          !CONDITION_CODES.has(i.code),
      )
      .map((i) => i.message);
  // The block being dragged, shown in a floating copy under the pointer (the
  // home Customize pattern), so the row stays readable while it moves.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [addingToPageId, setAddingToPageId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Every delete asks first: persist() saves to the server at once, and there
  // is no undo. Returns whether the delete went ahead.
  async function confirmRemoveBlock(
    pageId: string,
    block: Block,
  ): Promise<boolean> {
    const sure = await confirm({
      title: `Delete “${describeBlock(block).label}”?`,
      description: "This can't be undone.",
      confirmLabel: "Delete block",
      destructive: true,
    });
    if (sure) persist(removeBlock(working, pageId, blockId(block)));
    return sure;
  }

  async function confirmRemovePage(
    page: BuilderQuestionnaire["pages"][number],
  ): Promise<boolean> {
    const blocks = page.blocks.length;
    const pageNumber = working.pages.findIndex((p) => p.id === page.id) + 1;
    const sure = await confirm({
      title: `Delete page ${pageNumber}?`,
      description:
        blocks === 0
          ? "It has no blocks. This can't be undone."
          : `Its ${blocks === 1 ? "1 block goes" : `${blocks} blocks go`} with it. This can't be undone.`,
      confirmLabel: "Delete page",
      destructive: true,
    });
    if (sure) persist(removePage(working, page.id));
    return sure;
  }

  function persist(next: BuilderQuestionnaire) {
    const previous = working; // last-good snapshot for rollback
    setWorking(next); // optimistic
    setSave({ kind: "saving" });
    startTransition(async () => {
      let error: string | null = null;
      try {
        const result = await updateDefinitionAction(questionnaireKey, next);
        if (!result.ok) error = result.error;
      } catch {
        error = "We couldn't reach the server. Your last change was not saved.";
      }
      if (error === null) {
        setSave({ kind: "saved" });
        return;
      }
      toast.error(error);
      setWorking(previous); // a rejected save must not leave the bad state on screen
      setSave({ kind: "error", attempted: next });
    });
  }

  function onBlockDragEnd(pageId: string, event: DragEndEvent) {
    setDraggingId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const page = working.pages.find((p) => p.id === pageId);
    if (!page) return;
    const from = page.blocks.findIndex((b) => blockId(b) === active.id);
    const to = page.blocks.findIndex((b) => blockId(b) === over.id);
    if (from < 0 || to < 0) return;
    persist(moveBlock(working, pageId, from, to));
  }

  const editingBlock = editing
    ? (working.pages
        .find((p) => p.id === editing.pageId)
        ?.blocks.find((b) => blockId(b) === editing.blockId) ?? null)
    : null;
  const settingsPage = settingsPageId
    ? (working.pages.find((p) => p.id === settingsPageId) ?? null)
    : null;
  const addingPage = addingToPageId
    ? (working.pages.find((p) => p.id === addingToPageId) ?? null)
    : null;

  return (
    <div className="flex flex-col gap-5 pb-24">
      {confirmDialog}
      <InputField
        label="Questionnaire name"
        value={working.title}
        onChange={(e) =>
          setWorking((w) => ({ ...w, title: e.currentTarget.value }))
        }
        onBlur={() => persist(working)}
        placeholder="Untitled questionnaire"
      />

      {status !== "draft" && <EditPublishedBanner status={status} />}

      {canPublish && (
        <LifecycleBar
          questionnaireKey={questionnaireKey}
          status={status}
          version={publishedVersion}
          openActivationId={openActivationId}
          openActivationBlocking={openActivationBlocking}
        />
      )}

      <div className="flex flex-col gap-4">
        {working.pages.map((page, pageIndex) => (
          <Card key={page.id} className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-col">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Page {pageIndex + 1} · {page.type === "content" ? "Content" : "Questions"}
                </span>
                {problemsAt(page.id).map((message) => (
                  <span key={message} className="text-xs text-warning">
                    {message}
                  </span>
                ))}
                {page.visibleIf && (
                  <PageCondition
                    {...describeVisibleIf(
                      page.visibleIf,
                      fieldsBefore(working, page.id, null),
                    )}
                  />
                )}
              </div>
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Page settings"
                  onClick={() => setSettingsPageId(page.id)}
                >
                  <Settings2 />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Move page up"
                  disabled={pageIndex === 0}
                  onClick={() => persist(movePage(working, pageIndex, pageIndex - 1))}
                >
                  <ChevronUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Move page down"
                  disabled={pageIndex === working.pages.length - 1}
                  onClick={() => persist(movePage(working, pageIndex, pageIndex + 1))}
                >
                  <ChevronDown />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Delete page"
                  disabled={working.pages.length <= 1}
                  onClick={() => void confirmRemovePage(page)}
                >
                  <Trash2 className="text-destructive" />
                </Button>
              </div>
            </div>

            {page.blocks.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={(e) => setDraggingId(String(e.active.id))}
                onDragCancel={() => setDraggingId(null)}
                onDragEnd={(e) => onBlockDragEnd(page.id, e)}
              >
                <SortableContext
                  items={page.blocks.map(blockId)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="flex flex-col gap-2">
                    {page.blocks.map((block) => (
                      <BlockRow
                        key={blockId(block)}
                        block={block}
                        problems={problemsAt(page.id, blockId(block))}
                        condition={
                          block.visibleIf
                            ? describeVisibleIf(
                                block.visibleIf,
                                fieldsBefore(working, page.id, blockId(block)),
                              )
                            : null
                        }
                        onEdit={() => {
                          setEditing({
                            pageId: page.id,
                            blockId: blockId(block),
                          });
                          setEditorOpen(true);
                        }}
                        onDelete={() =>
                          void confirmRemoveBlock(page.id, block)
                        }
                      />
                    ))}
                  </ul>
                </SortableContext>
                <DragOverlay>
                  {(() => {
                    const dragged = page.blocks.find(
                      (b) => blockId(b) === draggingId,
                    );
                    if (!dragged) return null;
                    const { label, icon: DragIcon } = describeBlock(dragged);
                    return (
                      <div className="flex items-center gap-2.5 rounded-lg border border-accent bg-card px-3 py-2.5 shadow-lg">
                        <GripVertical
                          aria-hidden
                          className="size-4 text-accent"
                        />
                        <DragIcon aria-hidden className="size-4 text-accent" />
                        <span className="truncate text-sm font-medium">
                          {label}
                        </span>
                      </div>
                    );
                  })()}
                </DragOverlay>
              </DndContext>
            ) : (
              <p className="rounded-lg border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
                No blocks yet.
              </p>
            )}

            <Button
              type="button"
              variant="outline"
              className="border-dashed"
              onClick={() => setAddingToPageId(page.id)}
            >
              <Plus /> Add block
            </Button>
          </Card>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={() =>
          persist(
            addPage(working, working.pages.at(-1)?.id ?? null, {
              id: newId(),
              type: "question",
              title: "",
              blocks: [],
            }),
          )
        }
      >
        <Plus /> Add page
      </Button>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <span
            role="status"
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            {save.kind === "saving" && (
              <>
                <Loader2
                  aria-hidden
                  className="size-3.5 motion-safe:animate-spin"
                />{" "}
                Saving…
              </>
            )}
            {save.kind === "saved" && "All changes saved"}
            {save.kind === "error" && (
              <>
                <span className="text-destructive">Couldn&apos;t save.</span>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => persist(save.attempted)}
                >
                  Retry
                </Button>
              </>
            )}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href={`/captains/questionnaires/${questionnaireKey}/preview`}>
                <Eye /> Preview
              </Link>
            </Button>
            {canPublish ? (
              <PublishButton questionnaireKey={questionnaireKey} status={status} />
            ) : (
              <div className="flex flex-col items-end gap-1">
                <Button type="button" disabled aria-describedby="publish-reason">
                  Publish
                </Button>
                <span
                  id="publish-reason"
                  className="text-xs text-muted-foreground"
                >
                  Only captains can publish
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {editing && editingBlock && (
        <BlockEditorDialog
          key={editing.blockId}
          block={editingBlock}
          questionnaireKey={questionnaireKey}
          fields={fieldsBefore(working, editing.pageId, editing.blockId)}
          open={editorOpen}
          onSave={(next) => {
            persist(replaceBlock(working, editing.pageId, editing.blockId, next));
            setEditorOpen(false);
          }}
          onDelete={() =>
            void confirmRemoveBlock(editing.pageId, editingBlock).then(
              (removed) => {
                if (!removed) return;
                setEditorOpen(false);
                setEditing(null); // block is gone — nothing left to animate over
              },
            )
          }
          onClose={() => setEditorOpen(false)}
        />
      )}

      {settingsPageId && settingsPage && (
        <PageSettingsDialog
          key={settingsPageId}
          page={settingsPage}
          fields={fieldsBefore(working, settingsPageId, null)}
          canDelete={working.pages.length > 1}
          onSave={(patch) => {
            persist(patchPage(working, settingsPageId, patch));
            setSettingsPageId(null);
          }}
          onDelete={() =>
            void confirmRemovePage(settingsPage).then((removed) => {
              if (removed) setSettingsPageId(null);
            })
          }
          onClose={() => setSettingsPageId(null)}
        />
      )}

      {addingToPageId && addingPage && (
        <BlockCatalogDialog
          pageType={addingPage.type}
          onPageBreak={() => {
            persist(
              splitPage(
                working,
                addingToPageId,
                addingPage.blocks.length,
                newId(),
              ),
            );
            setAddingToPageId(null);
          }}
          onSelect={(block) => {
            persist(addBlock(working, addingToPageId, block));
            setAddingToPageId(null);
            setEditing({ pageId: addingToPageId, blockId: blockId(block) });
            setEditorOpen(true);
          }}
          onClose={() => setAddingToPageId(null)}
        />
      )}
    </div>
  );
}
