import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  DDT_LABEL,
  INTENT_LABEL,
  STANDING_LABEL,
  TICKET_STATUS_LABEL,
  WAP_LABEL,
  mayRecordTicket,
} from "@camp404/core";
import {
  MAX_MEMBER_NOTE_LENGTH,
  addMemberNote,
} from "@camp404/db/member-notes";
import { DDT_STATUSES, TICKET_STATUSES, WAP_STATUSES } from "@camp404/types";
import { applicationRows } from "../../applications";
import { auditReadAfterResponse } from "../../audit";
import { getMyParticipation as getParticipationThisYear } from "../../participations";
import { getCampManagementRoster, listMemberNotes } from "../../roster";
import { listTicketsThisYear, setTicketPass } from "../../tickets";
import { findCampUserById } from "../../users";
import { siteUrl } from "../capabilities";
import { runTool, ToolError } from "../tool-utils";

// Captains' records on members over MCP, through the pages' own functions.
// Both are captains only (GATES.captain, the pages' captainActionGate
// ("captain")); a team lead reads none of either.
//
//  - Captain notes (Camp management's member panel, addMemberNoteAction):
//    the same checks (a member who exists, 1 to 2000 characters, trimmed) and
//    the same write (@camp404/db/member-notes' addMemberNote, which the page
//    calls directly too; its member.note_added audit row records the length,
//    never the words). The member never reads them. Reading them is the
//    panel's read (listMemberNotes), recorded as the panel records it: a
//    member.notes.viewed row after the response, when at least one note was
//    shown. Adding a note answers with no notes, so it records no read.
//  - Tickets (Applications, setTicketPassAction): the year's rows as the
//    captain's page builds them (applicationRows: approved members, with
//    their ticket record), and the page's one write, a compare-and-set on
//    `from`, the value the captain saw, audited ticket.pass_changed in the
//    same transaction. A ticket status only for someone who said Coming or
//    Maybe (mayRecordTicket), in the page's words; the DDT and WAP for anyone.
//    Giving someone a place this year (Accept / Waiting list) stays on the
//    website.

const NOTES_PATH = "/captains/camp-management";
const TICKETS_PATH = "/captains/applications";

// Opaque ids, as the panel's: the E2E store's ids are not UUIDs.
const UserId = z.string().min(1).max(64);

const PassChange = z.discriminatedUnion("pass", [
  z.object({
    pass: z.literal("ticket"),
    from: z.enum(TICKET_STATUSES),
    to: z.enum(TICKET_STATUSES),
  }),
  z.object({
    pass: z.literal("ddt"),
    from: z.enum(DDT_STATUSES),
    to: z.enum(DDT_STATUSES),
  }),
  z.object({
    pass: z.literal("wap"),
    from: z.enum(WAP_STATUSES),
    to: z.enum(WAP_STATUSES),
  }),
]);

/** What a pass's value reads as on the Applications page. */
export function passLabel(pass: string, value: string): string {
  const labels: Record<string, Readonly<Record<string, string>>> = {
    ticket: TICKET_STATUS_LABEL,
    ddt: DDT_LABEL,
    wap: WAP_LABEL,
  };
  return labels[pass]?.[value] ?? value;
}

export const PASS_NAME: Readonly<Record<string, string>> = {
  ticket: "ticket",
  ddt: "DDT",
  wap: "WAP",
};

export const NOT_COMING_TICKET =
  "They have to say Coming or Maybe before a ticket can be recorded.";

