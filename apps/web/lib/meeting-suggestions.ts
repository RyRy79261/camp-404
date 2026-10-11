import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import {
  MEETING_WHOLE_CAMP,
  meetingSuggestionsPrompt,
  type MeetingSuggestionsInput,
} from "@camp404/ai-prompts";
import {
  errorLogText,
  meetingSuggestionsFrom,
  WHOLE_CAMP_KEY,
  type MeetingSuggestionRaw,
  type MeetingSuggestions,
  type SuggestionMember,
} from "@camp404/core";
import { MeetingSuggestionAnswer } from "@camp404/types";
import { anthropic, MODELS } from "./anthropic";
import { isE2ETestMode } from "./test-mode";

// "Find decisions and action items" (owner, 2026-10-11): Claude Sonnet 5.5
// reads a meeting's agenda and notes and proposes its decisions and action
// items. Nothing is stored: the answer goes back to the open editor, where
// the writer keeps or drops each one before Save meeting.
//
//  - One call, no retries (the shared client has maxRetries 0; the owner
//    ruled out automatic retries on every AI call). Sonnet 5.5 refuses a
//    forced tool_choice and a temperature, so the call is tool_choice auto
//    with one strict tool, adaptive thinking at effort low; a reply with no
//    call, a refusal, a cut-off answer or one that fails the Zod shape is the
//    editor's error state ("Your notes are safe. Try again."), never a retry.
//  - The answer is made safe in @camp404/core (meetingSuggestionsFrom): a
//    person only on an exact match of one member's whole name, a team only
//    from the active list, a date only when it is real.
//  - Under E2E_TEST_MODE no call is made: a fixed answer stands in, built
//    from the people it was given (recipe-proofread.ts's pattern).
//  - Nothing of the notes is logged: a failure logs errorLogText only.

/** The part of the Anthropic client this uses (a test passes a fake). */
export interface SuggestionClient {
  messages: {
    create(
      body: Anthropic.MessageCreateParamsNonStreaming,
      options?: { timeout?: number },
    ): Promise<Anthropic.Message>;
  };
}

/** What the server knows about the meeting, for the prompt and the checks. */
export interface MeetingSuggestionRequest {
  title: string;
  /** The meeting's day, YYYY-MM-DD. */
  heldOn: string;
  teamKey: string | null;
  teamLabel: string | null;
  agenda: string;
  notes: string;
  /** Who a person may be matched to. */
  members: readonly SuggestionMember[];
  /** The camp's active teams. */
  teams: readonly { key: string; label: string }[];
  existing: { decisions: readonly string[]; actionItems: readonly string[] };
}

export type SuggestionOutcome =
  | { ok: true; suggestions: MeetingSuggestions }
  | { ok: false; error: string };

export const SUGGESTIONS_FAILED =
  "Claude could not read the notes. Your notes are safe. Try again.";

/** Long enough for a long call's notes; short of a server action's limit. */
const TIMEOUT_MS = 55_000;

const HELD_ON = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** The prompt's input, from the request. */
export function promptInput(
  request: MeetingSuggestionRequest,
): MeetingSuggestionsInput {
  return {
    title: request.title,
    heldOn: request.heldOn,
    heldOnLabel: HELD_ON.format(
      new Date(`${request.heldOn}T12:00:00Z`),
    ).replace(",", ""),
    teamLabel: request.teamLabel,
    agenda: request.agenda,
    notes: request.notes,
    members: request.members.map((m) => m.displayName),
    teams: request.teams,
    existing: request.existing,
  };
}

/** The request body sent to Claude (exported for the test). */
export function suggestionBody(
  request: MeetingSuggestionRequest,
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: MODELS.sonnet,
    max_tokens: 16_000,
    system: meetingSuggestionsPrompt.system,
    tools: [meetingSuggestionsPrompt.tool as Anthropic.Tool],
    tool_choice: { type: "auto" },
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    messages: [
      {
        role: "user",
        content: meetingSuggestionsPrompt.user(promptInput(request)),
      },
    ],
  };
}

/**
 * Claude's reply read: the one tool call, checked with Zod. Null for a
 * refusal, a cut-off reply, no call, or a call that does not fit the shape.
 */
export function readSuggestionReply(
  message: Anthropic.Message,
): MeetingSuggestionRaw | null {
  if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens")
    return null;
  const call = message.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === "tool_use" && b.name === meetingSuggestionsPrompt.tool.name,
  );
  if (!call) return null;
  const parsed = MeetingSuggestionAnswer.safeParse(call.input);
  return parsed.success ? parsed.data : null;
}

/** The fixed answer that stands in for Claude under E2E_TEST_MODE. */
export function standInAnswer(
  request: MeetingSuggestionRequest,
): MeetingSuggestionRaw {
  const someone = request.members[0]?.displayName ?? null;
  return {
    decisions: [
      {
        text: "Camp targets 35 people instead of 45 to 50",
        already_listed: false,
      },
      {
        text: "Kitchen and lounge remain separate tents",
        already_listed: false,
      },
    ],
    action_items: [
      {
        text: "Start collecting camp fees",
        person: someone,
        team: request.teams.some((t) => t.key === "finance") ? "finance" : null,
        due: null,
        already_listed: false,
      },
      {
        text: "Take on the logistics lead role",
        person: "Speaker 3",
        team: MEETING_WHOLE_CAMP,
        due: null,
        already_listed: false,
      },
    ],
  };
}

/** Ask Claude for the meeting's decisions and action items. */
export async function findMeetingSuggestions(
  request: MeetingSuggestionRequest,
  claude: SuggestionClient | null = null,
): Promise<SuggestionOutcome> {
  const context = {
    members: request.members,
    teams: request.teams.map((t) => t.key),
    meetingTeam: request.teamKey,
    existing: request.existing,
  };
  if (isE2ETestMode() && !claude) {
    return {
      ok: true,
      suggestions: meetingSuggestionsFrom(standInAnswer(request), context),
    };
  }
  let message: Anthropic.Message;
  try {
    message = await (claude ?? anthropic()).messages.create(
      suggestionBody(request),
      { timeout: TIMEOUT_MS },
    );
  } catch (err) {
    console.error(
      "findMeetingSuggestions: Claude call failed",
      errorLogText(err, process.env),
    );
    return { ok: false, error: SUGGESTIONS_FAILED };
  }
  const raw = readSuggestionReply(message);
  if (!raw) {
    console.error(
      "findMeetingSuggestions: no usable answer",
      message.stop_reason ?? "no stop reason",
    );
    return { ok: false, error: SUGGESTIONS_FAILED };
  }
  return { ok: true, suggestions: meetingSuggestionsFrom(raw, context) };
}

// The two halves agree on the whole camp's key (a test holds them to it).
export const WHOLE_CAMP_KEYS = [WHOLE_CAMP_KEY, MEETING_WHOLE_CAMP] as const;
