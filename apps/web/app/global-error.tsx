"use client";

import { useEffect, useRef } from "react";

// Last-resort boundary for errors thrown in the root layout itself. It REPLACES
// the layout (root layout never rendered), so it must supply its own <html>/
// <body> and can't depend on the app shell or its CSS — hence inline styles
// matching the dark theme so it still reads as "us", not a browser default.
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
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.5rem",
          padding: "3rem 1rem",
          textAlign: "center",
          background: "#0d061e",
          color: "#f6eef7",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <h1
          ref={headingRef}
          tabIndex={-1}
          style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0, outline: "none" }}
        >
          Camp 404 hit a snag.
        </h1>
        <p style={{ fontSize: "0.875rem", opacity: 0.75, maxWidth: "28rem" }}>
          Something failed before the page could load. Try again &mdash; if it
          persists, let a camp captain know.
        </p>
        <button
          onClick={reset}
          style={{
            cursor: "pointer",
            borderRadius: "0.5rem",
            border: "none",
            padding: "0.625rem 1.25rem",
            fontSize: "0.875rem",
            fontWeight: 500,
            // Mirrors --color-primary oklch(0.65 0.27 340); hardcoded because the
            // app CSS vars are unavailable here (root layout never rendered).
            background: "#ef1ec1",
            color: "#fff",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
