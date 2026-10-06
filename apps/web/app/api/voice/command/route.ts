import { NextResponse } from "next/server";
import { getAuthenticatedUser, getSessionId } from "@/lib/auth";
import {
  heardClearly,
  transcribeCommand,
  type CommandTranscript,
} from "@/lib/groq";
import { getMcpScope } from "@/lib/mcp/scope";
import { resolveMemberState } from "@/lib/member-gate";
import { getClientIp, rateLimiter } from "@/lib/rate-limit";
import { isE2ETestMode } from "@/lib/test-mode";
import { getVoiceConsent } from "@/lib/voice/consent";
import { runVoiceCommand, whisperPromptFor } from "@/lib/voice/service";

// A captain's voice command (#356): the clip in, the words and what they
// would do out. Nothing is stored: the audio is held in this request's memory
// for the Groq call and dropped with it, and the words go back to the panel
// and nowhere else (no log line, no table). What runs later runs through Do,
// and only that leaves an audit row.
//
// Captains only: the desktop has no mic for anyone else, and this refuses
// them too. A captain held by a blocking form is held here as on any page.

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 5 * 1024 * 1024;
/** Commands a captain may give in a day (owner, 2026-10-06). */
const DAILY_COMMANDS = 30;

const CAPTAINS_ONLY = "Voice is for captains.";

function say(status: number, error: string, headers?: Record<string, string>) {
  return NextResponse.json({ error }, { status, headers });
}

/** A request from another site is refused before anything else is read. */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function heard(
  file: File,
  prompt: () => Promise<string>,
): Promise<CommandTranscript> {
  if (isE2ETestMode()) {
    const [{ voiceTestStore }, { E2E_WORDS }] = await Promise.all([
      import("@/lib/test-store-voice"),
      import("@/lib/voice/claude-fake"),
    ]);
    const text = E2E_WORDS[voiceTestStore.script() ?? "three"] ?? "";
    return {
      text,
      avgLogprob: text ? -0.2 : -2,
      noSpeechProb: text ? 0.01 : 0.9,
    };
  }
  return transcribeCommand(file, await prompt());
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return say(403, "Forbidden");
  const user = await getAuthenticatedUser();
  const sessionId = await getSessionId();
  if (!user || !sessionId) return say(401, "Sign in again.");

  const state = await resolveMemberState();
  if (state.kind !== "member" || state.block) return say(403, CAPTAINS_ONLY);
  if (state.campUser.rank !== "captain") return say(403, CAPTAINS_ONLY);
  const scope = await getMcpScope(state.campUser.id);
  if (!scope?.isCaptain) return say(403, CAPTAINS_ONLY);

  if (!(await getVoiceConsent(scope.campUserId))) {
    return say(409, "Turn voice on first.");
  }

  const ip = await rateLimiter.limit(
    `voice-command-ip:${getClientIp(req.headers)}`,
    {
      limit: 20,
      windowMs: 60_000,
    },
  );
  if (!ip.ok) return say(429, "Too many at once. Wait a minute.");
  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get("audio");
  } catch {
    return say(400, "That clip didn't arrive. Try again.");
  }
  if (!(file instanceof File) || !file.type.startsWith("audio/")) {
    return say(400, "That clip didn't arrive. Try again.");
  }
  if (file.size > MAX_BYTES)
    return say(413, "That was too long. Say it in parts.");

  // Claimed once the clip is known good and before Groq and Claude are
  // asked: a command that fails later still counts, so it cannot be retried
  // without limit, but a clip that never arrived costs nothing.
  const daily = await rateLimiter.limit(`voice-command:${scope.campUserId}`, {
    limit: DAILY_COMMANDS,
    windowMs: 24 * 60 * 60_000,
  });
  if (!daily.ok) {
    return say(
      429,
      `That is ${DAILY_COMMANDS} voice commands today. Use the pages until tomorrow.`,
      {
        "Retry-After": String(daily.retryAfterSeconds),
      },
    );
  }

  let transcript: CommandTranscript;
  try {
    transcript = await heard(file, () => whisperPromptFor(scope));
  } catch (err) {
    // Never the provider's text, never the clip: the error's class and status.
    console.error(
      "voice-command transcribe failed",
      err instanceof Error ? err.name : typeof err,
      (err as { status?: unknown } | null)?.status ?? "",
    );
    return say(
      502,
      "Voice can't reach Groq right now. Nothing changed: try again in a minute.",
    );
  }
  if (!heardClearly(transcript)) {
    return NextResponse.json({
      words: transcript.text,
      outcome: {
        kind: "refused",
        answers: [],
        message: "I didn't catch that clearly. Say it again, a bit slower.",
        path: null,
      },
    });
  }

  try {
    const { outcome } = await runVoiceCommand({
      scope,
      captainName: state.campUser.displayName ?? "the captain",
      words: transcript.text,
      sessionId,
    });
    return NextResponse.json({ words: transcript.text, outcome });
  } catch (err) {
    console.error(
      "voice-command failed",
      err instanceof Error ? err.name : typeof err,
    );
    return say(500, "Something went wrong. Nothing changed: try again.");
  }
}
