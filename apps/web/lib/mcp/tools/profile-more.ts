import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  DDT_LABEL,
  MAX_CAMP_BLURB_LENGTH,
  MAX_CAMP_TITLE_LENGTH,
  TICKET_STATUS_OPTION,
  WAP_LABEL,
  mayRecordTicket,
} from "@camp404/core";
import { TICKET_STATUSES } from "@camp404/types";
import { getCampBlurb, setCampBlurb } from "../../join-site";
import { getMyParticipation } from "../../participations";
import {
  getTelegramConnection,
  setTelegramNotices,
} from "../../telegram-connection";
import { getMyTicket, setMyTicketStatus } from "../../tickets";
import { findCampUserById, setDisplayName } from "../../users";
import { siteUrl } from "../capabilities";
import type { McpScope } from "../scope";
import { runTool, ToolError } from "../tool-utils";

// The rest of the person's own profile over MCP, through the Profile pages'
// own functions (lib/users.ts, lib/join-site.ts, lib/tickets.ts,
// lib/telegram-connection.ts, each a twin() facade). Every write is the
// caller's own: the id is the signed-in person's, never one passed in.
//
//  - The name is updateProfile's name half (the same trim and 80-character
//    cap). The form's other field is the photo's URL, an upload: the photo
//    stays on the website, and this never touches it.
//  - "What I am in camp" is updateCampBlurb: the same limits, and only a
//    captain may have it shown on join.camp-404.com (for anyone else the
//    switch is stored off, as the action does). Fields left out keep what is
//    stored: nobody else writes a member's card, so there is no race to guard.
//  - The ticket is setMyTicketAction: the same mayRecordTicket rule, in the
//    page's sentence. The DDT and WAP are the captains' (set_ticket_pass).
//  - Telegram notices are setTelegramNoticesAction ("mine" or "all").
//    Linking and disconnecting Telegram stay on the website.

const MAX_NAME_LENGTH = 80;
const NOTICE_LABEL = {
  mine: "Only notices about you",
  all: "All my notices",
} as const;

/** The person's own profile, as the Profile and its edit page show it. */
async function readProfile(scope: McpScope) {
  const userId = scope.campUserId;
  const [user, card, ticket, participation, telegram] = await Promise.all([
    findCampUserById(userId),
    getCampBlurb(userId),
    getMyTicket(userId),
    getMyParticipation(userId),
    getTelegramConnection(userId),
  ]);
  return {
    displayName: user?.displayName ?? null,
    campTitle: card.title,
    campBlurb: card.blurb,
    showOnJoin: card.showOnJoin,
    mayShowOnJoin: scope.isCaptain,
    thisYear: participation?.status ?? null,
    ticket: {
      ticketStatus: ticket.ticketStatus,
      ticketLabel: TICKET_STATUS_OPTION[ticket.ticketStatus],
      ddt: DDT_LABEL[ticket.ddt],
      wap: WAP_LABEL[ticket.wap],
      mayRecord: mayRecordTicket(participation?.status ?? null),
    },
    telegram: {
      connected: telegram.connected,
      notices: telegram.notices,
      noticesLabel: NOTICE_LABEL[telegram.notices],
    },
    url: siteUrl("/profile"),
  };
}

/** The sentence setMyTicketAction refuses with. */
export const SAY_COMING_FIRST =
  "Say you're coming this year first, then add your ticket.";

