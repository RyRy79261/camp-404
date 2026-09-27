"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import {
  DDT_LABEL,
  NO_ANSWER_LABEL,
  STANDING_LABEL,
  WAP_LABEL,
  TICKET_STATUS_LABEL,
  stillNeedsTicket,
  type TicketFacts,
} from "@camp404/core";
import {
  DDT_STATUSES,
  PARTICIPATION_STATUSES,
  WAP_STATUSES,
  type TicketPass,
} from "@camp404/types";
import { Badge } from "@camp404/ui/components/badge";
import { Card, CardContent } from "@camp404/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@camp404/ui/components/table";
import { toast } from "@camp404/ui/components/toast";
import { cn } from "@camp404/ui/lib/utils";
import {
  matchesApplicationFilter,
  type ApplicationFilter,
  type ApplicationRow,
} from "@/lib/applications";
import { decideParticipationAction } from "../camp-management/actions";
import {
  DecisionBadge,
  SaysBadge,
} from "../camp-management/roster-presentation";
import {
  ThisYearDecisionButtons,
  type DecideThisYear,
} from "../camp-management/roster-table";
import { setTicketPassAction } from "./actions";

// The Applications board: filter toggles with counts over one table (a card
// list on a narrow window). A captain's rows carry the ticket record and get
// the Accept / Waiting list buttons and the two pass selects; a team lead's
// rows carry no ticket at all (the server leaves it off), so the lead sees the
// names and statuses only.
//
// A change on a row is one tap: only that control spins, and a failure is a
// toast, as on every captain list.

// One group per stored status, each label saying whether it is about the
// member's answer or the captains' decision (STANDING_LABEL).
const FILTERS: { value: ApplicationFilter; label: string }[] = [
  { value: "all", label: "All" },
  ...PARTICIPATION_STATUSES.map((value) => ({
    value,
    label: STANDING_LABEL[value],
  })),
  { value: "none", label: NO_ANSWER_LABEL },
];

// AfrikaBurn's outline toggle, as the roster's filter strip draws it.
const TOGGLE =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const TOGGLE_ON = "border-primary bg-primary/15 text-foreground";

// The kit's SelectTrigger, on a native select (keyboard and screen-reader
// safe, and Playwright reads its options).
const SELECT =
  "h-8 w-full min-w-32 cursor-pointer appearance-none rounded-md border border-input bg-background pl-2.5 pr-8 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60";

const PASS_OPTIONS: Record<TicketPass, { value: string; label: string }[]> = {
  ddt: DDT_STATUSES.map((v) => ({
    value: v,
    label: DDT_LABEL[v],
  })),
  wap: WAP_STATUSES.map((v) => ({
    value: v,
    label: WAP_LABEL[v],
  })),
};

const PASS_NAME: Record<TicketPass, (member: string) => string> = {
  ddt: (member) => `DDT for ${member}`,
  wap: (member) => `WAP for ${member}`,
};

function passValue(ticket: TicketFacts, pass: TicketPass): string {
  return pass === "ddt" ? ticket.ddt : ticket.wap;
}

