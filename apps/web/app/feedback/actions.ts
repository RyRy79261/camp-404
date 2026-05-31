"use server";

import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { findCampUserByAuthId } from "@/lib/users";
import { rateLimit } from "@/lib/rate-limit";
import { isE2ETestMode } from "@/lib/test-mode";
import {
  buildFeedbackIssue,
  DESCRIPTION_MAX,
  sanitizeReportText,
} from "@/lib/github-feedback";
import { structureWithAi } from "@/lib/feedback-ai";

export type FeedbackResult =
  | { ok: true; number: number; url: string }
  | { ok: false; error: string };

const InputSchema = z.object({
  kind: z.enum(["bug", "feature"]),
  description: z
    .string()
    .trim()
    .min(1, "Please describe the issue.")
    .max(DESCRIPTION_MAX),
  dictated: z.boolean().optional(),
  route: z.string().max(300).optional(),
  // "Improve with AI" toggle — restructure the report before filing.
  useAi: z.boolean().optional(),
});

const DEFAULT_REPO = "RyRy79261/camp-404";

/**
 * File an in-app bug/feature report as a GitHub issue. Nothing is stored in our
 * DB — GitHub Issues is the store. Requires sign-in (so the report is
 * attributable) and is rate-limited per user. Degrades gracefully: a missing
 * token or a GitHub error returns a typed {ok:false} the modal renders inline.
 */
export async function submitFeedbackAction(
  input: unknown,
): Promise<FeedbackResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { ok: false, error: "Please sign in to send feedback." };

  // Burst + daily caps. In-memory + per-instance (the app-wide limiter), so
  // best-effort against a determined member — but the destination is a public
  // tracker, so a daily ceiling is worth the cheap second check.
  const burst = rateLimit(`feedback:${user.id}`, { limit: 3 });
  if (!burst.ok) {
    return {
      ok: false,
      error: "You're sending these quickly — give it a minute and try again.",
    };
  }
  const daily = rateLimit(`feedback-day:${user.id}`, {
    limit: 20,
    windowMs: 86_400_000,
  });
  if (!daily.ok) {
    return {
      ok: false,
      error: "You've filed a lot of reports today — please try again tomorrow.",
    };
  }

  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const { kind, description, dictated, route, useAi } = parsed.data;

  // Sanitize once: reject input that's empty after PII/HTML stripping (e.g.
  // HTML-only) so we never file a blank issue, and use the clean text as the
  // AI input so no PII is sent to the model.
  const sanitized = sanitizeReportText(description, DESCRIPTION_MAX);
  if (!sanitized) {
    return { ok: false, error: "Please describe the issue." };
  }

  // Opaque reporter reference: the camp user id maps internally and exposes no
  // PII. For a signed-in user with no camp row yet (pre-invite), use a sentinel
  // rather than the raw auth id, which is a more linkable cross-system id.
  const campUser = await findCampUserByAuthId(user.id);
  const reporterRef = campUser?.id || "unlinked";

  // E2E mode exercises auth + validation but never calls the AI or GitHub.
  if (isE2ETestMode()) {
    return { ok: true, number: 0, url: `https://github.com/${DEFAULT_REPO}/issues` };
  }

  // Optional "Improve with AI" restructuring; null on any failure → plain body.
  const structured = useAi ? await structureWithAi(kind, sanitized) : null;

  const issue = buildFeedbackIssue({
    kind,
    description: sanitized,
    dictated: dictated ?? false,
    reporterRef,
    route,
    structured,
  });

  const token = process.env.GITHUB_FEEDBACK_TOKEN;
  if (!token) {
    console.error("submitFeedbackAction: GITHUB_FEEDBACK_TOKEN is not set");
    return {
      ok: false,
      error: "Feedback isn't set up yet. Let a camp captain know.",
    };
  }

  const repo = (process.env.GITHUB_FEEDBACK_REPO || DEFAULT_REPO).trim();
  const segments = repo.split("/").map((s) => s.trim()).filter(Boolean);
  if (segments.length !== 2) {
    console.error("submitFeedbackAction: GITHUB_FEEDBACK_REPO is misconfigured:", repo);
    return {
      ok: false,
      error: "Feedback isn't configured correctly. Let a camp captain know.",
    };
  }
  const [owner, name] = segments;

  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${name}/issues`,
      {
        method: "POST",
        // Bound the call so a stalled GitHub connection can't hang the server
        // action; the catch below maps the TimeoutError to a retry message.
        signal: AbortSignal.timeout(8000),
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          "User-Agent": "camp-404-feedback",
        },
        body: JSON.stringify({
          title: issue.title,
          body: issue.body,
          labels: issue.labels,
        }),
      },
    );

    if (res.status === 201) {
      const data = (await res.json()) as { number: number; html_url: string };
      return { ok: true, number: data.number, url: data.html_url };
    }

    console.error(
      `submitFeedbackAction: GitHub responded ${res.status}`,
      await res.text().catch(() => ""),
    );
    if (res.status === 401) {
      return { ok: false, error: "GitHub rejected the token — a captain needs to refresh it." };
    }
    if (res.status === 403 || res.status === 404) {
      return { ok: false, error: "The feedback tracker is unreachable right now." };
    }
    if (res.status === 410) {
      return { ok: false, error: "Issues are turned off on the tracker repo." };
    }
    return { ok: false, error: "Couldn't file your report just now. Please try again." };
  } catch (err) {
    console.error("submitFeedbackAction: GitHub request failed", err);
    return { ok: false, error: "Couldn't reach the feedback tracker. Please try again." };
  }
}
