import "server-only";

import { z } from "zod";
import { anthropic, MODELS } from "@/lib/anthropic";
import type { FeedbackKind, StructuredReport } from "@/lib/github-feedback";

// Optional "Improve with AI" pass: restructure a raw bug/feature report into a
// clean title + summary + steps/expected/actual before it's filed. Additive and
// fail-safe — any problem (no ANTHROPIC_API_KEY, API error, no tool call,
// invalid shape) returns null and the caller files the plain template instead.
// The caller passes ALREADY-SANITIZED text, and the output is re-sanitized when
// the issue body is assembled (the model can echo PII).

const StructuredSchema = z.object({
  title: z.string().min(1).max(140),
  summary: z.string().min(1).max(2000),
  stepsToReproduce: z.array(z.string().max(500)).max(20).optional(),
  expected: z.string().max(1000).optional(),
  actual: z.string().max(1000).optional(),
  severity: z.enum(["critical", "high", "medium", "low"]).optional(),
});

const FORMAT_TOOL = {
  name: "format_report",
  description:
    "Return a clean, structured GitHub issue built from the user's raw report.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: {
        type: "string",
        description: "Concise issue title, ~100 chars. No '[Bug]' prefix.",
      },
      summary: {
        type: "string",
        description: "1-3 sentence summary of the problem or request.",
      },
      stepsToReproduce: {
        type: "array",
        items: { type: "string" },
        description:
          "Ordered reproduction steps. Omit for feature requests or if not given.",
      },
      expected: { type: "string", description: "What the user expected." },
      actual: { type: "string", description: "What actually happened." },
      severity: {
        type: "string",
        enum: ["critical", "high", "medium", "low"],
        description: "Rough triage hint from the description alone. Optional.",
      },
    },
    required: ["title", "summary"],
  },
};

const SYSTEM_PROMPT = `You convert a user's raw bug or feature report into a well-structured GitHub issue.

Rules:
- Be faithful to the user's report — never invent reproduction steps, symptoms, or facts they did not state.
- Write a concise, specific title (not "App is broken").
- For a bug: extract reproduction steps, expected behaviour, and actual behaviour IF the user provided them. Leave fields empty otherwise — do not guess.
- For a feature request: put the request in summary; leave stepsToReproduce/expected/actual empty.
- severity is a rough triage hint from the description alone (crash/data-loss = critical or high).
- Placeholders like [email] or [redacted] may appear (the text was PII-stripped) — leave them as-is.
- Always call the format_report tool. Never reply with prose only.`;

/**
 * Ask Claude to restructure the report. Returns null on any failure so the
 * caller falls back to the plain template.
 */
export async function structureWithAi(
  kind: FeedbackKind,
  description: string,
): Promise<StructuredReport | null> {
  try {
    const response = await anthropic().messages.create(
      {
        model: MODELS.haiku,
        max_tokens: 1024,
        temperature: 0,
        system: SYSTEM_PROMPT,
        tools: [FORMAT_TOOL],
        tool_choice: { type: "tool", name: FORMAT_TOOL.name },
        messages: [
          {
            role: "user",
            content: `Report type: ${kind}\n\nUser's raw report:\n"""\n${description}\n"""\n\nReturn the issue via the format_report tool.`,
          },
        ],
      },
      { timeout: 30_000 },
    );

    const block = response.content.find(
      (b) => b.type === "tool_use" && b.name === FORMAT_TOOL.name,
    );
    if (!block || block.type !== "tool_use") return null;

    const parsed = StructuredSchema.safeParse(block.input);
    return parsed.success ? parsed.data : null;
  } catch (err) {
    console.error("structureWithAi failed; filing plain report", err);
    return null;
  }
}
