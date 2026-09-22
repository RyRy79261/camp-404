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

// Who an announcement is for: the whole camp, or one team this year. A team
// lead may only pick a team they lead (owner's call, 2026-09-16); the server
// checks that, this only shapes the input. Other broadcast scopes (team leads,
// drivers, individuals) are not composed here.
export const AnnouncementAudience = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("everyone") }),
  z.object({ scope: z.literal("team"), team: Team }),
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
