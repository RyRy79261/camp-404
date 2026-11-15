import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { canSendToAudience } from "@camp404/core";
import type { Audience } from "@camp404/db/broadcasts";
import {
  AnnouncementAudience,
  AnnouncementPresentation,
  ComposeAnnouncementInput,
} from "@camp404/types";
import {
  NOT_YOUR_PIN,
  NOT_YOUR_TEAM,
  PERSON_GONE,
} from "@/lib/announcement-audience-copy";
import { activeTeams, getTeamsConfig, teamLabelMap } from "../../camp-config";
import {
  createAnnouncementDraft,
  explainDraftRefusal,
  getAnnouncementPickerData,
  getAnnouncementPinContext,
  listAnnouncements,
  setAnnouncementPinned,
  updateAnnouncementDraft,
} from "../../notifications";
import { siteUrl } from "../capabilities";
import type { McpScope } from "../scope";
import { runTool, ToolError } from "../tool-utils";

// Announcements over MCP, through the page's own functions (lib/notifications,
// a twin() facade over @camp404/db/broadcasts), gated as the page's actions
// are: requireSender (a captain, or a lead of a team this year: GATES.teamLead)
// and then canSendToAudience on the audience, plus for a captain the two
// checks that rule does not know (chosen people still in the camp, a team
// still switched on). Those are audienceRefusal in the page's actions file,
// which a "use server" file cannot export; this is the same check, in the
// same sentences (lib/announcement-audience-copy.ts).
//
//  - Drafts are the composer's saveDraftAction / updateDraftAction. A draft
//    is its author's own, so updating takes no compare value: nobody else can
//    change it (the write's own WHERE is "this sender's, still a draft", and
//    a refusal is explained by explainDraftRefusal in the page's words).
//    Fields left out keep the draft's, and so do its "keep it at the top" and
//    "Also post in Telegram" marks (the write would otherwise clear them);
//    Telegram stays a captain's to everyone, as the action keeps it.
//  - Pinning is setPinnedAction: the stored audience, never one passed in,
//    canSendToAudience on it, and for a new pin the same checks a send makes.
//    The write is a compare-and-set on pinned or not, re-reads the actor in
//    its own transaction and is audited (announcement.pinned / unpinned). A
//    pin sends no notice and reaches nobody new: it keeps an announcement its
//    readers already have at the top of their screens.
//  - Publishing and deleting a draft stay on the website.

const PAGE = "/captains/announcements";

/** The audience as the composer's picker names it. */
export function audienceWords(
  audience: Audience,
  teamLabels: Readonly<Record<string, string>>,
): string {
  switch (audience.scope) {
    case "everyone":
      return "Everyone in camp";
    case "team":
      return teamLabels[audience.team] ?? audience.team;
    case "team_leads":
      return "Team leads";
    case "drivers":
      return "Drivers this year";
    case "individual":
      return `${audience.userIds.length} chosen ${audience.userIds.length === 1 ? "person" : "people"}`;
  }
}

/** The caller as the audience rule sees them. */
function audienceActor(scope: McpScope) {
  return { rank: scope.viewerRank, leadTeams: scope.leadTeams };
}

/**
 * Why this caller may not address this audience, in the page's words, or
 * null: the page actions' audienceRefusal.
 */
export async function audienceRefusal(
  scope: McpScope,
  audience: Audience,
): Promise<string | null> {
  if (!canSendToAudience(audienceActor(scope), audience)) return NOT_YOUR_TEAM;
  if (scope.viewerRank !== "captain") return null;
  if (audience.scope === "individual") {
    const { people } = await getAnnouncementPickerData(scope.campUserId);
    const members = new Set(people.map((p) => p.id));
    return audience.userIds.every((id) => members.has(id)) ? null : PERSON_GONE;
  }
  if (audience.scope !== "team") return null;
  const active = activeTeams(await getTeamsConfig()).map((t) => t.key);
  return active.includes(audience.team)
    ? null
    : "That team isn't active any more. Pick another audience.";
}

