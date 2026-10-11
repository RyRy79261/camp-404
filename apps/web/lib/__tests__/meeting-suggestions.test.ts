import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";

// "Find decisions and action items" on the owner's own planning call
// (2026-10-11), with a canned model answer: no network. What matters is what
// the app does with Claude's answer: an exact, single match of a whole name
// becomes the person and nothing else does ("Speaker 3" and "Team leads" are
// "Who is this?"), a team is kept only from the active list, a date only when
// real, what the note already holds is counted and not proposed again, and a
// bad or missing answer is the editor's error, never a retry or a log of the
// notes.

const e2e = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({ isE2ETestMode: () => e2e.on }));
vi.mock("@/lib/anthropic", () => ({
  anthropic: vi.fn(),
  MODELS: { sonnet: "claude-sonnet-5-5" },
}));

import {
  findMeetingSuggestions,
  readSuggestionReply,
  SUGGESTIONS_FAILED,
  WHOLE_CAMP_KEYS,
  type MeetingSuggestionRequest,
  type SuggestionClient,
} from "@/lib/meeting-suggestions";

// An excerpt of the owner's notes of the 11 October planning call, as the
// transcription service wrote them.
const NOTES = `Camp 404 planning call: the group agreed to target 35 people, shrink tents, raise the suggested fee to 450, and start collecting fees next week.

Camp Size, Tents and Budget

Stretch tent quote from Lance's associate is 120k; Dimension quote pending, slightly pricier but reliable.

Cutting sleeping and lounge tents by about 10 meters each could save around 40 grand.

Merging lounge and kitchen was rejected: tried for three years, it blurred public and private space.

Next Steps

(Ryan James Noble) Import all existing Camp 404 documentation, recipes and data into the app
(Ryan James Noble) Start collecting camp fees next week
(Ryan James Noble) Get Dimension stretch tent quote and compare it to Lance's option
(Speaker 3) Take on logistics lead role and keep running safety with Ryan James Noble's support
(Team leads) Accept assigned lead role or find someone else to lead the team

Decisions Made

Camp targets 35 people instead of the usual 45 to 50
Sleeping and lounge stretch tents will be reduced in size
Suggested camp fee raised to $450, still optional
No cold recruiting; new members come through existing burner connections
Kitchen and lounge remain separate tents`;

const REQUEST: MeetingSuggestionRequest = {
  title: "Planning call",
  heldOn: "2026-10-11",
  teamKey: null,
  teamLabel: null,
  agenda: "1. App demo\n2. Camp size\n3. Fees",
  notes: NOTES,
  members: [
    { id: "u-ryan", displayName: "Ryan James Noble" },
    { id: "u-caitlin", displayName: "Caitlin" },
    { id: "u-cloud", displayName: "Cloud" },
  ],
  teams: [
    { key: "finance", label: "Finance" },
    { key: "structures", label: "Structures" },
    { key: "transport_and_logistics", label: "Transport and Logistics" },
  ],
  existing: {
    decisions: [],
    actionItems: [
      "Import all existing Camp 404 documentation, recipes and data into the app",
    ],
  },
};

/** What Sonnet answered for these notes, as its one tool call. */
const CANNED = {
  decisions: [
    {
      text: "Camp targets 35 people instead of the usual 45 to 50",
      already_listed: false,
    },
    {
      text: "Sleeping and lounge stretch tents will be reduced in size",
      already_listed: false,
    },
    {
      text: "Suggested camp fee raised to $450, still optional",
      already_listed: false,
    },
    {
      text: "No cold recruiting; new members come through existing burner connections",
      already_listed: false,
    },
    { text: "Kitchen and lounge remain separate tents", already_listed: false },
  ],
  action_items: [
    {
      text: "Import all existing Camp 404 documentation, recipes and data into the app",
      person: "Ryan James Noble",
      team: "camp",
      due: null,
      due_said: null,
      already_listed: true,
    },
    {
      text: "Start collecting camp fees",
      person: "Ryan James Noble",
      team: "finance",
      due: "2026-10-19",
      due_said: "next week",
      already_listed: false,
    },
    {
      text: "Get the Dimension stretch tent quote and compare it to Lance's option",
      person: "Ryan James Noble",
      team: "structures",
      due: null,
      due_said: null,
      already_listed: false,
    },
    {
      text: "Take on the logistics lead role and keep running safety, with Ryan James Noble's support",
      person: "Speaker 3",
      team: "transport_and_logistics",
      due: null,
      due_said: null,
      already_listed: false,
    },
    {
      text: "Accept the assigned lead role, or find someone else to lead the team",
      person: "Team leads",
      team: "camp",
      due: "soon",
      due_said: null,
      already_listed: false,
    },
  ],
};

function message(
  content: unknown[],
  stop: Anthropic.Message["stop_reason"] = "tool_use",
): Anthropic.Message {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content,
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  } as unknown as Anthropic.Message;
}

