import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Car,
  CheckCircle2,
  Circle,
  Hourglass,
  ListTodo,
} from "lucide-react";
import { Badge } from "@camp404/ui/components/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { cn } from "@camp404/ui/lib/utils";
import type { HomeModel } from "@/lib/home";

// A member's own home: what to do, what's coming, and the few places that are
// theirs. Built for someone easily overwhelmed (owner, 2026-09-23): short
// lines, no paragraphs, and a card only when it applies to this person
// (lib/home.ts decides which). Drawn in the console kit — cards, rows, badges.

function Row({
  href,
  children,
  className,
}: {
  href?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const body = (
    <div className={cn("flex items-center gap-3 py-3", className)}>
      {children}
    </div>
  );
  return href ? (
    <Link href={href} className="group block">
      {body}
    </Link>
  ) : (
    body
  );
}

function ToDoCard({ todos }: { todos: HomeModel["todos"] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListTodo className="h-4 w-4 text-accent" aria-hidden />
          To do
        </CardTitle>
      </CardHeader>
      <CardContent>
        {todos.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
            You&rsquo;re all caught up.
          </p>
        ) : (
          <ul aria-label="To do" className="-my-3 divide-y divide-border">
            {todos.map((todo) => (
              <li key={todo.id}>
                <Row href={todo.href}>
                  <Circle
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {todo.label}
                  </span>
                  {todo.due ? (
                    <Badge variant={todo.urgent ? "warning" : "outline"}>
                      {todo.due}
                    </Badge>
                  ) : null}
                  <ArrowRight
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </Row>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const CALENDAR_NOTE: Record<string, string> = {
  not_configured: "The camp calendar isn't connected yet.",
  unavailable: "Couldn't reach the camp calendar just now.",
};

function ComingUpCard({
  upcoming,
  calendarState,
}: {
  upcoming: HomeModel["upcoming"];
  calendarState: HomeModel["calendarState"];
}) {
  const note = calendarState ? CALENDAR_NOTE[calendarState] : undefined;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-4 w-4 text-accent" aria-hidden />
          Coming up
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {note ?? "Nothing on the calendar yet."}
          </p>
        ) : (
          <ul aria-label="Coming up" className="-my-3 divide-y divide-border">
            {upcoming.map((item) => (
              <li key={item.id}>
                <Row>
                  <span className="w-24 shrink-0 text-xs font-semibold uppercase tracking-wide text-accent">
                    {item.relative}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {item.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.location
                        ? `${item.when} · ${item.location}`
                        : item.when}
                    </span>
                  </span>
                </Row>
              </li>
            ))}
          </ul>
        )}
        {upcoming.length > 0 && note ? (
          <p className="text-xs text-muted-foreground">{note}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function WaitingCard() {
  return (
    <Card className="border-accent/40">
      <CardContent className="flex items-start gap-3 p-5">
        <Hourglass
          className="mt-0.5 h-5 w-5 shrink-0 text-accent"
          aria-hidden
        />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold">Waiting for a captain</p>
          <p className="text-sm text-muted-foreground">
            Your bio is in. You&rsquo;ll get a notice here when you&rsquo;re
            approved. Nothing else to do for now.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ChecklistCard({
  checklist,
  allDone,
}: {
  checklist: HomeModel["checklist"];
  allDone: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          Your setup
          {allDone ? <Badge variant="success">All set</Badge> : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul aria-label="Your setup" className="flex flex-col gap-2">
          {checklist.map((item) => (
            <li key={item.label} className="flex items-center gap-2 text-sm">
              {item.done ? (
                <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground" aria-hidden />
              )}
              <span className={item.done ? "" : "text-muted-foreground"}>
                {item.label}
              </span>
              <span className="sr-only">{item.done ? "done" : "not yet"}</span>
            </li>
          ))}
        </ul>
        {checklist.some((c) => c.label === "Sign-in secured" && !c.done) ? (
          <Link
            href="/profile/security"
            className="mt-3 inline-block text-xs font-medium text-accent hover:underline"
          >
            Add two-factor or a passkey
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}

function LiftCard({ lift }: { lift: NonNullable<HomeModel["lift"]> }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Car className="h-4 w-4 text-accent" aria-hidden />
          {lift.heading}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1 text-sm">
          {lift.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ShortcutsCard({ shortcuts }: { shortcuts: HomeModel["shortcuts"] }) {
  return (
    <Card>
      <CardContent className="p-5">
        <nav aria-label="Your shortcuts">
          <ul className="-my-3 divide-y divide-border">
            {shortcuts.map((s) => (
              <li key={s.id}>
                <Row href={s.href}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {s.label}
                    </span>
                    {s.detail ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {s.detail}
                      </span>
                    ) : null}
                  </span>
                  {s.badge ? <Badge>{s.badge} new</Badge> : null}
                  <ArrowRight
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </Row>
              </li>
            ))}
          </ul>
        </nav>
      </CardContent>
    </Card>
  );
}

export function HomeView({ home }: { home: HomeModel }) {
  return (
    <div className="flex flex-col">
      <PageHeading eyebrow="Home" title={home.greeting} />
      <div className="-mt-3 mb-6 flex flex-wrap gap-2" aria-label="You are">
        {home.chips.map((chip) => (
          <Badge key={chip} variant="outline">
            {chip}
          </Badge>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {home.waitingForApproval ? (
            <WaitingCard />
          ) : (
            <>
              <ToDoCard todos={home.todos} />
              <ComingUpCard
                upcoming={home.upcoming}
                calendarState={home.calendarState}
              />
            </>
          )}
        </div>
        <div className="flex flex-col gap-6">
          <ChecklistCard checklist={home.checklist} allDone={home.allDone} />
          {home.lift ? <LiftCard lift={home.lift} /> : null}
          <ShortcutsCard shortcuts={home.shortcuts} />
        </div>
      </div>
    </div>
  );
}
