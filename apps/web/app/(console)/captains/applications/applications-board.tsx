"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import {
  DDT_LABEL,
  INTENT_LABEL,
  NO_ANSWER_LABEL,
  STANDING_LABEL,
  WAP_LABEL,
  TICKET_STATUS_LABEL,
  DEFAULT_TICKET,
  mayRecordTicket,
  type TicketFacts,
} from "@camp404/core";
import {
  DDT_STATUSES,
  PARTICIPATION_STATUSES,
  TICKET_STATUSES,
  WAP_STATUSES,
  type TicketPass,
} from "@camp404/types";
import { Card, CardContent } from "@camp404/ui/components/card";
import { Input } from "@camp404/ui/components/input";
import {
  ResponsiveDataTable,
  type ResponsiveColumn,
} from "@camp404/ui/components/responsive-data-table";
import { toast } from "@camp404/ui/components/toast";
import { NativeSelect } from "@/components/inventory/native-select";
import {
  NO_FILTERS,
  applicationCountLine,
  filterApplicationRows,
  matchesTicketFilter,
  matchesYearFilter,
  type ApplicationFilters,
  type ApplicationRow,
  type TicketFilter,
  type YearFilter,
} from "@/lib/applications";
import { decideParticipationAction } from "../camp-management/actions";
import {
  DecisionBadge,
  SaysBadge,
} from "../camp-management/roster-presentation";
import type { DecideThisYear } from "../camp-management/roster-table";
import { setTicketPassAction } from "./actions";
import { DecisionToggle } from "./decision-toggle";

// The Applications board, after AfrikaBurn's registrations list: two
// labelled filters and a name search, a count line, then one table that
// turns into cards when its window is narrow (ResponsiveDataTable).
//
// A captain's rows carry the ticket record: the Ticket, DDT and WAP selects at
// one width, and the decision as one [Accept | Waiting list] control in the
// right-hand column, the same on every row. A team lead's rows carry no ticket
// at all (the server leaves it off), so the lead reads the names, what each
// member said and what the captains decided.
//
// A change on a row is one tap: only that control spins, and a failure is a
// toast, as on every captain list.

/** "This year": the member's answer and the captains' decision, one each. */
const YEAR_OPTIONS: { value: YearFilter; label: string }[] = [
  { value: "all", label: "Everyone" },
  // What the member said, whatever the captains decided.
  { value: "coming", label: INTENT_LABEL.yes },
  ...PARTICIPATION_STATUSES.map((value) => ({
    value,
    label: STANDING_LABEL[value],
  })),
  { value: "none", label: NO_ANSWER_LABEL },
];

/** "Ticket" (captains only). */
const TICKET_OPTIONS: { value: TicketFilter; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "needs_ticket", label: "Still needs a ticket" },
  { value: "wants_ddt", label: "Wants a DDT, not given" },
  { value: "wap_requested", label: "WAP requested" },
];

// The kit's select, on a native <select> (keyboard and screen-reader safe,
// the system picker on a phone, and Playwright reads its options). 44px tall
// in a card, for a thumb; 36px in the table, so every row is one height.
const SELECT =
  "h-11 w-full cursor-pointer appearance-none rounded-md border border-input bg-background pl-2 pr-7 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60 @min-[48rem]/rdt:h-9";

/**
 * Each of Ticket, DDT and WAP is one width on every row (and in every card).
 * The ticket's longest word ("Wants a DDT") needs a little more room.
 */
const PASS_WIDTH: Record<TicketPass, string> = {
  ticket: "w-44 @min-[48rem]/rdt:w-32",
  ddt: "w-44 @min-[48rem]/rdt:w-[7.5rem]",
  wap: "w-44 @min-[48rem]/rdt:w-[7.5rem]",
};

