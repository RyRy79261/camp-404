import { DEFAULT_TICKET, mayRecordTicket } from "@camp404/core";
import { MAX_MEMBER_NOTE_LENGTH } from "@camp404/db/member-notes";
import {
  NOT_COMING_TICKET,
  PASS_NAME,
  passLabel,
} from "../mcp/tools/captain-people";
import { getMyParticipation as getParticipationThisYear } from "../participations";
import { listTicketsThisYear } from "../tickets";
import { findCampUserById } from "../users";
import { blocked, quote, shown, str, type PreviewFn } from "./preview-kit";

// Captains' notes and tickets (tools/captain-people.ts). The member is named
// from the roster, never from Claude's words; a ticket change runs on the
// value stored now, so Do changes only what the captain saw.

const TICKETS = "/captains/applications";
const NOTES = "/captains/camp-management";

export const CAPTAIN_PEOPLE_PREVIEWS: Readonly<Record<string, PreviewFn>> = {
  async add_member_note(args) {
    const member = await findCampUserById(str(args.userId));
    if (!member) {
      return blocked("Add a captains' note", "Member not found.", args, NOTES);
    }
    const name = member.displayName?.trim() || "Unnamed burner";
    const body = str(args.body).trim();
    if (!body || body.length > MAX_MEMBER_NOTE_LENGTH) {
      return blocked(
        `Add a captains' note to ${name}`,
        body
          ? `Keep a note under ${MAX_MEMBER_NOTE_LENGTH} characters.`
          : "Write the note first.",
        args,
        NOTES,
      );
    }
    return {
      sentence: `Add a captains' note to ${name}`,
      facts:
        "Camp management · captains only, never the member · can't be removed",
      change: [`Note: ${shown(body)}`],
      path: NOTES,
      args,
      keys: [`member-notes:${member.id}`],
    };
  },

  async set_ticket_pass(args) {
    const userId = str(args.userId);
    const pass = str(args.pass);
    const passName = PASS_NAME[pass] ?? pass;
    const [member, tickets, participation] = await Promise.all([
      findCampUserById(userId),
      listTicketsThisYear(),
      pass === "ticket" ? getParticipationThisYear(userId) : null,
    ]);
    if (!member) {
      return blocked(`Set a ${passName}`, "Member not found.", args, TICKETS);
    }
    const name = member.displayName?.trim() || "Unnamed burner";
    if (pass === "ticket" && !mayRecordTicket(participation?.status ?? null)) {
      return blocked(`Set ${name}'s ticket`, NOT_COMING_TICKET, args, TICKETS);
    }
    const ticket = tickets.get(userId) ?? DEFAULT_TICKET;
    const from =
      pass === "ticket"
        ? ticket.ticketStatus
        : pass === "ddt"
          ? ticket.ddt
          : ticket.wap;
    const to = str(args.to);
    return {
      sentence: `Set ${name}'s ${passName} to ${quote(passLabel(pass, to))}`,
      facts: `Applications · this year · now ${quote(passLabel(pass, from))}`,
      path: TICKETS,
      args: { ...args, from },
      keys: [`ticket:${userId}:${pass}`],
    };
  },
};