/** One captain-only pass on one row, saved the moment it changes. */
function PassSelect({
  row,
  ticket,
  pass,
}: {
  row: ApplicationRow;
  ticket: TicketFacts;
  pass: TicketPass;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const saved = passValue(ticket, pass);
  // What the select shows while the change is on its way; back to the saved
  // value if it fails.
  const [shown, setShown] = useState<string | null>(null);
  const value = pending && shown !== null ? shown : saved;

  return (
    <span className="relative flex items-center gap-1.5">
      <span className="relative w-full">
        <select
          aria-label={PASS_NAME[pass](row.displayName)}
          className={SELECT}
          value={value}
          disabled={pending}
          onChange={(e) => {
            const to = e.target.value;
            setShown(to);
            startTransition(async () => {
              const result = await setTicketPassAction({
                userId: row.id,
                pass,
                from: saved,
                to,
              });
              if (result.ok) router.refresh();
              else toast.error(result.error);
            });
          }}
        >
          {PASS_OPTIONS[pass].map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50"
        />
      </span>
      {pending && (
        <Loader2
          className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
          aria-label="Saving"
        />
      )}
    </span>
  );
}

/** The member's own ticket answer, as a captain reads it. */
function TicketBadge({
  row,
  ticket,
}: {
  row: ApplicationRow;
  ticket: TicketFacts;
}) {
  const needs = stillNeedsTicket(row.thisYear, ticket);
  return (
    <Badge
      variant={
        ticket.ticketStatus === "has_ticket"
          ? "success"
          : needs
            ? "warning"
            : "outline"
      }
    >
      {TICKET_STATUS_LABEL[ticket.ticketStatus]}
    </Badge>
  );
}

export function ApplicationsBoard({
  rows,
  canEdit,
}: {
  rows: ApplicationRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<ApplicationFilter>("all");

  const filters = useMemo(() => {
    const all = canEdit
      ? [
          ...FILTERS,
          { value: "needs_ticket" as const, label: "Still need a ticket" },
        ]
      : FILTERS;
    return all.map((f) => ({
      ...f,
      count: rows.filter((r) => matchesApplicationFilter(r, f.value)).length,
    }));
  }, [rows, canEdit]);
  const shown = rows.filter((r) => matchesApplicationFilter(r, filter));

  const decide: DecideThisYear = async (row, to) => {
    // ThisYearRow's status is optional (a plain member's roster row has
    // none); every row on this page carries it.
    if (!row.thisYear) {
      return { ok: false, error: "They haven't answered yet." };
    }
    const result = await decideParticipationAction({
      userId: row.id,
      from: row.thisYear,
      to,
    });
    if (result.ok) router.refresh();
    return result;
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        role="group"
        aria-label="Show"
        className="flex flex-wrap items-center gap-1.5"
      >
        {filters.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={cn(TOGGLE, filter === f.value && TOGGLE_ON)}
          >
            {f.label}
            <span className="tabular-nums text-muted-foreground">
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {canEdit && (
        <p className="text-sm text-muted-foreground">
          Says is what the member answered; Decision is yours. You can accept,
          or put on the waiting list, a member who says Coming or Maybe. Someone
          who says Not coming, or has not answered, has to answer first. DDT
          (direct distribution ticket) and WAP (work access pass) are for
          captains only.
        </p>
      )}

      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            No approved members yet.
          </CardContent>
        </Card>
      ) : shown.length === 0 ? (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            Nobody here.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="hidden overflow-hidden page-md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Member</TableHead>
                  <TableHead scope="col">Says</TableHead>
                  <TableHead scope="col">Decision</TableHead>
                  {canEdit && (
                    <>
                      <TableHead scope="col">Ticket</TableHead>
                      <TableHead scope="col">DDT</TableHead>
                      <TableHead scope="col">WAP</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {row.displayName}
                    </TableCell>
                    <TableCell>
                      <SaysBadge says={row.says} />
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap items-center gap-2">
                        <DecisionBadge status={row.thisYear} />
                        {canEdit && (
                          <ThisYearDecisionButtons
                            row={row}
                            onDecide={decide}
                          />
                        )}
                      </span>
                    </TableCell>
                    {canEdit && row.ticket && (
                      <>
                        <TableCell>
                          <TicketBadge row={row} ticket={row.ticket} />
                        </TableCell>
                        <TableCell className="w-44">
                          <PassSelect
                            row={row}
                            ticket={row.ticket}
                            pass="ddt"
                          />
                        </TableCell>
                        <TableCell className="w-44">
                          <PassSelect
                            row={row}
                            ticket={row.ticket}
                            pass="wap"
                          />
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <ul className="flex flex-col gap-2 page-md:hidden">
            {shown.map((row) => (
              <li key={row.id}>
                <Card>
                  <CardContent className="flex flex-col gap-3 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{row.displayName}</span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <SaysBadge says={row.says} prefix />
                        <DecisionBadge status={row.thisYear} />
                      </span>
                    </div>
                    {canEdit && (
                      <ThisYearDecisionButtons row={row} onDecide={decide} />
                    )}
                    {canEdit && row.ticket && (
                      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-sm">
                        <dt className="text-muted-foreground">Ticket</dt>
                        <dd>
                          <TicketBadge row={row} ticket={row.ticket} />
                        </dd>
                        <dt className="text-muted-foreground">DDT</dt>
                        <dd>
                          <PassSelect
                            row={row}
                            ticket={row.ticket}
                            pass="ddt"
                          />
                        </dd>
                        <dt className="text-muted-foreground">WAP</dt>
                        <dd>
                          <PassSelect
                            row={row}
                            ticket={row.ticket}
                            pass="wap"
                          />
                        </dd>
                      </dl>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