/** The announcements this caller's page lists: a captain all, a lead their own. */
export function listForCaller(scope: McpScope) {
  return listAnnouncements(
    scope.viewerRank === "captain" ? {} : { senderId: scope.campUserId },
  );
}

/** The caller's own unpublished draft, or null. */
export async function findOwnDraft(scope: McpScope, id: string) {
  const mine = await listAnnouncements({ senderId: scope.campUserId });
  return mine.find((a) => a.id === id && a.publishedAt === null) ?? null;
}

const draftFields = {
  title: z.string().describe("At most 120 characters."),
  body: z.string().describe("The announcement's words, at most 5000."),
  presentation: AnnouncementPresentation.describe(
    "acknowledge: full screen until each reader taps OK; popup: a pop-up; feed: their inbox only.",
  ),
  audience: AnnouncementAudience.describe(
    'Who it is for: {"scope":"everyone"}, {"scope":"team","team":"kitchen"}, {"scope":"team_leads"}, {"scope":"drivers"} or {"scope":"individual","userIds":[...]}. Team leads: only a team they lead.',
  ),
};

/** Parse with the composer's own shape, refusing in its words. */
function parseDraft(input: Record<string, unknown>) {
  const parsed = ComposeAnnouncementInput.safeParse(input);
  if (!parsed.success) {
    throw new ToolError(parsed.error.issues[0]?.message ?? "Invalid.");
  }
  return parsed.data;
}

function presentDraft(
  draft: {
    id: string;
    title: string;
    body: string;
    presentation: string;
    audience: Audience;
  },
  teamLabels: Readonly<Record<string, string>>,
) {
  return {
    id: draft.id,
    title: draft.title,
    body: draft.body,
    presentation: draft.presentation,
    audience: draft.audience,
    audienceLabel: audienceWords(draft.audience, teamLabels),
    published: false,
    url: siteUrl(PAGE),
  };
}