export function registerCaptainPeopleTools(server: McpServer): void {
  server.registerTool(
    "list_member_notes",
    {
      title: "Read captains' notes on a member",
      description:
        "The captains' private notes on one member, newest first, as their panel on Camp management shows them: the words, who wrote each and when. Never repeat them to the member or anyone but a captain. Each read that shows a note is recorded with your name.",
      inputSchema: z.object({ userId: UserId }),
    },
    async (args, extra) =>
      runTool({
        toolName: "list_member_notes",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const member = await findCampUserById(args.userId);
          if (!member) throw new ToolError("Member not found.");
          const notes = await listMemberNotes(args.userId);
          if (notes.length > 0) {
            auditReadAfterResponse({
              actorId: scope.campUserId,
              action: "member.notes.viewed",
              target: args.userId,
              metadata: { count: notes.length },
            });
          }
          return {
            userId: args.userId,
            displayName: member.displayName,
            notes: notes.map((n) => ({
              id: n.id,
              body: n.body,
              createdAt: n.createdAt,
              authorName: n.authorName,
            })),
            url: siteUrl(NOTES_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "add_member_note",
    {
      title: "Add a captains' note to a member",
      description: `Adds a private note to a member, as the Notes box in their panel on Camp management does: only captains read it, never the member, and it is never in an export. At most ${MAX_MEMBER_NOTE_LENGTH} characters. A note cannot be changed or removed afterwards.`,
      inputSchema: z.object({ userId: UserId, body: z.string() }),
    },
    async (args, extra) =>
      runTool({
        toolName: "add_member_note",
        extra,
        // The note's words stay out of the connector's log, as they stay out
        // of the audit row.
        argsForAudit: { userId: args.userId, length: args.body.trim().length },
        handler: async ({ scope }) => {
          const text = args.body.trim();
          if (!text) throw new ToolError("Write the note first.");
          if (text.length > MAX_MEMBER_NOTE_LENGTH) {
            throw new ToolError(
              `Keep a note under ${MAX_MEMBER_NOTE_LENGTH} characters.`,
            );
          }
          if (!(await findCampUserById(args.userId))) {
            throw new ToolError("Member not found.");
          }
          await addMemberNote({
            userId: args.userId,
            authorId: scope.campUserId,
            body: text,
          });
          return { userId: args.userId, added: true, url: siteUrl(NOTES_PATH) };
        },
      }),
  );

  server.registerTool(
    "list_tickets",
    {
      title: "List this year's tickets",
      description:
        "Every approved member this year, as Applications shows a captain: what they said (Coming, Maybe, Not coming), where they stand, and their ticket status, DDT and WAP. The raw values are what set_ticket_pass takes as `from`. Narrow with `userId`.",
      inputSchema: z.object({ userId: UserId.optional() }),
    },
    async (args, extra) =>
      runTool({
        toolName: "list_tickets",
        extra,
        argsForAudit: args,
        handler: async () => {
          const [members, tickets] = await Promise.all([
            getCampManagementRoster(),
            listTicketsThisYear(),
          ]);
          const rows = applicationRows(members, tickets).filter(
            (r) => !args.userId || r.id === args.userId,
          );
          return {
            members: rows.map((r) => ({
              userId: r.id,
              displayName: r.displayName,
              says: r.says ? INTENT_LABEL[r.says] : null,
              standing: r.thisYear ? STANDING_LABEL[r.thisYear] : null,
              ticketStatus: r.ticket!.ticketStatus,
              ticketLabel: TICKET_STATUS_LABEL[r.ticket!.ticketStatus],
              ddt: r.ticket!.ddt,
              ddtLabel: DDT_LABEL[r.ticket!.ddt],
              wap: r.ticket!.wap,
              wapLabel: WAP_LABEL[r.ticket!.wap],
            })),
            url: siteUrl(TICKETS_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "set_ticket_pass",
    {
      title: "Set a member's ticket, DDT or WAP",
      description:
        "Sets one of a member's three for this year, as Applications does: `pass` ticket (unknown, buying_own, has_ticket, needs_directed_ticket; only if they said Coming or Maybe), ddt (none, allocated, can_transfer) or wap (not_needed, requested, issued). Give `from`, the value list_tickets showed: if it changed since, nothing changes.",
      inputSchema: z.object({
        userId: UserId,
        pass: z.enum(["ticket", "ddt", "wap"]),
        from: z.string(),
        to: z.string(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "set_ticket_pass",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const parsed = PassChange.safeParse(args);
          if (!parsed.success) {
            throw new ToolError(
              `That isn't a ${PASS_NAME[args.pass]} value. Read them with list_tickets.`,
            );
          }
          const change = parsed.data;
          const [target, participation] = await Promise.all([
            findCampUserById(args.userId),
            change.pass === "ticket"
              ? getParticipationThisYear(args.userId)
              : null,
          ]);
          if (!target) throw new ToolError("Member not found.");
          if (
            change.pass === "ticket" &&
            !mayRecordTicket(participation?.status ?? null)
          ) {
            throw new ToolError(NOT_COMING_TICKET);
          }
          const result = {
            userId: args.userId,
            pass: change.pass,
            value: change.to,
            label: passLabel(change.pass, change.to),
            url: siteUrl(TICKETS_PATH),
          };
          if (change.from === change.to) return result;
          const saved = await setTicketPass({
            ...change,
            userId: args.userId,
            actorUserId: scope.campUserId,
          });
          if (!saved) {
            const name = target.displayName?.trim() || "This member";
            throw new ToolError(
              `${name}'s ${PASS_NAME[change.pass]} changed while you were looking. Read it again with list_tickets, show the person, then retry.`,
            );
          }
          return result;
        },
      }),
  );
}
