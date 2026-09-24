import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { transcribeAudio } from "@/lib/groq";
import { getClientIp, rateLimiter } from "@/lib/rate-limit";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { voicePromptFor } from "@/lib/voice-prompts";

// 10 MB hard cap. webm/opus at typical mobile bitrates is ~16 KB/s, so this
// is ~10 minutes of speech — plenty for any single questionnaire field.
const MAX_BYTES = 10 * 1024 * 1024;

// Clips a day for an account a captain has not approved yet: the onboarding
// questionnaire has a few dozen voice fields at most.
const PENDING_DAILY_CLIPS = 40;

export const runtime = "nodejs";

function tooMany(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "Rate limit exceeded", retryAfterSeconds },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Sign-up is open, so a signed-in account alone is anyone on the internet,
  // and every clip spends the camp's paid Groq key. Require camp access (an
  // invite redeemed, or a god address). Not captain approval: the onboarding
  // questionnaire offers voice, and it runs before a captain has vetted them.
  const campUser = await ensureCampUser(user);
  if (!hasCampAccess(campUser, user.primaryEmail)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // A captain turned them down: they keep their redeemed code, but not the
  // camp's Groq key.
  if (campUser.approvalStatus === "rejected") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Not yet approved means anyone who redeemed a code, and the root code is a
  // fixed word in this public repo. They get enough for the onboarding
  // questionnaire, not the 30-a-minute budget an approved member has.
  if (!isApproved(campUser, user.primaryEmail)) {
    const daily = await rateLimiter.limit(
      `voice-transcribe-pending:${user.id}`,
      {
        limit: PENDING_DAILY_CLIPS,
        windowMs: 24 * 60 * 60_000,
      },
    );
    if (!daily.ok) return tooMany(daily.retryAfterSeconds);
  }

  // Explicit windows: 30 clips a minute per member, 60 per address.
  const limit = await rateLimiter.limit(`voice-transcribe:${user.id}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  // Defence in depth — rate-limit by IP too, since user.id can be cheap to
  // mint via repeated signups.
  const ipLimit = await rateLimiter.limit(
    `voice-transcribe-ip:${getClientIp(req.headers)}`,
    { limit: 60, windowMs: 60_000 },
  );
  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers: { "Retry-After": String(ipLimit.retryAfterSeconds) },
      },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("audio");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing `audio` file" },
      { status: 400 },
    );
  }
  if (!file.type.startsWith("audio/")) {
    return NextResponse.json(
      { error: "File must be audio/*" },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Audio too large" }, { status: 413 });
  }

  const prompt = voicePromptFor(String(form.get("promptKey") ?? ""));

  try {
    const text = await transcribeAudio(file, { prompt });
    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcription failed";
    // Don't leak Groq error internals to the client, or to the log: the SDK
    // error carries Groq's response body and headers. Name and status only.
    console.error(
      "voice-transcribe error",
      err instanceof Error ? err.name : typeof err,
      (err as { status?: unknown } | null)?.status ?? "",
    );
    return NextResponse.json(
      {
        error: message.includes("GROQ_API_KEY")
          ? "Voice not configured"
          : "Transcription failed",
      },
      { status: 502 },
    );
  }
}
