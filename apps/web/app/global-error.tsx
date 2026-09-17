"use client";

import { useEffect, useRef } from "react";
import { TriangleAlert } from "lucide-react";

// Last-resort boundary for errors thrown in the root layout itself. It REPLACES
// the layout (root layout never rendered), so it must supply its own <html>/
// <body> and can't depend on the app shell or its CSS — hence inline styles
// carrying the console's tokens (the AfrikaBurn surfaces and Camp 404 magenta)
// in the gate-screen composition, so it still reads as "us", not a browser
// default. Montserrat isn't loaded here, so it keeps a system stack.

const MAGENTA = "oklch(0.72 0.2 345)";
const MUTED_FOREGROUND = "#adb6b3";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    console.error(error);
    // Announce the error state to AT / keyboard users by moving focus to it.
    headingRef.current?.focus();
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "3rem 1.5rem",
          boxSizing: "border-box",
          background: "#17191b",
          color: "#f4f0e8",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          fontWeight: 500,
        }}
      >
        <main
          style={{
            width: "100%",
            maxWidth: "28rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "1.5rem",
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.75rem",
            }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "3rem",
                height: "3rem",
                borderRadius: "9999px",
                background: "oklch(0.72 0.2 345 / 0.15)",
                color: MAGENTA,
              }}
            >
              <TriangleAlert aria-hidden width={20} height={20} />
            </span>
            <p
              style={{
                margin: 0,
                fontFamily: MONO,
                fontSize: "0.75rem",
                letterSpacing: "0.3em",
                textTransform: "uppercase",
                color: MAGENTA,
              }}
            >
              Camp 404
            </p>
            <h1
              ref={headingRef}
              tabIndex={-1}
              style={{
                margin: 0,
                fontSize: "1.5rem",
                lineHeight: "2rem",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.01em",
                outline: "none",
              }}
            >
              Camp 404 hit a snag.
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: "0.875rem",
                color: MUTED_FOREGROUND,
              }}
            >
              Something failed before the page could load. Try again &mdash; if
              it persists, let a camp captain know.
            </p>
            {error.digest && (
              // Trace code for the server logs — quote it when reporting.
              <p
                style={{
                  margin: 0,
                  fontFamily: MONO,
                  fontSize: "0.75rem",
                  color: MUTED_FOREGROUND,
                }}
              >
                Trace: {error.digest}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={reset}
            style={{
              cursor: "pointer",
              height: "2.75rem",
              borderRadius: "0.375rem",
              border: "none",
              padding: "0 2rem",
              fontFamily: "inherit",
              fontSize: "0.875rem",
              fontWeight: 500,
              background: MAGENTA,
              color: "#17191b",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
