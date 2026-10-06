import Anthropic from "@anthropic-ai/sdk";
import { CAMP_TIME_ZONE, campDayKey } from "@camp404/core";
import type { VoiceCommandContext } from "@camp404/ai-prompts";
import { listReimbursementsForReview } from "@camp404/db/reimbursements";
import { LOGISTICS_PHASE_LABELS } from "@camp404/types";
import { getCampSettings } from "../camp-config";
import { listLogisticsPhases } from "../logistics";
import { WEBSITE_ONLY } from "../mcp/capabilities";
import type { McpScope } from "../mcp/scope";
import { getShiftsView } from "../shifts";
import { isE2ETestMode } from "../test-mode";
import { commandPrompt } from "../voice-prompts";
import { runCommandLoop, type ClaudeClient, type Usage } from "./command";
import { pickAreas } from "./areas";
import { readRoster, readTeamLabels } from "./reads";
import { resolveOutcome, type VoiceOutcome } from "./resolve";
import { sealKey } from "./seal";
import { callTool, toolsFor } from "./tools";

// One voice command, after the route has checked who is asking: the camp's
// words for Whisper, the context lines for Claude, the loop, and the server's
// checks. The words are held in memory for this request only.

const DATE = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: CAMP_TIME_ZONE,
});
const SHORT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const day = (key: string) =>
  SHORT.format(new Date(`${key}T00:00:00Z`)).replace(",", "");

let liveClient: Anthropic | null = null;

/** Claude for voice: the camp's key, no automatic retries (owner's rule). */
export async function voiceClaude(): Promise<ClaudeClient> {
  if (isE2ETestMode()) {
    // The scripted twin; never the real API under test.
    return (await import("./claude-fake")).e2eClaude();
  }
  if (!liveClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    liveClient = new Anthropic({ apiKey, maxRetries: 0 });
  }
  return liveClient;
}

/** The Whisper prompt: teams, this year's shifts and the roster's names. */
export async function whisperPromptFor(scope: McpScope): Promise<string> {
  const [labels, roster, shifts] = await Promise.all([
    readTeamLabels(),
    readRoster(),
    getShiftsView({
      userId: scope.campUserId,
      rank: scope.viewerRank,
      ledTeams: [],
    }),
  ]);
  return commandPrompt({
    teams: Object.values(labels),
    shifts: shifts.types.map((t) => t.name),
    names: roster.map((p) => p.name),
  });
}

/** The context lines Claude reads before the words. */
export async function contextFor(
  scope: McpScope,
  captainName: string,
  words: string,
  now: Date,
): Promise<VoiceCommandContext> {
  const [settings, phases, labels] = await Promise.all([
    getCampSettings(),
    listLogisticsPhases(),
    readTeamLabels(),
  ]);
  const burn = phases.find((p) => p.phase === "burn");
  return {
    today: DATE.format(now),
    todayKey: campDayKey(now),
    burnYear: settings.current ? String(settings.current.year) : null,
    burnDays:
      burn?.startDate && burn.endDate
        ? `${day(burn.startDate)} to ${day(burn.endDate)}`
        : null,
    phases: phases
      .filter((p) => p.startDate)
      .map(
        (p) =>
          `${LOGISTICS_PHASE_LABELS[p.phase]} (${p.phase}): ${day(p.startDate!)}${p.endDate && p.endDate !== p.startDate ? ` to ${day(p.endDate)}` : ""}`,
      ),
    captainName,
    teams: scope.memberTeams.map(
      (t) => `${labels[t] ?? t}${scope.leadTeams.includes(t) ? " (lead)" : ""}`,
    ),
    words,
  };
}

/** The website-only pages Claude may point to. */
export function websitePaths(): string[] {
  return [...new Set(WEBSITE_ONLY.map((w) => w.path))];
}

export interface CommandRun {
  outcome: VoiceOutcome;
  usage: Usage;
  /** The API's HTTP status when Claude could not be reached. */
  apiStatus: number | null;
}

/** Words to what the captain is shown. Nothing of it is stored. */
export async function runVoiceCommand(input: {
  scope: McpScope;
  captainName: string;
  words: string;
  sessionId: string;
  claude?: ClaudeClient;
  now?: Date;
}): Promise<CommandRun> {
  const now = input.now ?? new Date();
  // Only the areas the words touch (lib/voice/areas.ts); every area when
  // unsure.
  const tools = toolsFor(input.scope, pickAreas(input.words).areas);
  const loop = await runCommandLoop({
    context: await contextFor(input.scope, input.captainName, input.words, now),
    tools,
    websitePaths: websitePaths(),
    claude: input.claude ?? (await voiceClaude()),
    callRead: (tool, args) => callTool(tool, args, input.scope.campUserId),
  });
  const outcome = await resolveOutcome(loop, {
    scope: input.scope,
    tools,
    words: input.words,
    sessionId: input.sessionId,
    sealKey: sealKey(),
    now,
    readRoster,
    readWaitingClaims: async () => {
      const [rows, labels] = await Promise.all([
        listReimbursementsForReview({ status: "submitted" }),
        readTeamLabels(),
      ]);
      return rows.map((r) => ({
        teamLabel: r.team ? (labels[r.team] ?? r.team) : null,
        id: r.id,
        submitterId: r.submitterId,
        submitterName: r.submitterName,
        description: r.description,
        amountCents: r.amountCents,
      }));
    },
  });
  return {
    outcome,
    usage: loop.usage,
    apiStatus: loop.kind === "error" ? (loop.status ?? null) : null,
  };
}
