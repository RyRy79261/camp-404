import { guideChapterRefusal } from "@camp404/core";
import { getGuideDraft } from "../guide";
import { guideChapterPath } from "../guide-copy";
import { scopeActor } from "../mcp/scope";
import { blocked, quote, str, type PreviewFn } from "./preview-kit";

// Voice's row for marking a guide chapter still right for this year: the
// chapter's own title, read on the server, and why it cannot be done.

export const GUIDE_MORE_PREVIEWS: Readonly<Record<string, PreviewFn>> = {
  async mark_document_reviewed(args, ctx) {
    const doc = await getGuideDraft(str(args.slug));
    if (!doc) {
      return blocked(
        "Mark a guide chapter still right for this year",
        "No chapter with that slug.",
        args,
        "/guide",
      );
    }
    const base = {
      sentence: `Mark ${quote(doc.title)} still right for this year`,
      facts: "Survival Guide · nothing in it changes",
      path: guideChapterPath(doc.slug),
      args: { slug: doc.slug },
      keys: [`doc:${doc.slug}`],
    };
    const actor = scopeActor(ctx.scope);
    const refusal = guideChapterRefusal(
      { rank: actor.rank, led: actor.ledTeams },
      doc.team,
    );
    if (refusal) return { ...base, blocked: refusal };
    if (!doc.published) {
      return { ...base, blocked: "Publish the chapter first." };
    }
    return base;
  },
};
