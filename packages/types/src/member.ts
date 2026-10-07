import { z } from "zod";
import { checkTextFormat } from "./questionnaire";

// The same rules as the burner profile's contact questions: a name and a
// relationship of the questions' lengths, and a phone number the form's
// "phone" format accepts (7 to 15 digits).
export const EmergencyContact = z.object({
  name: z.string().trim().min(1).max(80),
  phone: z
    .string()
    .trim()
    .max(40)
    .refine((v) => checkTextFormat("phone", v) === null, {
      message: "Enter a valid phone number",
    }),
  relationship: z.string().trim().min(1).max(40),
});
export type EmergencyContact = z.infer<typeof EmergencyContact>;
