import { z } from "zod";

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

// What a captain composes. Title and body are required; presentation defaults
// to the full-screen acknowledge variant, which is the primary use case
// (camp-wide announcements everyone must see and dismiss).
export const ComposeAnnouncementInput = z.object({
  title: z.string().trim().min(1, "Give it a title.").max(120),
  body: z.string().trim().min(1, "Write the announcement.").max(5000),
  presentation: AnnouncementPresentation.default("acknowledge"),
});
export type ComposeAnnouncementInput = z.infer<typeof ComposeAnnouncementInput>;
