"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ArrowRight, Pencil, Plus, Trash2 } from "lucide-react";
import { TASK_EDITED, type TaskBoardStatus } from "@camp404/types";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { Card, CardContent } from "@camp404/ui/components/card";
import { ConfirmDialog } from "@camp404/ui/components/confirm-dialog";
import { DateControl } from "@camp404/ui/components/date-control";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@camp404/ui/components/dialog";
import { Field } from "@camp404/ui/components/field";
import { Input } from "@camp404/ui/components/input";
import { RowActions } from "@camp404/ui/components/row-actions";
import { SegmentedControl } from "@camp404/ui/components/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@camp404/ui/components/select";
import { Spinner } from "@camp404/ui/components/spinner";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import { cn } from "@camp404/ui/lib/utils";
import { SearchFocus } from "@/components/search/search-focus";
import { SEARCH_FOCUS_CLASS, searchFocusProps } from "@/lib/search-focus";
import { TASK_COLUMNS, type TaskCard } from "@/lib/task-board";
import {
  addTaskAction,
  editTaskAction,
  moveTaskAction,
  removeTaskAction,
} from "./actions";

export interface TeamOption {
  value: string;
  label: string;
}

interface Member {
  id: string;
  displayName: string;
}

/** Radix Select items cannot hold an empty value; these stand for "none". */
const ALL = "all";
const NONE = "none";
const ME = "me";

const DONE_NOTE = "Finished in the last 30 days";

const DUE_VARIANT = {
  overdue: "destructive",
  soon: "warning",
  later: "outline",
  done: "outline",
} as const;

