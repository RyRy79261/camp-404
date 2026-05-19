import Groq from "groq-sdk";

let client: Groq | null = null;

function groqClient(): Groq {
  if (!client) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY is not set");
    client = new Groq({ apiKey });
  }
  return client;
}

/**
 * Transcribe an audio blob with Groq's Whisper Large v3 Turbo.
 * ~216x real-time speed, $0.04/audio-hour.
 */
export async function transcribeAudio(file: File): Promise<string> {
  const res = await groqClient().audio.transcriptions.create({
    file,
    model: "whisper-large-v3-turbo",
    response_format: "json",
  });
  return res.text;
}
