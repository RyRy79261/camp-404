### 22. Global overlays (ack-gate, shake-to-report, error, enable-push)
**Purpose:** Three globally-mounted surfaces above the app shell: a full-screen announcement acknowledgement takeover, a shake-triggered bug/feature reporter that files a GitHub issue, and a route error boundary.
**Layout & elements:** Mobile single column. (1) Ack takeover (dialog, max-w-2xl): Megaphone + uppercase "Camp announcement", title, meta "From {senderName} · {createdAt}" (drop "From" prefix if null), body (preserves line breaks), and at scroll end "{n} more after this." then "Acknowledge". (2) Report dialog title "Report a bug"/"Request a feature"; kind group ("Report type") Bug/Feature; label "What went wrong?"/"What would you like to see?"; textarea (placeholder "What you did, what you expected, and what happened instead."/"Describe the capability or improvement you have in mind."); "Dictate instead" → RecorderPanel; "Improve with AI" checkbox + "Restructures your report into a clear title and steps before filing."; "Send report" + "Cancel". Success: CheckCircle2 "Report filed", "Issue #{number} was created on GitHub. Thanks!" or "Thanks — your report was sent.", "View issue #{number}"/"Open the tracker", "Done". (3) Error card: "Something went sideways.", "An unexpected error tripped us up. Try again — if it keeps happening, let a camp captain know.", "Try again" + "Back to camp".
**Every action (preserve all):**
- Scroll-to-end + Acknowledge → POSTs, removes current item, reveals next; spinner + disabled while acking.
- Shake device (only trigger) → opens reporter; only when signed in and not already open.
- First pointerdown post-sign-in → iOS motion-permission prompt (once).
- Toggle Bug/Feature → switches copy/labels.
- Type description → max 5000 chars.
- Dictate → appends transcript; panel stays open.
- Toggle "Improve with AI" → only shown when AI available; default on.
- Send report → files issue; "Sending…" spinner; cannot dismiss mid-send.
- Cancel → closes; disabled while sending.
- View issue / Done; Try again (re-render) / Back to camp (/).
**States to design:**
- Empty → ack queue empty renders nothing; description empty, submit disabled.
- Loading → no ack spinner (shows nothing until data); session pending = treated signed-out.
- Populated → queue[0] shown; full form.
- Validation-error → "Please describe the issue."; maxLength; submit disabled until non-empty.
- Submitting → ack spinner/disabled; "Sending…", Cancel disabled, no dismiss.
- Success → "Report filed" view; ack removed + refresh.
- Disabled → empty/pending submit; Cancel while pending.
- Invite-gated/pre-invite → feedback works ("unlinked" reporter); ack queue empty without camp access.
- AI-unavailable → checkbox hidden, useAi forced false.
- Config-error → inline error banner (missing token / bad repo).
- Error boundary → full-screen retry + home, focus on heading.
**Options & exact values:** Kind: "bug"|"feature" (default "bug"). Labels: ["bug","from-app"]/["enhancement","from-app"]. Severity: critical|high|medium|low. Presentation surfaced: "acknowledge" only. DESCRIPTION_MAX=5000; TITLE_MAX=100; ISSUE_BODY_MAX=60000; POLL_INTERVAL_MS=45000. Shake: threshold=8, requiredJolts=5, windowMs=800, cooldownMs=3000, SAMPLE_THROTTLE_MS=60. Rate limits: burst 3/60000ms, daily 20/86400000ms. Repo default "RyRy79261/camp-404". AI model "claude-haiku-4-5-20251001", max_tokens 1024, temp 0, timeout 30000; GitHub timeout 8000. Env: GITHUB_FEEDBACK_TOKEN, GITHUB_FEEDBACK_REPO, ANTHROPIC_API_KEY, E2E_TEST_MODE.
**Validation & rules:**
- Description required/trimmed/≤5000; blank/HTML-only/all-PII → "Please describe the issue." (no issue filed).
- deliveryId must be UUID (400); ack is owner+presentation-scoped.
- Mandatory ordered PII redaction (tokens, JWT, keys, URL params, emails, phones, IDs, cards → placeholders); AI input is sanitized text; AI output re-sanitized; markdown injection defused (fenced/mdInline/inlineCode).
- Auth gate: not signed in → "Please sign in to send feedback." Config gates: missing token / bad repo → captain messages.
- GitHub status messages: 401/403/404/410/other/timeout each map to a distinct error string; 201 validated, else "Your report was filed, but we couldn't read GitHub's reply."
- E2E mode bypasses AI+GitHub returning number 0.
**Do-not-drop:** Shake-only reporter that PII-redacts then files a GitHub issue (no DB write), the ack takeover forcing scroll-to-end acknowledgement with de-raced polling, and the error boundary's retry/home escape. No dead/orphaned variants; note MODELS.opus exists but is unused here.