export function TaskBoard({
  cards,
  viewerId,
  members,
  filterTeams,
  addTeams,
  canAddWithoutTeam,
  initialTeam,
  openAdd,
  focusTask,
}: {
  /** The team the filter starts on (`?team=`). */
  initialTeam?: string;
  /**
   * One card a search result named (`?task=`, checked by the page): the
   * board opens on it with no filter, marked and scrolled to. No form opens
   * by itself: Edit is on the card for whoever may use it.
   */
  focusTask?: string;
  /** Open Add task on this team at once (a team page's "Add task"). */
  openAdd?: string;
  cards: TaskCard[];
  viewerId: string;
  members: Member[];
  filterTeams: TeamOption[];
  addTeams: TeamOption[];
  canAddWithoutTeam: boolean;
}) {
  const router = useRouter();
  const focused = focusTask
    ? (cards.find((c) => c.id === focusTask) ?? null)
    : null;
  const [team, setTeam] = React.useState(focused ? ALL : (initialTeam ?? ALL));
  const [person, setPerson] = React.useState(ALL);
  const [adding, setAdding] = React.useState(openAdd !== undefined);
  // On a phone (a narrow window) one column shows at a time.
  const [shown, setShown] = React.useState<TaskBoardStatus>(
    focused?.status ?? "open",
  );
  // The card being edited. It stays set after the dialog closes, so the dialog
  // can animate out; opening Edit on a card replaces it.
  const [editing, setEditing] = React.useState<TaskCard | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  // A card moved here and not yet confirmed by the server's next render.
  const [moved, setMoved] = React.useState<Record<string, TaskBoardStatus>>({});
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [, startMove] = React.useTransition();
  const [removing, setRemoving] = React.useState<TaskCard | null>(null);
  const [removePending, startRemove] = React.useTransition();

  // The server's render is the truth once it arrives.
  const [seenCards, setSeenCards] = React.useState(cards);
  if (seenCards !== cards) {
    setSeenCards(cards);
    setMoved({});
  }

  const canAdd = canAddWithoutTeam || addTeams.length > 0;
  // Pointer only. A keyboard or screen-reader user moves a card with its
  // buttons, so the card itself does not pose as one big button around them.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const visible = cards
    .map((card) => ({ ...card, status: moved[card.id] ?? card.status }))
    .filter((card) => {
      if (team === NONE && card.team !== null) return false;
      if (team !== ALL && team !== NONE && card.team !== team) return false;
      if (person === ME && card.assigneeId !== viewerId) return false;
      if (person === NONE && card.assigneeId !== null) return false;
      if (![ALL, ME, NONE].includes(person) && card.assigneeId !== person) {
        return false;
      }
      return true;
    });

  function move(card: TaskCard, to: TaskBoardStatus) {
    const from = moved[card.id] ?? card.status;
    if (from === to || pendingId) return;
    setMoved((m) => ({ ...m, [card.id]: to }));
    setPendingId(card.id);
    startMove(async () => {
      const result = await moveTaskAction({ taskId: card.id, from, to });
      setPendingId(null);
      if (!result.ok) {
        setMoved((m) => {
          const next = { ...m };
          delete next[card.id];
          return next;
        });
        toast.error(result.error);
        router.refresh();
        return;
      }
      router.refresh();
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const card = cards.find((c) => c.id === event.active.id);
    const to = event.over?.id as TaskBoardStatus | undefined;
    if (card && to) move(card, to);
  }

  function confirmRemove() {
    const card = removing;
    if (!card) return;
    startRemove(async () => {
      const result = await removeTaskAction(card.id);
      if (!result.ok) {
        toast.error(result.error);
      } else {
        toast.success("Task removed");
      }
      setRemoving(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* The filter bar: the filters on the left, Add task on the same line
          at the right. On a phone Add task comes first, full width, and the
          filters take the width too. */}
      <div className="flex flex-col-reverse gap-3 page-sm:flex-row page-sm:items-end page-sm:justify-between">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 page-sm:flex page-sm:flex-wrap page-sm:items-end">
          <Field
            label="Team"
            htmlFor="task-filter-team"
            className="w-full page-sm:w-48"
          >
            <Select value={team} onValueChange={setTeam}>
              <SelectTrigger id="task-filter-team">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All teams</SelectItem>
                {filterTeams.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
                <SelectItem value={NONE}>No team</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Responsible"
            htmlFor="task-filter-person"
            className="w-full page-sm:w-48"
          >
            <Select value={person} onValueChange={setPerson}>
              <SelectTrigger id="task-filter-person">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Everyone</SelectItem>
                <SelectItem value={ME}>Me</SelectItem>
                <SelectItem value={NONE}>Nobody yet</SelectItem>
                {members
                  .filter((m) => m.id !== viewerId)
                  .map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.displayName}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        {canAdd ? (
          <Button
            className="w-full page-sm:w-auto"
            onClick={() => setAdding(true)}
          >
            <Plus aria-hidden className="size-4" />
            Add task
          </Button>
        ) : null}
      </div>

      {/* A narrow window shows one column at a time, picked here with its
          count; from a medium window up the three stand side by side. */}
      <div className="page-md:hidden">
        <SegmentedControl
          aria-label="Column"
          value={shown}
          onValueChange={(v) => setShown(v as TaskBoardStatus)}
          options={TASK_COLUMNS.map((column) => ({
            value: column.status,
            label: `${column.label} ${
              visible.filter((c) => c.status === column.status).length
            }`,
          }))}
        />
      </div>

      {focused ? <SearchFocus /> : null}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 page-md:grid-cols-3">
          {TASK_COLUMNS.map((column) => {
            const inColumn = visible.filter((c) => c.status === column.status);
            return (
              <BoardColumn
                key={column.status}
                status={column.status}
                label={column.label}
                count={inColumn.length}
                note={column.status === "done" ? DONE_NOTE : null}
                hiddenNarrow={column.status !== shown}
              >
                {inColumn.map((card) => (
                  <TaskCardView
                    key={card.id}
                    card={card}
                    focused={card.id === focused?.id}
                    pending={pendingId === card.id}
                    busy={pendingId !== null}
                    onMove={(to) => move(card, to)}
                    onRemove={() => setRemoving(card)}
                    onEdit={() => {
                      setEditing(card);
                      setEditOpen(true);
                    }}
                  />
                ))}
              </BoardColumn>
            );
          })}
        </div>
      </DndContext>

      {canAdd ? (
        <TaskDialog
          defaultTeam={openAdd}
          open={adding}
          onOpenChange={setAdding}
          members={members}
          teams={addTeams}
          canAddWithoutTeam={canAddWithoutTeam}
          onSaved={() => router.refresh()}
        />
      ) : null}

      {editing ? (
        <TaskDialog
          // A fresh form for each card and each version of it.
          key={`${editing.id}:${editing.version}`}
          editing={editing}
          open={editOpen}
          onOpenChange={setEditOpen}
          members={members}
          teams={addTeams}
          canAddWithoutTeam={canAddWithoutTeam}
          onSaved={() => router.refresh()}
          onStale={() => router.refresh()}
        />
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open && !removePending) setRemoving(null);
        }}
        title="Remove this task?"
        description={
          removing
            ? `“${removing.title}” comes off the board for everyone.`
            : ""
        }
        confirmLabel="Remove task"
        destructive
        pending={removePending}
        onConfirm={confirmRemove}
      />
    </div>
  );
}

function BoardColumn({
  status,
  label,
  count,
  note,
  hiddenNarrow,
  children,
}: {
  status: TaskBoardStatus;
  label: string;
  count: number;
  note: string | null;
  /** Not the column picked for a narrow window: shown only side by side. */
  hiddenNarrow: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className={cn(
        "flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3 transition-colors",
        hiddenNarrow ? "hidden page-md:flex" : "flex",
        isOver && "border-primary bg-primary/5",
      )}
    >
      <header className="flex items-baseline justify-between gap-2 px-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide">
          {label}
        </h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {count}
        </span>
      </header>
      {note ? (
        <p className="-mt-2 px-1 text-xs text-muted-foreground">{note}</p>
      ) : null}
      {children}
      {count === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">Nothing here.</p>
      ) : null}
    </section>
  );
}

function TaskCardView({
  card,
  focused = false,
  pending,
  busy,
  onMove,
  onRemove,
  onEdit,
}: {
  card: TaskCard;
  focused?: boolean;
  pending: boolean;
  busy: boolean;
  onMove: (to: TaskBoardStatus) => void;
  onRemove: () => void;
  onEdit: () => void;
}) {
  const { listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    disabled: !card.canMove || busy,
  });
  const others = TASK_COLUMNS.filter((c) => c.status !== card.status);

  return (
    <Card
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      role="article"
      aria-label={card.title}
      aria-current={focused ? "true" : undefined}
      {...searchFocusProps(focused)}
      className={cn(
        "relative",
        focused && SEARCH_FOCUS_CLASS,
        card.canMove && "cursor-grab touch-none active:cursor-grabbing",
        isDragging && "z-10 shadow-lg ring-2 ring-primary",
      )}
      {...(card.canMove ? listeners : {})}
    >
      <CardContent className="flex flex-col gap-1.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-medium leading-snug">{card.title}</h3>
          {pending ? <Spinner className="size-4 shrink-0" /> : null}
        </div>
        {card.description ? (
          <p
            className="line-clamp-1 text-xs text-muted-foreground"
            title={card.description}
          >
            {card.description}
          </p>
        ) : null}
        {/* One meta line: team · who · when. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">
            {[
              card.teamLabel,
              card.assigneeName
                ? `${card.assigneeName}${card.mine ? " (you)" : ""}`
                : "Nobody yet",
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {card.due ? (
            <Badge variant={DUE_VARIANT[card.due.tone]} className="ml-auto">
              {card.due.label}
            </Badge>
          ) : null}
        </div>
        {card.canMove || card.canRemove || card.canEdit ? (
          <div
            // The buttons are for pressing, not for starting a drag.
            onPointerDown={(e) => e.stopPropagation()}
          >
            <RowActions
              label={`Actions for ${card.title}`}
              primary={
                card.canMove ? (
                  <span className="flex items-center gap-0.5">
                    {others.map((column) => (
                      <Button
                        key={column.status}
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-1.5 text-xs"
                        disabled={busy}
                        aria-label={`Move “${card.title}” to ${column.label}`}
                        onClick={() => onMove(column.status)}
                      >
                        <ArrowRight aria-hidden className="size-3" />
                        {column.label}
                      </Button>
                    ))}
                  </span>
                ) : null
              }
              secondarySlots={1}
              secondary={
                <>
                  {card.canEdit ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-foreground"
                      disabled={busy}
                      aria-label={`Edit “${card.title}”`}
                      onClick={onEdit}
                    >
                      <Pencil aria-hidden className="size-3.5" />
                    </Button>
                  ) : null}
                  {card.canRemove ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-destructive"
                      disabled={busy}
                      aria-label={`Remove “${card.title}”`}
                      onClick={onRemove}
                    >
                      <Trash2 aria-hidden className="size-3.5" />
                    </Button>
                  ) : null}
                </>
              }
              className="justify-between"
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Add a task or, given `editing`, change one. Editing prefills every field and
 * sends the version the card was opened at, so a second editor is told rather
 * than silently overwritten.
 */
function TaskDialog({
  open,
  onOpenChange,
  members,
  teams,
  canAddWithoutTeam,
  editing,
  defaultTeam,
  onSaved,
  onStale,
}: {
  /** The team a new task starts on, when the viewer may pick it. */
  defaultTeam?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
  teams: TeamOption[];
  canAddWithoutTeam: boolean;
  editing?: TaskCard;
  onSaved: () => void;
  onStale?: () => void;
}) {
  const initial = {
    title: editing?.title ?? "",
    description: editing?.description ?? "",
    team: editing
      ? (editing.team ?? NONE)
      : defaultTeam && teams.some((t) => t.value === defaultTeam)
        ? defaultTeam
        : canAddWithoutTeam
          ? NONE
          : (teams[0]?.value ?? NONE),
    assignee: editing?.assigneeId ?? NONE,
    due: editing?.dueDay ?? "",
  };
  const [title, setTitle] = React.useState(initial.title);
  const [description, setDescription] = React.useState(initial.description);
  const [team, setTeam] = React.useState(initial.team);
  const [assignee, setAssignee] = React.useState(initial.assignee);
  const [due, setDue] = React.useState(initial.due);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  // A task may keep a team this viewer could not pick (an archived team, or
  // one they don't lead), so it stays in the list. The server refuses a move
  // onto a team the viewer may not pick.
  const teamOptions: TeamOption[] =
    editing?.team && !teams.some((t) => t.value === editing.team)
      ? [
          ...teams,
          { value: editing.team, label: editing.teamLabel ?? editing.team },
        ]
      : teams;
  const showNoTeam = canAddWithoutTeam || (editing && editing.team === null);
  // Likewise the person responsible, if they are no longer on the list.
  const memberOptions: Member[] =
    editing?.assigneeId && !members.some((m) => m.id === editing.assigneeId)
      ? [
          ...members,
          {
            id: editing.assigneeId,
            displayName: editing.assigneeName ?? "Unnamed member",
          },
        ]
      : members;

  function reset() {
    setTitle(initial.title);
    setDescription(initial.description);
    setTeam(initial.team);
    setAssignee(initial.assignee);
    setDue(initial.due);
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const fields = {
        title,
        description,
        team: team === NONE ? null : team,
        assigneeId: assignee === NONE ? null : assignee,
        due: due || null,
      };
      const result = editing
        ? await editTaskAction({
            ...fields,
            taskId: editing.id,
            version: editing.version,
          })
        : await addTaskAction(fields);
      if (!result.ok) {
        setError(result.error);
        if (result.error === TASK_EDITED) onStale?.();
        return;
      }
      toast.success(editing ? "Task updated" : "Task added");
      if (!editing) reset();
      onOpenChange(false);
      onSaved();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit task" : "Add a task"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "The whole camp sees the change."
                : "It goes into To do, where the whole camp can see it."}
            </DialogDescription>
          </DialogHeader>

          <Field label="Title" htmlFor="task-title" required>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              disabled={pending}
              required
            />
          </Field>
          <Field label="Details" htmlFor="task-description">
            <Textarea
              id="task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
              disabled={pending}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Team" htmlFor="task-team">
              <Select value={team} onValueChange={setTeam} disabled={pending}>
                <SelectTrigger id="task-team">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {showNoTeam ? (
                    <SelectItem value={NONE}>No team</SelectItem>
                  ) : null}
                  {teamOptions.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Deadline" htmlFor="task-due">
              <DateControl
                id="task-due"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                disabled={pending}
              />
            </Field>
          </div>
          <Field label="Person responsible" htmlFor="task-assignee">
            <Select
              value={assignee}
              onValueChange={setAssignee}
              disabled={pending}
            >
              <SelectTrigger id="task-assignee">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Nobody yet</SelectItem>
                {memberOptions.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || title.trim() === ""}>
              {editing
                ? pending
                  ? "Saving…"
                  : "Save changes"
                : pending
                  ? "Adding…"
                  : "Add task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
