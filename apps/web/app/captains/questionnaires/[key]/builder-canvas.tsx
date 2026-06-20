"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Eye,
  FileText,
  GripVertical,
  Hash,
  Heading,
  Image as ImageIcon,
  ListChecks,
  Loader2,
  Mail,
  Minus,
  Phone,
  Plus,
  SlidersHorizontal,
  StickyNote,
  ToggleRight,
  Trash2,
  Type,
  type LucideIcon,
} from "lucide-react";
import {
  DndContext,
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
import type {
  Block,
  BuilderQuestionnaire,
  Question,
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
  removeBlock,
  removePage,
} from "./builder-ops";

const newId = (): string =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.round(Math.random() * 1e9)}`;

function newQuestionBlock(): Block {
  return {
    kind: "question",
    question: {
      id: newId(),
      kind: "short_text",
      prompt: "Untitled question",
      required: false,
      maxLength: 120,
    },
  };
}

const QUESTION_META: Record<Question["kind"], { label: string; icon: LucideIcon }> = {
  short_text: { label: "Short text", icon: Type },
  long_text: { label: "Long text", icon: FileText },
  email: { label: "Email", icon: Mail },
  phone: { label: "Phone", icon: Phone },
  number: { label: "Number", icon: Hash },
  slider: { label: "Scale / slider", icon: SlidersHorizontal },
  scale: { label: "Scale", icon: SlidersHorizontal },
  single_select: { label: "Single select", icon: CircleDot },
  multi_select: { label: "Multi select", icon: ListChecks },
  combobox: { label: "Dropdown", icon: ChevronDown },
  toggle: { label: "Toggle", icon: ToggleRight },
  boolean: { label: "Yes / no", icon: ToggleRight },
  date: { label: "Date", icon: Calendar },
  image: { label: "Image upload", icon: ImageIcon },
};

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

function BlockRow({ block, onDelete }: { block: Block; onDelete: () => void }) {
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
        </span>
      </div>
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

export function BuilderCanvas({
  questionnaireKey,
  definition,
  canPublish,
}: {
  questionnaireKey: string;
  definition: BuilderQuestionnaire;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [working, setWorking] = useState<BuilderQuestionnaire>(definition);
  const [pending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function persist(next: BuilderQuestionnaire) {
    setWorking(next);
    startTransition(async () => {
      const result = await updateDefinitionAction(questionnaireKey, next);
      if (!result.ok) {
        toast.error(result.error);
        router.refresh(); // re-read the server's last-good state
      }
    });
  }

  function onBlockDragEnd(pageId: string, event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const page = working.pages.find((p) => p.id === pageId);
    if (!page) return;
    const from = page.blocks.findIndex((b) => blockId(b) === active.id);
    const to = page.blocks.findIndex((b) => blockId(b) === over.id);
    if (from < 0 || to < 0) return;
    persist(moveBlock(working, pageId, from, to));
  }

  return (
    <div className="flex flex-col gap-5 pb-24">
      <InputField
        label="Questionnaire name"
        value={working.title}
        onChange={(e) =>
          setWorking((w) => ({ ...w, title: e.currentTarget.value }))
        }
        onBlur={() => persist(working)}
        placeholder="Untitled questionnaire"
      />

      <div className="flex flex-col gap-4">
        {working.pages.map((page, pageIndex) => (
          <Card key={page.id} className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Page {pageIndex + 1} · {page.type === "content" ? "Content" : "Questions"}
              </span>
              <div className="flex items-center gap-0.5">
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
                  onClick={() => persist(removePage(working, page.id))}
                >
                  <Trash2 className="text-destructive" />
                </Button>
              </div>
            </div>

            {page.blocks.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
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
                        onDelete={() =>
                          persist(removeBlock(working, page.id, blockId(block)))
                        }
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            ) : (
              <p className="rounded-lg border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
                No questions yet.
              </p>
            )}

            <Button
              type="button"
              variant="outline"
              className="border-dashed"
              onClick={() =>
                persist(addBlock(working, page.id, newQuestionBlock()))
              }
            >
              <Plus /> Add field
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
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {pending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Saving…
              </>
            ) : (
              "Saved"
            )}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href={`/captains/questionnaires/${questionnaireKey}/preview`}>
                <Eye /> Preview
              </Link>
            </Button>
            <Button
              type="button"
              disabled
              title={
                canPublish
                  ? "Publishing arrives in the next update"
                  : "Only captains can publish"
              }
            >
              Publish
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
