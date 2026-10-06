import type { McpServer } from "@modelcontextprotocol/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { createHttpDb } from "@camp404/db";
import * as schema from "@camp404/db/schema";
import { INBOX_FILTERS } from "@camp404/types";
import { feedIds } from "@/app/(console)/notifications/filter";
import {
  listInbox,
  markAllRead,
  markRead,
  type InboxItem,
} from "../../notifications";
import { siteUrl } from "../capabilities";
import { runTool } from "../tool-utils";

// The person's own inbox over MCP (/notifications), through the inbox's own
// functions (lib/notifications.ts → @camp404/db/broadcasts). Every read and
// write is scoped to the caller's own rows by `user_id` in the query itself.
//
//  - Paged as the page pages: newest first, 30 at a time, `nextCursor` back
//    as `before` for the next page; the page's tabs as `filter`.
//  - Listing marks nothing read (the page marks the page it drew; here the
//    person says so with mark_notifications_read or "all").
//  - A pop-up is never marked read here: on a pop-up `read_at` means "already
//    shown", so clearing it would spend a one-time notice no screen drew
//    (feedIds, the page's own rule; markAllRead leaves them too).
//  - No audit row: the site writes none for reading your own inbox.

/** A link inside the app becomes the page's full address. */
function linkOf(link: string): string {
  return link.startsWith("/") ? siteUrl(link) : link;
}

function present(item: InboxItem) {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    body: item.body,
    from: item.senderName,
    presentation: item.presentation,
    sentTo: item.sentTo ?? null,
    createdAt: item.createdAt,
    read: item.readAt !== null,
    acknowledged: item.acknowledgedAt !== null,
    url: linkOf(item.link),
  };
}

export function registerInboxTools(server: McpServer): void {
  server.registerTool(
    "list_my_notifications",
    {
      title: "List my notifications",
      description:
        "Your inbox, as the Notifications page shows it: newest first, 30 a page. `filter` is the page's tab (all, unread, announcements). Give `before` the `nextCursor` of the last page for the next one (null when there are no more). Listing marks nothing read.",
      inputSchema: z.object({
        filter: z.enum(INBOX_FILTERS).optional(),
        before: z.string().min(1).max(100).optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "list_my_notifications",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const page = await listInbox(scope.campUserId, {
            before: args.before ?? null,
            filter: args.filter ?? "all",
          });
          return {
            items: page.items.map(present),
            nextCursor: page.nextCursor,
            url: siteUrl("/notifications"),
          };
        },
      }),
  );

  server.registerTool(
    "mark_notifications_read",
    {
      title: "Mark notifications read",
      description:
        "Marks some of your notifications read, by the ids list_my_notifications gave. Only your own; a pop-up is left for the app to show you first.",
      inputSchema: z.object({ ids: z.array(z.string().uuid()).min(1).max(30) }),
    },
    async (args, extra) =>
      runTool({
        toolName: "mark_notifications_read",
        extra,
        argsForAudit: { count: args.ids.length },
        handler: async ({ scope }) => {
          // Only the caller's own rows are read, then the page's own filter.
          const rows = await createHttpDb()
            .select({
              id: schema.notificationDeliveries.id,
              presentation: schema.notificationDeliveries.presentation,
            })
            .from(schema.notificationDeliveries)
            .where(
              and(
                eq(schema.notificationDeliveries.userId, scope.campUserId),
                inArray(schema.notificationDeliveries.id, args.ids),
              ),
            );
          const ids = feedIds(rows);
          await markRead(scope.campUserId, ids);
          return {
            marked: ids,
            popupsLeft: rows.length - ids.length,
            notFound: args.ids.length - rows.length,
          };
        },
      }),
  );

  server.registerTool(
    "mark_all_notifications_read",
    {
      title: "Mark all my notifications read",
      description:
        "The inbox's Mark all read: clears every unread notification of yours except pop-ups the app has not shown yet. Says how many it cleared.",
      inputSchema: z.object({}),
    },
    async (_args, extra) =>
      runTool({
        toolName: "mark_all_notifications_read",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => ({
          cleared: await markAllRead(scope.campUserId),
        }),
      }),
  );
}