const PASS_OPTIONS: Record<TicketPass, { value: string; label: string }[]> = {
  ticket: TICKET_STATUSES.map((v) => ({
    value: v,
    label: TICKET_STATUS_LABEL[v],
  })),
  ddt: DDT_STATUSES.map((v) => ({
    value: v,
    label: DDT_LABEL[v],
  })),
  wap: WAP_STATUSES.map((v) => ({
    value: v,
    label: WAP_LABEL[v],
  })),
};

const PASS_LABEL: Record<TicketPass, Record<string, string>> = {
  ticket: TICKET_STATUS_LABEL,
  ddt: DDT_LABEL,
  wap: WAP_LABEL,
};

const PASS_NAME: Record<TicketPass, (member: string) => string> = {
  ticket: (member) => `Ticket for ${member}`,
  ddt: (member) => `DDT for ${member}`,
  wap: (member) => `WAP for ${member}`,
};

function passValue(ticket: TicketFacts, pass: TicketPass): string {
  return pass === "ticket"
    ? ticket.ticketStatus
    : pass === "ddt"
      ? ticket.ddt
      : ticket.wap;
}

/** One captain field on one row, saved the moment it changes. */
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
    <span className={`relative inline-flex ${PASS_WIDTH[pass]}`}>
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
      {pending ? (
        <Loader2
          className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
          aria-label="Saving"
        />
      ) : (
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50"
        />
      )}
    </span>
  );
}

/**
 * A member who said Not coming, or has not answered, is not in this year's
 * list: their ticket, DDT and WAP are read, not set (mayRecordTicket, the rule
 * the member's own form keeps). A DDT or WAP the captains already gave stays a
 * select, so it can be taken back.
 */
function PassCell({
  row,
  ticket,
  pass,
}: {
  row: ApplicationRow;
  ticket: TicketFacts;
  pass: TicketPass;
}) {
  const value = passValue(ticket, pass);
  const atDefault = value === passValue(DEFAULT_TICKET, pass);
  if (mayRecordTicket(row.thisYear) || (pass !== "ticket" && !atDefault)) {
    return <PassSelect row={row} ticket={ticket} pass={pass} />;
  }
  return (
    <span
      className={`inline-flex h-11 items-center text-sm text-muted-foreground @min-[48rem]/rdt:h-9 ${PASS_WIDTH[pass]}`}
    >
      {atDefault ? (
        <>
          <span aria-hidden>—</span>
          <span className="sr-only">{PASS_LABEL[pass][value]}</span>
        </>
      ) : (
        PASS_LABEL[pass][value]
      )}
    </span>
  );
}

