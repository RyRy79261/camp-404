import { z } from "zod";
import { Team } from "./roles";

// Presentation variants for a notification — how hard it interrupts the
// recipient in-app. Mirrors `broadcast_presentation` in the DB schema.
//   - acknowledge: full-screen takeover the recipient must acknowledge.
//   - popup:       transient pop-up, no acknowledgement required.
//   - feed:        silent; lands in the notification inbox only.
export const AnnouncementPresentation = z.enum([
  "acknowledge",
  "popup",
  "feed",
]);
export type AnnouncementPresentation = z.infer<typeof AnnouncementPresentation>;

// Who an announcement is for: the whole camp, one team this year, or every
// team lead this year (owner, 2026-09-23: a captain "can send announcements
// to just specific teams or just the team leaders"). A team lead may only pick
// a team they lead (owner's call, 2026-09-16); the server checks that, this
// only shapes the input.
//
// #313 (owner approved 2026-10-02), captains only: "Drivers this year" (everyone
// driving this year, read again when it is published) and specific people (one
// or several members a captain picked by name). The people are member ids; the
// server checks each one is a camp member before it saves them.
export const ANNOUNCEMENT_PEOPLE_MAX = 100;
export const AnnouncementAudience = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("everyone") }),
  z.object({ scope: z.literal("team"), team: Team }),
  z.object({ scope: z.literal("team_leads") }),
  z.object({ scope: z.literal("drivers") }),
  z.object({
    scope: z.literal("individual"),
    userIds: z
      .array(z.string().min(1).max(64))
      .min(1, "Pick at least one person.")
      .max(
        ANNOUNCEMENT_PEOPLE_MAX,
        "That's too many people. Send it to the camp instead.",
      )
      .refine((ids) => new Set(ids).size === ids.length, "Each person once."),
  }),
]);
export type AnnouncementAudience = z.infer<typeof AnnouncementAudience>;

// What a captain or team lead composes. Title and body are required;
// presentation defaults to the full-screen acknowledge variant, which is the
// primary use case (camp-wide announcements everyone must see and dismiss).
// No send_at or channel here: publishing sends now, on the default channel.
export const ComposeAnnouncementInput = z.object({
  title: z.string().trim().min(1, "Give it a title.").max(120),
  body: z.string().trim().min(1, "Write the announcement.").max(5000),
  presentation: AnnouncementPresentation.default("acknowledge"),
  audience: AnnouncementAudience.default({ scope: "everyone" }),
  // "Keep it at the top" — the second axis beside `presentation`. Presentation
  // is how loudly it LANDS; this is whether it STAYS, in a banner above every
  // console page for the members it reached. Any presentation may be pinned.
  // Marked here on the draft, inert until the announcement is published.
  pinned: z.boolean().default(false),
});
export type ComposeAnnouncementInput = z.infer<typeof ComposeAnnouncementInput>;
