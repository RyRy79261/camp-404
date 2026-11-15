import { canSendToAudience } from "@camp404/core";
import { NOT_YOUR_PIN } from "@/app/(console)/captains/announcements/audience-copy";
import { AnnouncementAudience } from "@camp404/types";
import { getTeamsConfig, teamLabelMap } from "../camp-config";
import {
  explainDraftRefusal,
  getAnnouncementPinContext,
  listAnnouncements,
} from "../notifications";
import {
  audienceRefusal,
  audienceWords,
  findOwnDraft,
} from "../mcp/tools/announcements";
import { blocked, quote, shown, str, type PreviewFn } from "./preview-kit";

// Announcement drafts and pins (tools/announcements.ts). A draft's row says
// who it will be for from the stored draft and the audience asked, checked by
// the same rule the tool asks; nothing is sent by any of these.

const PAGE = "/captains/announcements";

const LANDS: Record<string, string> = {
  acknowledge: "full screen until each reader taps OK",
  popup: "a pop-up",
  feed: "their inbox only",
};

function audienceOf(value: unknown) {
  const parsed = AnnouncementAudience.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export const ANNOUNCEMENTS_PREVIEWS: Readonly<Record<string, PreviewFn>> = {
  async save_announcement_draft(args, ctx) {
    const audience =
      args.audience === undefined
        ? { scope: "everyone" as const }
        : audienceOf(args.audience);
    if (!audience) {
      return blocked(
        "Write an announcement draft",
        "Pick who it is for.",
        args,
        PAGE,
      );
    }
    const refusal = await audienceRefusal(ctx.scope, audience);
    const labels = teamLabelMap(await getTeamsConfig());
    const who = audienceWords(audience, labels);
    if (refusal) {
      return blocked(`Write a draft for ${who}`, refusal, args, PAGE);
    }
    const lands = LANDS[str(args.presentation) || "acknowledge"] ?? "";
    return {
      sentence: `Write a draft announcement for ${who}`,
      facts: `Announcements · a draft, nothing sent · lands as ${lands}`,
      change: [`Title: ${shown(args.title)}`, `Words: ${shown(args.body)}`],
      path: PAGE,
      args,
      keys: [],
    };
  },

  async update_announcement_draft(args, ctx) {
    const id = str(args.id);
    const draft = await findOwnDraft(ctx.scope, id);
    if (!draft) {
      return blocked(
        "Change an announcement draft",
        await explainDraftRefusal(id, ctx.scope.campUserId),
        args,
        PAGE,
      );
    }
    const audience =
      args.audience === undefined ? draft.audience : audienceOf(args.audience);
    if (!audience) {
      return blocked(
        `Change the draft ${quote(draft.title)}`,
        "Pick who it is for.",
        args,
        PAGE,
      );
    }
    const labels = teamLabelMap(await getTeamsConfig());
    const refusal = await audienceRefusal(ctx.scope, audience);
    if (refusal) {
      return blocked(
        `Change the draft ${quote(draft.title)}`,
        refusal,
        args,
        PAGE,
      );
    }
    const change: string[] = [];
    if (args.title !== undefined) change.push(`Title: ${shown(args.title)}`);
    if (args.body !== undefined) change.push(`Words: ${shown(args.body)}`);
    if (args.presentation !== undefined) {
      change.push(`Lands as: ${LANDS[str(args.presentation)] ?? ""}`);
    }
    if (args.audience !== undefined) {
      change.push(`For: ${audienceWords(audience, labels)}`);
    }
    return {
      sentence: `Change the draft ${quote(draft.title)}`,
      facts: `Announcements · a draft for ${audienceWords(draft.audience, labels)}, nothing sent`,
      change,
      path: PAGE,
      args,
      keys: [`announcement:${id}`],
    };
  },

  async set_announcement_pinned(args, ctx) {
    const id = str(args.id);
    const pin = args.pinned === true;
    const verb = pin ? "Pin" : "Unpin";
    const context = await getAnnouncementPinContext(id);
    if (!context) {
      return blocked(
        `${verb} an announcement`,
        "That announcement no longer exists.",
        args,
        PAGE,
      );
    }
    const actor = {
      rank: ctx.scope.viewerRank,
      leadTeams: ctx.scope.leadTeams,
    };
    if (!canSendToAudience(actor, context.audience)) {
      return blocked(`${verb} an announcement`, NOT_YOUR_PIN, args, PAGE);
    }
    const rows = await listAnnouncements({});
    const title = rows.find((a) => a.id === id)?.title ?? "an announcement";
    if (!context.published) {
      return blocked(
        `${verb} ${quote(title)}`,
        "Only a published announcement can be pinned.",
        args,
        PAGE,
      );
    }
    if (context.pinned === pin) {
      return blocked(
        `${verb} ${quote(title)}`,
        pin ? "It's already pinned." : "It isn't pinned.",
        args,
        PAGE,
      );
    }
    const labels = teamLabelMap(await getTeamsConfig());
    return {
      sentence: `${verb} ${quote(title)}`,
      facts: `Announcements · for ${audienceWords(context.audience, labels)} · ${pin ? "stays at the top of their screens" : "comes off the top of their screens"} · sends nothing`,
      path: PAGE,
      args,
      keys: [`announcement:${id}`],
    };
  },
};