/** A labelled filter, as AfrikaBurn's RegistrationFilters draws one. */
function FilterField({
  label,
  wide = false,
  children,
}: {
  label: string;
  /** Across both columns on a phone. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      className={`flex min-w-0 flex-col gap-1.5 text-xs page-sm:w-52 ${wide ? "col-span-2" : ""}`}
    >
      <span className="font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function columnsFor(
  canEdit: boolean,
  decide: DecideThisYear,
): ResponsiveColumn<ApplicationRow>[] {
  const member: ResponsiveColumn<ApplicationRow> = {
    id: "member",
    header: "Member",
    role: "title",
    truncate: (r) => r.displayName,
    // Narrow enough that the six columns fit the window Applications opens
    // in; a longer name is cut, with the whole name as its tooltip.
    cellClassName: "max-w-32 align-middle",
    // A captain opens the member's panel on the roster.
    cell: (r) =>
      canEdit ? (
        <Link
          href={`/captains/camp-management?member=${encodeURIComponent(r.id)}`}
          className="font-medium underline-offset-4 hover:underline"
        >
          {r.displayName}
        </Link>
      ) : (
        <span className="font-medium">{r.displayName}</span>
      ),
  };
  const says: ResponsiveColumn<ApplicationRow> = {
    id: "says",
    header: <span title="What the member answered">Says</span>,
    cellClassName: "whitespace-nowrap align-middle",
    cell: (r) => <SaysBadge says={r.says} />,
  };

  if (!canEdit) {
    return [
      member,
      says,
      {
        id: "decision",
        header: <span title="What the captains decided">Decision</span>,
        cellClassName: "whitespace-nowrap align-middle",
        cell: (r) => (
          <DecisionBadge
            status={r.thisYear}
            empty={
              <span className="text-muted-foreground" title="Nothing to decide">
                —
              </span>
            }
          />
        ),
      },
    ];
  }

  const pass = (
    id: TicketPass,
    header: ReactNode,
  ): ResponsiveColumn<ApplicationRow> => ({
    id,
    header,
    cellClassName: "whitespace-nowrap align-middle",
    cell: (r) =>
      r.ticket ? <PassCell row={r} ticket={r.ticket} pass={id} /> : null,
  });

  return [
    member,
    says,
    pass("ticket", <span title="The member's own answer">Ticket</span>),
    pass("ddt", <span title="Direct distribution ticket">DDT</span>),
    pass("wap", <span title="Work access pass">WAP</span>),
    {
      id: "decision",
      header: <span title="Yours to set">Decision</span>,
      role: "actions",
      cellClassName: "align-middle",
      cardClassName: "w-full",
      cell: (r) => <DecisionToggle row={r} onDecide={decide} />,
    },
  ];
}

export function ApplicationsBoard({
  rows,
  canEdit,
}: {
  rows: ApplicationRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [filters, setFilters] = useState<ApplicationFilters>(NO_FILTERS);
  const set = (change: Partial<ApplicationFilters>) =>
    setFilters((f) => ({ ...f, ...change }));

  const yearOptions = useMemo(
    () =>
      YEAR_OPTIONS.map((o) => ({
        value: o.value,
        label: `${o.label} (${rows.filter((r) => matchesYearFilter(r, o.value)).length})`,
      })),
    [rows],
  );
  const ticketOptions = useMemo(
    () =>
      TICKET_OPTIONS.map((o) => ({
        value: o.value,
        label:
          o.value === "any"
            ? o.label
            : `${o.label} (${rows.filter((r) => matchesTicketFilter(r, o.value)).length})`,
      })),
    [rows],
  );
  const shown = filterApplicationRows(rows, filters);

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
  const columns = columnsFor(canEdit, decide);

  if (rows.length === 0) {
    return <EmptyNote>No approved members yet.</EmptyNote>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Two columns on a phone, so the first member is in sight; one row
          of fields from page-sm. */}
      <div className="grid grid-cols-2 gap-3 page-sm:flex page-sm:flex-wrap page-sm:items-end page-sm:gap-4">
        <FilterField label="This year" wide={canEdit}>
          <NativeSelect
            aria-label="This year"
            options={yearOptions}
            value={filters.year}
            onChange={(e) => set({ year: e.target.value as YearFilter })}
          />
        </FilterField>
        {canEdit && (
          <FilterField label="Ticket">
            <NativeSelect
              aria-label="Ticket"
              options={ticketOptions}
              value={filters.ticket}
              onChange={(e) => set({ ticket: e.target.value as TicketFilter })}
            />
          </FilterField>
        )}
        <FilterField label="Name">
          <Input
            type="search"
            aria-label="Find a member by name"
            placeholder="Find a member"
            value={filters.query}
            onChange={(e) => set({ query: e.target.value })}
          />
        </FilterField>
      </div>

      {shown.length === 0 ? (
        <EmptyNote>Nobody matches these filters.</EmptyNote>
      ) : (
        <div className="flex flex-col gap-3">
          <p role="status" className="text-sm text-muted-foreground">
            {applicationCountLine(shown)}
          </p>
          <ResponsiveDataTable
            columns={columns}
            data={shown}
            getRowKey={(r) => r.id}
            label="Applications"
            framed
          />
        </div>
      )}
    </div>
  );
}

function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardContent className="p-8 text-center text-sm text-muted-foreground">
        {children}
      </CardContent>
    </Card>
  );
}