export function registerAnnouncementsTools(server: McpServer): void {
  server.registerTool(
    "list_announcements",
    {
      title: "List announcements",
      description:
        "Announcements as the Announcements page lists them for you (a captain: everyone's; a team lead: your own), newest first: drafts and published ones, who each is for, whether it is pinned, and how many read it. `id` is what the draft and pin tools take. `drafts: true` for drafts only.",
      inputSchema: z.object({ drafts: z.boolean().optional() }),
    },
    async (args, extra) =>
      runTool({
        toolName: "list_announcements",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const [rows, labels] = await Promise.all([
            listForCaller(scope),
            getTeamsConfig().then(teamLabelMap),
          ]);
          return {
            announcements: rows
              .filter((a) => !args.drafts || a.publishedAt === null)
              .map((a) => ({
                id: a.id,
                title: a.title,
                body: a.body,
                presentation: a.presentation,
                audience: a.audience,
                audienceLabel: audienceWords(a.audience, labels),
                senderName: a.senderName,
                mine: a.senderId === scope.campUserId,
                published: a.publishedAt !== null,
                publishedAt: a.publishedAt,
                pinned: a.pinnedAt !== null,
                pinOnPublish: a.pinOnPublish,
                recipientCount: a.recipientCount,
                readCount: a.readCount,
              })),
            url: siteUrl(PAGE),
          };
        },
      }),
  );

  server.registerTool(
    "save_announcement_draft",
    {
      title: "Write an announcement draft",
      description:
        "Saves a new announcement as a draft, as the composer's Save draft does. Nothing is sent: the person reads it over and publishes it on the website. Presentation defaults to acknowledge, the audience to everyone (captains only; a team lead picks a team they lead).",
      inputSchema: z.object({
        title: draftFields.title,
        body: draftFields.body,
        presentation: draftFields.presentation.optional(),
        audience: draftFields.audience.optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "save_announcement_draft",
        extra,
        // The words stay out of the connector's log.
        argsForAudit: {
          presentation: args.presentation,
          audience: args.audience,
          fields: ["title", "body"],
        },
        handler: async ({ scope }) => {
          const data = parseDraft(args);
          const refusal = await audienceRefusal(scope, data.audience);
          if (refusal) throw new ToolError(refusal);
          const { id } = await createAnnouncementDraft({
            senderId: scope.campUserId,
            title: data.title,
            body: data.body,
            presentation: data.presentation,
            audience: data.audience,
            pinned: false,
            telegram: false,
          });
          const labels = teamLabelMap(await getTeamsConfig());
          return presentDraft({ id, ...data }, labels);
        },
      }),
  );

  server.registerTool(
    "update_announcement_draft",
    {
      title: "Change an announcement draft",
      description:
        "Changes your own draft, as the composer's Save on a draft does: give its `id` (list_announcements) and only what changes; the rest stays. A published announcement can't be changed (publish a correction on the website).",
      inputSchema: z.object({
        id: z.string().min(1).max(64),
        title: draftFields.title.optional(),
        body: draftFields.body.optional(),
        presentation: draftFields.presentation.optional(),
        audience: draftFields.audience.optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "update_announcement_draft",
        extra,
        argsForAudit: {
          id: args.id,
          presentation: args.presentation,
          audience: args.audience,
          fields: (["title", "body"] as const).filter(
            (k) => args[k] !== undefined,
          ),
        },
        handler: async ({ scope }) => {
          const draft = await findOwnDraft(scope, args.id);
          if (!draft) {
            throw new ToolError(
              await explainDraftRefusal(args.id, scope.campUserId),
            );
          }
          const data = parseDraft({
            title: args.title ?? draft.title,
            body: args.body ?? draft.body,
            presentation: args.presentation ?? draft.presentation,
            audience: args.audience ?? draft.audience,
          });
          const refusal = await audienceRefusal(scope, data.audience);
          if (refusal) throw new ToolError(refusal);
          const ok = await updateAnnouncementDraft({
            id: args.id,
            senderId: scope.campUserId,
            title: data.title,
            body: data.body,
            presentation: data.presentation,
            audience: data.audience,
            pinned: draft.pinOnPublish,
            telegram: scope.isCaptain && draft.telegramOnPublish,
          });
          if (!ok) {
            throw new ToolError(
              await explainDraftRefusal(args.id, scope.campUserId),
            );
          }
          const labels = teamLabelMap(await getTeamsConfig());
          return presentDraft({ id: args.id, ...data }, labels);
        },
      }),
  );

  server.registerTool(
    "set_announcement_pinned",
    {
      title: "Pin or unpin an announcement",
      description:
        "Pins a published announcement to the top of its readers' screens (`pinned: true`), or takes the pin down (false), as the page's Pin does. It sends nothing new. Team leads: only one sent to a team they lead.",
      inputSchema: z.object({
        id: z.string().min(1).max(64),
        pinned: z.boolean(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "set_announcement_pinned",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const context = await getAnnouncementPinContext(args.id);
          if (!context) {
            throw new ToolError("That announcement no longer exists.");
          }
          if (!canSendToAudience(audienceActor(scope), context.audience)) {
            throw new ToolError(NOT_YOUR_PIN);
          }
          if (args.pinned) {
            const refusal = await audienceRefusal(scope, context.audience);
            if (refusal) {
              throw new ToolError(
                refusal === NOT_YOUR_TEAM ? NOT_YOUR_PIN : refusal,
              );
            }
          }
          const result = await setAnnouncementPinned({
            id: args.id,
            actorId: scope.campUserId,
            pinned: args.pinned,
          });
          if (!result.ok) throw new ToolError(result.error);
          return { id: args.id, pinned: args.pinned, url: siteUrl(PAGE) };
        },
      }),
  );
}
