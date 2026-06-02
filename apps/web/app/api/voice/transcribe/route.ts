import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { transcribeAudio } from "@/lib/groq";
import { getClientIp, rateLimiter } from "@/lib/rate-limit";
import { QUESTIONNAIRE_PROMPT } from "@/lib/voice-prompts";

// 10 MB hard cap. webm/opus at typical mobile bitrates is ~16 KB/s, so this
// is ~10 minutes of speech — plenty for any single questionnaire field.
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED_PROMPT_KEYS = new Set(["questionnaire"]);

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = await rateLimiter.limit(`voice-transcribe:${user.id}`, {
    limit: 30,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterSeconds: limit.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  // Defence in depth — rate-limit by IP too, since user.id can be cheap to
  // mint via repeated signups.
  const ipLimit = await rateLimiter.limit(
    `voice-transcribe-ip:${getClientIp(req.headers)}`,
    { limit: 60 },
  );
  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } },
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
    return NextResponse.json({ error: "Missing `audio` file" }, { status: 400 });
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

  const promptKey = String(form.get("promptKey") ?? "");
  const prompt = ACCEPTED_PROMPT_KEYS.has(promptKey)
    ? QUESTIONNAIRE_PROMPT
    : undefined;

  try {
    const text = await transcribeAudio(file, { prompt });
    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcription failed";
    // Don't leak Groq error internals to the client.
    console.error("voice-transcribe error", err);
    return NextResponse.json(
      { error: message.includes("GROQ_API_KEY") ? "Voice not configured" : "Transcription failed" },
      { status: 502 },
    );
  }
}
