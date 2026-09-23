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
import { ArrowRight, CalendarDays, Plus, Trash2, User } from "lucide-react";
import type { TaskBoardStatus } from "@camp404/types";
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
import { TASK_COLUMNS, type TaskCard } from "@/lib/task-board";
import { addTaskAction, moveTaskAction, removeTaskAction } from "./actions";

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
}: {
  cards: TaskCard[];
  viewerId: string;
  members: Member[];
  filterTeams: TeamOption[];
  addTeams: TeamOption[];
  canAddWithoutTeam: boolean;
}) {
  const router = useRouter();
  const [team, setTeam] = React.useState(ALL);
  const [person, setPerson] = React.useState(ALL);
  const [adding, setAdding] = React.useState(false);
  // A card moved here and not yet confirmed by the server's next render.
  const [moved, setMoved] = React.useState<Record<string, TaskBoardStatus>>({});
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [, startMove] = React.useTransition();
  const [removing, setRemoving] = React.useState<TaskCard | null>(null);
  const [removePending, startRemove] = React.useTransition();

  // The server's render is the truth once it arrives.
  React.useEffect(() => setMoved({}), [cards]);

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
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Team" htmlFor="task-filter-team" className="w-48">
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
          className="w-48"
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
        {canAdd ? (
          <Button className="ml-auto" onClick={() => setAdding(true)}>
            <Plus aria-hidden className="size-4" />
            Add task
          </Button>
        ) : null}
      </div>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid gap-4 lg:grid-cols-3">
          {TASK_COLUMNS.map((column) => {
            const inColumn = visible.filter((c) => c.status === column.status);
            return (
              <BoardColumn
                key={column.status}
                status={column.status}
                label={column.label}
                count={inColumn.length}
                note={column.status === "done" ? DONE_NOTE : null}
              >
                {inColumn.map((card) => (
                  <TaskCardView
                    key={card.id}
                    card={card}
                    pending={pendingId === card.id}
                    busy={pendingId !== null}
                    onMove={(to) => move(card, to)}
                    onRemove={() => setRemoving(card)}
                  />
                ))}
              </BoardColumn>
            );
          })}
        </div>
      </DndContext>

      {canAdd ? (
        <AddTaskDialog
          open={adding}
          onOpenChange={setAdding}
          members={members}
          teams={addTeams}
          canAddWithoutTeam={canAddWithoutTeam}
          onAdded={() => router.refresh()}
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
  children,
}: {
  status: TaskBoardStatus;
  label: string;
  count: number;
  note: string | null;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className={cn(
        "flex min-h-40 flex-col gap-3 rounded-lg border border-border bg-muted/20 p-3 transition-colors",
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
        <p className="px-1 py-6 text-center text-sm text-muted-foreground">
          Nothing here.
        </p>
      ) : null}
    </section>
  );
}

function TaskCardView({
  card,
  pending,
  busy,
  onMove,
  onRemove,
}: {
  card: TaskCard;
  pending: boolean;
  busy: boolean;
  onMove: (to: TaskBoardStatus) => void;
  onRemove: () => void;
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
      className={cn(
        "relative",
        card.canMove && "cursor-grab touch-none active:cursor-grabbing",
        isDragging && "z-10 shadow-lg ring-2 ring-primary",
      )}
      {...(card.canMove ? listeners : {})}
    >
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium leading-snug">{card.title}</h3>
          {pending ? <Spinner className="size-4 shrink-0" /> : null}
        </div>
        {card.description ? (
          <p className="line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">
            {card.description}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5">
          {card.teamLabel ? (
            <Badge variant="secondary">{card.teamLabel}</Badge>
          ) : null}
          {card.due ? (
            <Badge variant={DUE_VARIANT[card.due.tone]}>
              <CalendarDays aria-hidden className="mr-1 size-3" />
              {card.due.label}
            </Badge>
          ) : null}
        </div>
        <p className="flex items-center gap-1.5 text-sm">
          <User aria-hidden className="size-3.5 text-muted-foreground" />
          {card.assigneeName ? (
            <span>
              {card.assigneeName}
              {card.mine ? (
                <span className="text-muted-foreground"> (you)</span>
              ) : null}
            </span>
          ) : (
            <span className="text-muted-foreground">Nobody yet</span>
          )}
        </p>
        {card.canMove || card.canRemove ? (
          <div
            className="flex flex-wrap items-center gap-1 border-t border-border pt-2"
            // The buttons are for pressing, not for starting a drag.
            onPointerDown={(e) => e.stopPropagation()}
          >
            {card.canMove
              ? others.map((column) => (
                  <Button
                    key={column.status}
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    disabled={busy}
                    aria-label={`Move “${card.title}” to ${column.label}`}
                    onClick={() => onMove(column.status)}
                  >
                    <ArrowRight aria-hidden className="size-3.5" />
                    {column.label}
                  </Button>
                ))
              : null}
            {card.canRemove ? (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-8 px-2 text-muted-foreground hover:text-destructive"
                disabled={busy}
                aria-label={`Remove “${card.title}”`}
                onClick={onRemove}
              >
                <Trash2 aria-hidden className="size-3.5" />
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AddTaskDialog({
  open,
  onOpenChange,
  members,
  teams,
  canAddWithoutTeam,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
  teams: TeamOption[];
  canAddWithoutTeam: boolean;
  onAdded: () => void;
}) {
  const firstTeam = canAddWithoutTeam ? NONE : (teams[0]?.value ?? NONE);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [team, setTeam] = React.useState(firstTeam);
  const [assignee, setAssignee] = React.useState(NONE);
  const [due, setDue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function reset() {
    setTitle("");
    setDescription("");
    setTeam(firstTeam);
    setAssignee(NONE);
    setDue("");
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addTaskAction({
        title,
        description,
        team: team === NONE ? null : team,
        assigneeId: assignee === NONE ? null : assignee,
        due: due || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Task added");
      reset();
      onOpenChange(false);
      onAdded();
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
            <DialogTitle>Add a task</DialogTitle>
            <DialogDescription>
              It goes into To do, where the whole camp can see it.
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
                  {canAddWithoutTeam ? (
                    <SelectItem value={NONE}>No team</SelectItem>
                  ) : null}
                  {teams.map((t) => (
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
                {members.map((m) => (
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
              {pending ? "Adding…" : "Add task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
