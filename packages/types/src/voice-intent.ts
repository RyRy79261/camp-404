import { z } from "zod";

export const VoiceIntentName = z.enum([
  "add_recipe",
  "mark_shift_done",
  "log_expense",
  "note_to_team",
  "unknown",
]);
export type VoiceIntentName = z.infer<typeof VoiceIntentName>;

export const VoiceIntent = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("add_recipe"),
    rawTranscript: z.string(),
  }),
  z.object({
    intent: z.literal("mark_shift_done"),
    shiftHint: z.string().optional(),
  }),
  z.object({
    intent: z.literal("log_expense"),
    amountZar: z.number().positive().optional(),
    descriptionHint: z.string().optional(),
  }),
  z.object({
    intent: z.literal("note_to_team"),
    team: z.string().optional(),
    message: z.string(),
  }),
  z.object({
    intent: z.literal("unknown"),
    rawTranscript: z.string(),
  }),
]);
export type VoiceIntent = z.infer<typeof VoiceIntent>;
