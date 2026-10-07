import Groq from "groq-sdk";

let client: Groq | null = null;

function groqClient(): Groq {
  if (!client) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY is not set");
    // No automatic retries (the SDK's default is 2): a failed transcription is
    // shown, and the captain records again if they want to.
    client = new Groq({ apiKey, maxRetries: 0 });
  }
  return client;
}

export interface TranscribeOptions {
  /**
   * Whisper's domain-biasing prompt. A short paragraph listing the jargon,
   * brand names, and numerals the user is likely to say. Dramatically
   * improves accuracy on names/numbers vs. the default prompt.
   */
  prompt?: string;
}

/**
 * Transcribe an audio blob with Groq's Whisper Large v3 Turbo.
 * ~216x real-time speed, $0.04/audio-hour.
 */
export async function transcribeAudio(
  file: File,
  options: TranscribeOptions = {},
): Promise<string> {
  const res = await groqClient().audio.transcriptions.create({
    file,
    model: "whisper-large-v3-turbo",
    response_format: "json",
    temperature: 0,
    ...(options.prompt ? { prompt: options.prompt } : {}),
  });
  return res.text;
}

/** Whisper's own read of a clip: the words, and how sure it was of them. */
export interface CommandTranscript {
  text: string;
  /** Mean log probability of the words, weighted by segment length. */
  avgLogprob: number;
  /** The highest chance, over the segments, that a segment was not speech. */
  noSpeechProb: number;
}

interface VerboseSegment {
  avg_logprob?: number;
  no_speech_prob?: number;
  start?: number;
  end?: number;
}

/**
 * A captain's voice command (#356): the same pinned model, with Whisper's
 * per-segment confidence (`verbose_json`) so a clip it did not hear clearly
 * stops here, before Claude. The clip is passed straight through from the
 * request's memory: never written to disk, a log or storage. Groq's API has
 * no per-request retention switch; what it keeps is set by the camp's Groq
 * account.
 */
export async function transcribeCommand(
  file: File,
  prompt: string,
): Promise<CommandTranscript> {
  const res = (await groqClient().audio.transcriptions.create({
    file,
    model: "whisper-large-v3-turbo",
    response_format: "verbose_json",
    temperature: 0,
    language: "en",
    prompt,
  })) as { text: string; segments?: VerboseSegment[] };
  const segments = res.segments ?? [];
  let weight = 0;
  let sum = 0;
  let noSpeech = 0;
  for (const s of segments) {
    const length = Math.max(0.01, (s.end ?? 0) - (s.start ?? 0));
    weight += length;
    sum += (s.avg_logprob ?? 0) * length;
    noSpeech = Math.max(noSpeech, s.no_speech_prob ?? 0);
  }
  return {
    text: res.text.trim(),
    avgLogprob: weight > 0 ? sum / weight : 0,
    noSpeechProb: segments.length > 0 ? noSpeech : 1,
  };
}

/**
 * Whisper's own thresholds (its reference decoder gives up on a segment
 * below -1.0 mean log probability, and calls one above 0.6 silence).
 */
export function heardClearly(t: CommandTranscript): boolean {
  return t.text.length > 0 && t.avgLogprob >= -1.0 && t.noSpeechProb <= 0.6;
}