export function registerProfileMoreTools(server: McpServer): void {
  server.registerTool(
    "get_my_profile",
    {
      title: "Read my profile",
      description:
        "Your own profile: your name, camp title and blurb (and whether join.camp-404.com shows them), where you stand this year, your ticket status with the DDT and WAP captains set for you, and which Telegram notices Ol' Jeb sends you.",
      inputSchema: z.object({}),
    },
    async (_args, extra) =>
      runTool({
        toolName: "get_my_profile",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => readProfile(scope),
      }),
  );

  server.registerTool(
    "set_my_display_name",
    {
      title: "Change my name",
      description: `Changes the name the camp sees you by, as Edit profile's Save does: at most ${MAX_NAME_LENGTH} characters. Your photo stays as it is (change it on the website).`,
      inputSchema: z.object({ displayName: z.string() }),
    },
    async (args, extra) =>
      runTool({
        toolName: "set_my_display_name",
        extra,
        argsForAudit: { fields: ["displayName"] },
        handler: async ({ scope }) => {
          const name = args.displayName.trim();
          if (!name) throw new ToolError("Display name can't be empty.");
          if (name.length > MAX_NAME_LENGTH) {
            throw new ToolError(
              `Display name must be ${MAX_NAME_LENGTH} characters or fewer.`,
            );
          }
          await setDisplayName(scope.campUserId, name);
          return { displayName: name, url: siteUrl("/profile") };
        },
      }),
  );

  server.registerTool(
    "update_my_camp_blurb",
    {
      title: "Change what I am in camp",
      description: `Changes your camp title (at most ${MAX_CAMP_TITLE_LENGTH} characters) and blurb (at most ${MAX_CAMP_BLURB_LENGTH}); "" clears one, and what you leave out stays. Captains only: \`showOnJoin\` puts your card on the public join.camp-404.com at once, and a card already shown changes there too.`,
      inputSchema: z.object({
        title: z.string().optional(),
        blurb: z.string().optional(),
        showOnJoin: z.boolean().optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "update_my_camp_blurb",
        extra,
        // Free text stays out of the connector's log: only what was given.
        argsForAudit: {
          fields: Object.keys(args).filter(
            (k) => args[k as keyof typeof args] !== undefined,
          ),
          showOnJoin: args.showOnJoin,
        },
        handler: async ({ scope }) => {
          const current = await getCampBlurb(scope.campUserId);
          const title = (args.title ?? current.title ?? "").trim();
          const blurb = (args.blurb ?? current.blurb ?? "").trim();
          if (title.length > MAX_CAMP_TITLE_LENGTH) {
            throw new ToolError(
              `Keep your title to ${MAX_CAMP_TITLE_LENGTH} characters.`,
            );
          }
          if (blurb.length > MAX_CAMP_BLURB_LENGTH) {
            throw new ToolError(
              `Keep your blurb to ${MAX_CAMP_BLURB_LENGTH} characters.`,
            );
          }
          if (args.showOnJoin && !scope.isCaptain) {
            throw new ToolError(
              "Only a captain's card is shown on join.camp-404.com.",
            );
          }
          const showOnJoin =
            scope.isCaptain && (args.showOnJoin ?? current.showOnJoin);
          await setCampBlurb(scope.campUserId, {
            title: title || null,
            blurb: blurb || null,
            showOnJoin,
          });
          return {
            campTitle: title || null,
            campBlurb: blurb || null,
            showOnJoin,
            url: siteUrl("/profile/edit"),
          };
        },
      }),
  );

  server.registerTool(
    "set_my_ticket_status",
    {
      title: "Say where my ticket stands",
      description:
        "Says where your own Burn ticket stands this year, as your profile's This year card does: unknown (not sorted yet), buying_own, has_ticket, or needs_directed_ticket (you want a DDT from the camp). Only once you have said you are coming or maybe.",
      inputSchema: z.object({ ticketStatus: z.enum(TICKET_STATUSES) }),
    },
    async (args, extra) =>
      runTool({
        toolName: "set_my_ticket_status",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const participation = await getMyParticipation(scope.campUserId);
          if (!mayRecordTicket(participation?.status ?? null)) {
            throw new ToolError(SAY_COMING_FIRST);
          }
          await setMyTicketStatus({
            userId: scope.campUserId,
            ticketStatus: args.ticketStatus,
          });
          return {
            ticketStatus: args.ticketStatus,
            ticketLabel: TICKET_STATUS_OPTION[args.ticketStatus],
            url: siteUrl("/profile"),
          };
        },
      }),
  );

  server.registerTool(
    "set_my_telegram_notices",
    {
      title: "Pick my Telegram notices",
      description:
        'Which notices Ol\' Jeb sends you on Telegram: "mine" (only notices about you: forms you owe, your tasks, approval) or "all" (announcements and team messages too). It applies once your Telegram is connected (on your profile).',
      inputSchema: z.object({ notices: z.enum(["mine", "all"]) }),
    },
    async (args, extra) =>
      runTool({
        toolName: "set_my_telegram_notices",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          await setTelegramNotices(scope.campUserId, args.notices);
          const { connected } = await getTelegramConnection(scope.campUserId);
          return {
            notices: args.notices,
            noticesLabel: NOTICE_LABEL[args.notices],
            connected,
            url: siteUrl("/profile"),
          };
        },
      }),
  );
}
