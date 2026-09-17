import {
  DIAGNOSTICS_LIMITS as L,
  type ReportDiagnostics,
} from "@/lib/github-feedback";

// The recent-errors buffer a bug report can attach (owner's call, 2026-09-16:
// yes, with a panel the member checks before sending). Ported from the
// AfrikaBurn contributors app.
//
// A buffer, not a log: entries live in memory, die with the tab, and leave the
// device only when the member ticks "Attach device details and recent errors"
// and sends. On the way to the public issue they are redacted again. The caps
// are hard because an error message can quote whatever was on screen.

const buffer: ReportDiagnostics["errors"] = [];
let installed = false;

function clamp(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function describe(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function record(source: string, message: string): void {
  buffer.push({
    at: new Date().toISOString(),
    source: clamp(source, L.source),
    message: clamp(message, L.message),
    // The path only, never the query or hash: those carry invite codes and
    // tokens.
    ...(typeof window !== "undefined"
      ? { route: clamp(window.location.pathname, L.route) }
      : {}),
  });
  // Drop the oldest: the errors just before someone reaches for the reporter
  // are the ones that matter.
  while (buffer.length > L.errors) buffer.shift();
}

/**
 * Start capturing uncaught errors, rejected promises and console.error (React
 * reports render failures only there). Idempotent; a no-op on the server.
 * Returns a teardown.
 */
export function installClientErrorCapture(): () => void {
  if (typeof window === "undefined" || installed) return () => {};
  installed = true;

  const onError = (event: ErrorEvent) =>
    record("window.error", describe(event.error ?? event.message));
  const onRejection = (event: PromiseRejectionEvent) =>
    record("unhandledrejection", describe(event.reason));
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    // Pass through first and always: the console must show what it would have.
    originalConsoleError.apply(console, args as never[]);
    try {
      record("console.error", args.map(describe).join(" "));
    } catch {
      // Capturing an error must never throw one.
    }
  };

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    console.error = originalConsoleError;
    installed = false;
  };
}

/** Empty the buffer (tests). */
export function clearClientErrors(): void {
  buffer.length = 0;
}

/**
 * What a report would attach right now: facts about the device (never the
 * person: no account id, email or camp) and the recent errors, oldest first.
 */
export function collectDiagnostics(): ReportDiagnostics {
  const environment: ReportDiagnostics["environment"] = [];
  if (typeof navigator !== "undefined") {
    environment.push({ label: "Browser", value: navigator.userAgent });
    environment.push({ label: "Language", value: navigator.language });
    environment.push({
      label: "Online",
      value: navigator.onLine ? "yes" : "no",
    });
  }
  if (typeof window !== "undefined") {
    environment.push({
      label: "Screen",
      value: `${window.innerWidth}×${window.innerHeight} @ ${window.devicePixelRatio}x`,
    });
    environment.push({ label: "Page", value: window.location.pathname });
  }
  return {
    environment: environment.slice(0, L.environmentFields).map((f) => ({
      label: clamp(f.label, L.label),
      value: clamp(f.value, L.value),
    })),
    errors: buffer.map((e) => ({ ...e })),
  };
}
