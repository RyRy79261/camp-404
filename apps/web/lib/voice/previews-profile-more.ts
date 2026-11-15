import { TICKET_STATUS_OPTION, mayRecordTicket } from "@camp404/core";
import type { TicketStatus } from "@camp404/types";
import { getCampBlurb } from "../join-site";
import { SAY_COMING_FIRST } from "../mcp/tools/profile-more";
import { getMyParticipation } from "../participations";
import { getTelegramConnection } from "../telegram-connection";
import { getMyTicket } from "../tickets";
import { findCampUserById } from "../users";
import { blocked, quote, shown, str, type PreviewFn } from "./preview-kit";

// The person's own profile (tools/profile-more.ts): each row read from what
// is stored now, so the person sees what changes from what.

const NOTICES: Record<string, string> = {
  mine: "only notices about you",
  all: "all your notices",
};

export const PROFILE_MORE_PREVIEWS: Readonly<Record<string, PreviewFn>> = {
  async set_my_display_name(args, ctx) {
    const user = await findCampUserById(ctx.scope.campUserId);
    const name = str(args.displayName).trim();
    if (!name) {
      return blocked(
        "Change your name",
        "Display name can't be empty.",
        args,
        "/profile/edit",
      );
    }
    return {
      sentence: `Change your name to ${quote(name)}`,
      facts: `Your profile · now ${shown(user?.displayName ?? "")}`,
      change: [`Name: ${shown(name)}`],
      path: "/profile/edit",
      args,
      keys: ["me:name"],
    };
  },

  async update_my_camp_blurb(args, ctx) {
    const card = await getCampBlurb(ctx.scope.campUserId);
    if (args.showOnJoin === true && !ctx.scope.isCaptain) {
      return blocked(
        "Show your card on join.camp-404.com",
        "Only a captain's card is shown on join.camp-404.com.",
        args,
        "/profile/edit",
      );
    }
    const change: string[] = [];
    if (args.title !== undefined) change.push(`Title: ${shown(args.title)}`);
    if (args.blurb !== undefined) change.push(`Blurb: ${shown(args.blurb)}`);
    if (args.showOnJoin !== undefined) {
      change.push(
        `On join.camp-404.com: ${args.showOnJoin ? "shown" : "not shown"}`,
      );
    }
    const willShow =
      ctx.scope.isCaptain &&
      (typeof args.showOnJoin === "boolean"
        ? args.showOnJoin
        : card.showOnJoin);
    return {
      sentence: "Change what you are in camp",
      facts: willShow
        ? "Your profile · shown on the public join.camp-404.com"
        : "Your profile",
      change,
      path: "/profile/edit",
      args,
      keys: ["me:camp-card"],
    };
  },

  async set_my_ticket_status(args, ctx) {
    const [ticket, participation] = await Promise.all([
      getMyTicket(ctx.scope.campUserId),
      getMyParticipation(ctx.scope.campUserId),
    ]);
    const to = str(args.ticketStatus) as TicketStatus;
    const label = TICKET_STATUS_OPTION[to] ?? to;
    if (!mayRecordTicket(participation?.status ?? null)) {
      return blocked(
        `Say your ticket: ${label}`,
        SAY_COMING_FIRST,
        args,
        "/profile",
      );
    }
    return {
      sentence: `Say your ticket: ${quote(label)}`,
      facts: `This year · now ${quote(TICKET_STATUS_OPTION[ticket.ticketStatus])}`,
      path: "/profile",
      args,
      keys: ["me:ticket"],
    };
  },

  async set_my_telegram_notices(args, ctx) {
    const telegram = await getTelegramConnection(ctx.scope.campUserId);
    const to = str(args.notices);
    return {
      sentence: `Have Ol' Jeb send you ${NOTICES[to] ?? to} on Telegram`,
      facts: `Telegram · now ${NOTICES[telegram.notices]}${telegram.connected ? "" : " · not connected yet"}`,
      path: "/profile",
      args,
      keys: ["me:telegram-notices"],
    };
  },
};
