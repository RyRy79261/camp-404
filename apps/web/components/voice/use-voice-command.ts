"use client";

import * as React from "react";
import type { VoiceOutcome, VoiceRow } from "@/lib/voice/resolve";
import type { RowResult, RunResult } from "@/lib/voice/run";
import { useVoiceSupported } from "./use-voice-recorder";

// A captain's voice command in the browser (#356): record, send, show the
// list, run what they tick. The clip lives in memory until the request is
// sent and is dropped then; the words live in this state until the panel
// closes. Nothing is put in storage.

export type VoicePhase =
  | "consent"
  | "idle"
  | "recording"
  | "thinking"
  | "outcome"
  | "running"
  | "results";

/** The list the captain is looking at: the outcome's own, or a picked option's. */
export interface ShownList {
  rows: VoiceRow[];
  token: string;
  expiresAt: number;
}

export const VOICE_OFFLINE =
  "Voice needs an internet connection. On site there is no internet: use the printed daily sheet and duty cards.";

const MIME = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];
const MAX_MS = 60_000;

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIME.find((t) => MediaRecorder.isTypeSupported(t));
}

/** Whether the browser is online, kept current. */
export function useOnline(): boolean {
  return React.useSyncExternalStore(
    (on) => {
      window.addEventListener("online", on);
      window.addEventListener("offline", on);
      return () => {
        window.removeEventListener("online", on);
        window.removeEventListener("offline", on);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

export function useVoiceCommand({ consented }: { consented: boolean }) {
  const [agreed, setAgreed] = React.useState(consented);
  // A new answer from the server replaces the one given here.
  const [consentedBefore, setConsentedBefore] = React.useState(consented);
  if (consented !== consentedBefore) {
    setConsentedBefore(consented);
    setAgreed(consented);
  }
  const [phase, setPhase] = React.useState<VoicePhase>(
    consented ? "idle" : "consent",
  );
  const [words, setWords] = React.useState<string | null>(null);
  const [outcome, setOutcome] = React.useState<VoiceOutcome | null>(null);
  const [shown, setShown] = React.useState<ShownList | null>(null);
  const [ticked, setTicked] = React.useState<Set<number>>(new Set());
  const [results, setResults] = React.useState<RowResult[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [analyser, setAnalyser] = React.useState<AnalyserNode | null>(null);
  const [startedAt, setStartedAt] = React.useState<number | null>(null);

  const recorder = React.useRef<MediaRecorder | null>(null);
  const chunks = React.useRef<Blob[]>([]);
  const stream = React.useRef<MediaStream | null>(null);
  const audio = React.useRef<AudioContext | null>(null);
  const discardNext = React.useRef(false);
  const limit = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const supported = useVoiceSupported();
  const online = useOnline();

  const teardown = React.useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void audio.current?.close();
    audio.current = null;
    setAnalyser(null);
    if (limit.current) clearTimeout(limit.current);
    limit.current = null;
  }, []);

  React.useEffect(
    () => () => {
      const rec = recorder.current;
      if (rec) {
        rec.ondataavailable = null;
        rec.onstop = null;
        if (rec.state !== "inactive") rec.stop();
      }
      chunks.current = [];
      teardown();
    },
    [teardown],
  );

  const showOutcome = React.useCallback((o: VoiceOutcome) => {
    setOutcome(o);
    setResults(null);
    if (o.kind === "list") {
      setShown({ rows: o.rows, token: o.token, expiresAt: o.expiresAt });
      setTicked(new Set(o.rows.flatMap((r, i) => (r.blocked ? [] : [i]))));
    } else {
      setShown(null);
      setTicked(new Set());
    }
    setPhase("outcome");
  }, []);

  async function send(blob: Blob, mime: string) {
    setPhase("thinking");
    const form = new FormData();
    form.append(
      "audio",
      new File([blob], `command.${mime.includes("mp4") ? "m4a" : "webm"}`, {
        type: mime,
      }),
    );
    try {
      const res = await fetch("/api/voice/command", {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as {
        words?: string;
        outcome?: VoiceOutcome;
        error?: string;
      };
      if (!res.ok || !data.outcome) {
        setError(
          data.error ?? "Something went wrong. Nothing changed: try again.",
        );
        setPhase("idle");
        return;
      }
      setWords(data.words ?? null);
      showOutcome(data.outcome);
    } catch {
      setError("Voice can't reach the camp right now. Nothing changed.");
      setPhase("idle");
    }
  }

  async function start() {
    if (phase === "recording") return;
    setError(null);
    setWords(null);
    setOutcome(null);
    setShown(null);
    setResults(null);
    if (!online) {
      setError(VOICE_OFFLINE);
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      stream.current = media;
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      const node = ctx.createAnalyser();
      node.fftSize = 1024;
      ctx.createMediaStreamSource(media).connect(node);
      audio.current = ctx;
      setAnalyser(node);
      const mime = pickMime();
      const rec = new MediaRecorder(
        media,
        mime ? { mimeType: mime } : undefined,
      );
      recorder.current = rec;
      chunks.current = [];
      discardNext.current = false;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunks.current, { type: mime ?? rec.mimeType });
        chunks.current = [];
        recorder.current = null;
        teardown();
        if (discardNext.current || blob.size === 0) {
          setPhase("idle");
          return;
        }
        void send(blob, mime ?? rec.mimeType);
      };
      rec.start();
      setStartedAt(Date.now());
      setPhase("recording");
      limit.current = setTimeout(() => stop(), MAX_MS);
    } catch (err) {
      teardown();
      const name = err instanceof Error ? err.name : "";
      setError(
        name === "NotAllowedError"
          ? "The microphone is blocked for this site. Allow it in the browser's settings to use voice."
          : "No microphone could be used.",
      );
      setPhase("idle");
    }
  }

  function stop() {
    const rec = recorder.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }

  /** Throw the recording away: nothing is sent. */
  function discard() {
    discardNext.current = true;
    stop();
  }

  function toggle(i: number) {
    setTicked((now) => {
      const next = new Set(now);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  /** The question's answer: that option's list. */
  function pick(i: number) {
    if (outcome?.kind !== "ask") return;
    const option = outcome.options[i];
    if (!option) return;
    setShown({
      rows: option.rows,
      token: option.token,
      expiresAt: option.expiresAt,
    });
    setTicked(new Set(option.rows.flatMap((r, j) => (r.blocked ? [] : [j]))));
  }

  async function run() {
    if (!shown || ticked.size === 0) return;
    setPhase("running");
    let result: RunResult;
    try {
      const { runVoiceList } = await import("@/app/(console)/voice-actions");
      result = await runVoiceList(
        shown.token,
        [...ticked].sort((a, b) => a - b),
      );
    } catch {
      result = {
        ok: false,
        message: "Something went wrong. Check the pages before trying again.",
      };
    }
    if (!result.ok) {
      setError(result.message);
      setPhase("outcome");
      return;
    }
    setResults(result.results);
    setPhase("results");
  }

  /** Back to a fresh start, the words forgotten. */
  function reset() {
    discard();
    setWords(null);
    setOutcome(null);
    setShown(null);
    setResults(null);
    setError(null);
    setPhase(agreed ? "idle" : "consent");
  }

  async function consent(on: boolean) {
    if (!on) return;
    const { setVoiceOn } = await import("@/app/(console)/voice-actions");
    const res = await setVoiceOn(true);
    if (res.ok) {
      setAgreed(true);
      setPhase("idle");
    } else {
      setError("Voice could not be turned on. Try again.");
    }
  }

  return {
    phase,
    words,
    outcome,
    shown,
    ticked,
    results,
    error,
    analyser,
    startedAt,
    supported,
    online,
    start,
    stop,
    discard,
    toggle,
    pick,
    run,
    reset,
    consent,
  };
}

export type VoiceCommand = ReturnType<typeof useVoiceCommand>;