function toolCall(input: unknown) {
  return {
    type: "tool_use",
    id: "toolu_1",
    name: "record_meeting_outcomes",
    input,
  };
}

function client(reply: Anthropic.Message | Error) {
  const create = vi.fn(
    async (
      _body: Anthropic.MessageCreateParamsNonStreaming,
      _options?: { timeout?: number },
    ) => {
      if (reply instanceof Error) throw reply;
      return reply;
    },
  );
  return { client: { messages: { create } } as SuggestionClient, create };
}

describe("findMeetingSuggestions on the owner's planning call", () => {
  beforeEach(() => {
    e2e.on = false;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("asks Sonnet once, with the notes, the date and the people, under Sonnet 5.5's rules", async () => {
    const { client: fake, create } = client(message([toolCall(CANNED)]));
    await findMeetingSuggestions(REQUEST, fake);
    expect(create).toHaveBeenCalledTimes(1);
    const body = create.mock.calls[0]![0];
    expect(body.model).toBe("claude-sonnet-5-5");
    // Sonnet 5.5 refuses a forced tool_choice and a temperature.
    expect(body.tool_choice).toEqual({ type: "auto" });
    expect(body).not.toHaveProperty("temperature");
    expect(body.tools).toHaveLength(1);
    expect((body.tools![0] as { strict?: boolean }).strict).toBe(true);
    const text = body.messages[0]!.content as string;
    expect(text).toContain("Held on: Sun 11 Oct 2026 (2026-10-11).");
    expect(text).toContain("- Ryan James Noble");
    expect(text).toContain("(Speaker 3) Take on logistics lead role");
    expect(text).toContain(
      "- transport_and_logistics: Transport and Logistics",
    );
  });

  it("matches only whole names, keeps known teams and real dates, and counts what was already there", async () => {
    const { client: fake } = client(message([toolCall(CANNED)]));
    const outcome = await findMeetingSuggestions(REQUEST, fake);
    if (!outcome.ok) throw new Error(outcome.error);
    const s = outcome.suggestions;
    expect(s.decisions.map((d) => d.text)).toEqual(
      CANNED.decisions.map((d) => d.text),
    );
    expect(s.alreadyThere).toEqual({ decisions: 0, actionItems: 1 });
    expect(s.actionItems).toEqual([
      {
        text: "Start collecting camp fees",
        assigneeId: "u-ryan",
        unmatchedName: null,
        team: "finance",
        due: "2026-10-19",
        dueSaid: "next week",
      },
      {
        text: "Get the Dimension stretch tent quote and compare it to Lance's option",
        assigneeId: "u-ryan",
        unmatchedName: null,
        team: "structures",
        due: null,
        dueSaid: null,
      },
      {
        text: "Take on the logistics lead role and keep running safety, with Ryan James Noble's support",
        assigneeId: null,
        unmatchedName: "Speaker 3",
        team: "transport_and_logistics",
        due: null,
        dueSaid: null,
      },
      {
        text: "Accept the assigned lead role, or find someone else to lead the team",
        assigneeId: null,
        unmatchedName: "Team leads",
        team: null,
        due: null,
        dueSaid: null,
      },
    ]);
  });

  it("is the error state for a refusal, no call, a cut-off reply or a bad shape, and logs none of the notes", async () => {
    for (const reply of [
      message([toolCall(CANNED)], "refusal"),
      message([toolCall(CANNED)], "max_tokens"),
      message([{ type: "text", text: "Here are the decisions…" }], "end_turn"),
      message([toolCall({ decisions: "lots" })]),
      new Error("connection reset"),
    ]) {
      const { client: fake } = client(reply);
      expect(await findMeetingSuggestions(REQUEST, fake)).toEqual({
        ok: false,
        error: SUGGESTIONS_FAILED,
      });
    }
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).not.toContain("Lance");
    expect(logged).not.toContain("Speaker 3");
  });

  it("stands in for Claude under E2E_TEST_MODE, with no call", async () => {
    e2e.on = true;
    const outcome = await findMeetingSuggestions(REQUEST);
    if (!outcome.ok) throw new Error(outcome.error);
    expect(outcome.suggestions.actionItems[0]).toMatchObject({
      assigneeId: "u-ryan",
      team: "finance",
    });
    expect(outcome.suggestions.actionItems[1]).toMatchObject({
      unmatchedName: "Speaker 3",
      team: null,
    });
  });
});

describe("readSuggestionReply", () => {
  it("reads the one tool call", () => {
    expect(readSuggestionReply(message([toolCall(CANNED)]))).toEqual(CANNED);
  });
});

it("the prompt and the app agree on the whole camp's key", () => {
  expect(WHOLE_CAMP_KEYS[0]).toBe(WHOLE_CAMP_KEYS[1]);
});
