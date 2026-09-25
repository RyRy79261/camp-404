import { z } from "zod";

// The join page (#264, owner's rulings 2026-09-24): what join.camp-404.com
// shows for one burn year. A captain writes it in Camp settings as Markdown
// and publishes it; the join site reads the published copy. The text is the
// camp's own (pasted from Notion by the owner), so nothing here names it.

/** The longest page a captain may save, in characters of Markdown. */
export const JOIN_PAGE_MAX_LENGTH = 50_000;

/** A save as the editor sends it. */
export const JoinPageSave = z.object({
  markdown: z
    .string()
    .max(
      JOIN_PAGE_MAX_LENGTH,
      "The page is longer than 50,000 characters. Shorten it and try again.",
    ),
  /** The version the editor opened; 0 when this year had no page. */
  expectedVersion: z.number().int().min(0),
  /** Also publish what is saved, so the join site shows it. */
  publish: z.boolean(),
});
export type JoinPageSave = z.infer<typeof JoinPageSave>;
