# Shake-to-Report — Design Spec

> **Status: DRAFT — REQUIRES MAINTAINER REVIEW. Not approved for build.**
> Feature: "shake your phone to open a bug / feature-request modal", modelled on the
> RyRy79261/intake-tracker bug-report dialog. The **manual section** of that source dialog is
> **explicitly out of scope** (see [Out of scope](#out-of-scope)).
> Date: 2026-05-31.

## Goal

Let a signed-in camper quickly file a bug report or feature request from anywhere in the app. Shake is one of **several equal entry points** into a single canonical modal — never the only door — so desktop, keyboard, screen-reader, reduced-motion, and motion-denied iOS users all get a first-class path. Reports persist to a new in-repo `feedback_reports` table; the maintainer pulls and triages them later via MCP (no push to the external Intake Tracker).

## Architecture / approach

One global `"use client"` gate component (mirroring `apps/web/app/acknowledgement-gate.tsx`) owns the `open` state, an always-present trigger button, and an opt-in `devicemotion` shake listener; all three routes call the same `setOpen(true)`. The modal reuses the existing Radix `Dialog` primitive (`packages/ui/src/components/dialog.tsx`) for free focus-trap / Esc / scroll-lock / `aria-modal` / animations, and reuses `RecorderPanel` + the questionnaire `appendTranscript` pattern for optional voice dictation. Shake detection is pure web (`window.addEventListener("devicemotion")` + iOS `DeviceMotionEvent.requestPermission()`), adding **zero new native Capacitor dependencies**, with a documented `TODO(capacitor)` seam to adopt `@capacitor/motion` later — mirroring the existing precedent in `apps/web/components/voice/use-voice-recorder.ts:105`.

---

## Components

### 1. Shake hook — `apps/web/components/feedback/use-shake.ts` (new, `"use client"`)

A single detector module behind a stable interface so a future native swap is localized:

```ts
useShake(opts: {
  enabled: boolean;          // parent gates: false until opted-in, false while modal open
  onShake: () => void;       // fired once per detected shake, after cooldown
  threshold?: number;        // default ~16 (m/s^2 delta), conservative for bumpy vehicles
  cooldownMs?: number;       // default 1500
}): {
  supported: boolean;
  permission: "unknown" | "granted" | "denied" | "unsupported";
  requestPermission: () => Promise<"granted" | "denied" | "unsupported">;
}
```

**Feature detection** (must be `typeof`-guarded so static export / SSG never touches `window`):
- `const supported = typeof DeviceMotionEvent !== "undefined";`
- `const needsPermission = supported && typeof (DeviceMotionEvent as any).requestPermission === "function";` (iOS 13+ path).

**`requestPermission()`** — MUST be called from inside a user-gesture (tap) handler or iOS rejects:
- not supported → `"unsupported"`;
- `!needsPermission` (Android / desktop Chrome) → `"granted"` (no dialog exists there);
- else `await DeviceMotionEvent.requestPermission()` and return its `"granted" | "denied"`.

**Listener** lives in a `useEffect` keyed on `[enabled]`. If `!enabled`, attach nothing. Otherwise `window.addEventListener("devicemotion", handler)` and **detach in cleanup** (mirror the AcknowledgementGate effect-cleanup discipline).

**Algorithm** (concrete starting values — need on-device tuning):
- Read `event.accelerationIncludingGravity` `{x,y,z}`; if `null`, ignore (some desktops fire empty events).
- `delta = |x−lastX| + |y−lastY| + |z−lastZ|`; store current as `last*`.
- If `delta > threshold`, increment a windowed hit counter; reset the counter if `>300ms` since the last hit.
- When the counter reaches `~2–3` hits **and** `now − lastShakeAt > cooldownMs` → set `lastShakeAt = now`, reset counter, call `onShake()`. The cooldown ref is the shake analog of AcknowledgementGate's monotonic `requestId` anti-clobber guard.
- The parent passes `enabled: false` while the modal is open, so a shake can't re-fire over an open modal.

**Native swap seam** — inside the hook, document a `TODO(capacitor): adopt @capacitor/motion for native (gate on Capacitor.isNativePlatform())`, byte-for-byte mirroring `use-voice-recorder.ts:105`. **Note for reviewers:** `@capacitor/motion` would **not** remove the iOS gesture-permission requirement (it still calls `DeviceMotionEvent.requestPermission` under a gesture on the web/iOS path), so reaching for the plugin does not "fix" the iOS opt-in friction.

### 2. Global mount — `apps/web/app/feedback-gate.tsx` (new, `"use client"`, named export, no props)

Mirrors `apps/web/app/acknowledgement-gate.tsx`. Owns the whole feature: the trigger button, the shake wiring, the `open` state, and the modal. Mount it as a sibling immediately **after** `<AcknowledgementGate />` inside `<Providers>` in `apps/web/app/layout.tsx` (currently line 49):

```tsx
<Providers>
  {children}
  <AcknowledgementGate />
  <FeedbackGate />
</Providers>
```

State owned:
- `open: boolean` (the modal).
- `motionState: "idle" | "enabled" | "denied" | "unsupported"` (drives `useShake`'s `enabled`).
- On mount: read the persisted opt-in (see [Persistence](#persistence-of-the-ios-opt-in)). If Android/desktop and motion supported and opted-in → `"enabled"`. If iOS-needs-permission → stay `"idle"` until the user taps the enable affordance (the `requestPermission()` call must be gesture-bound). If reduced-motion is set → default the opt-in OFF (see [Accessibility](#accessibility--reduced-motion)).
- `useShake({ enabled: motionState === "enabled" && !open, onShake: () => setOpen(true) })`.

**The always-present trigger button (the accessibility spine, and the E2E open seam):** whenever a user is signed in, render a fixed round icon button (lucide `Bug` / `MessageSquarePlus`), `aria-label="Report a bug or request a feature"`, at `fixed bottom-4 right-4 z-40` — below Dialog's `z-50` and AcknowledgementGate's `z-[100]`. It is keyboard-focusable and calls the **same** `setOpen(true)`. This guarantees no feature is shake-only. (Placement — floating vs tucked into a menu — is an [open decision](#open-decisions-need-maintainer-sign-off-before-build).)

**iOS opt-in surface:** when `needsPermission && motionState === "idle"`, offer a one-time, dismissible "Enable shake-to-report" affordance whose tap handler calls `requestPermission()`; on `"granted"` → `"enabled"` + persist; on `"denied"` → `"denied"` (stop nagging). On Android/desktop this never shows.

### 3. The modal — `apps/web/components/feedback/feedback-dialog.tsx` (new, `"use client"`)

Imports the existing primitive from `@camp404/ui/components/dialog`. Controlled via `{ open: boolean; onOpenChange: (o: boolean) => void }`. Use `<DialogContent>` directly (it self-renders portal + overlay; do **not** add your own). Include a real (not `sr-only`) `<DialogTitle>` for a11y.

Fields (no manual section — out of scope):
1. **kind**: `"bug" | "feature"` — a two-button segmented control with `role="radiogroup"` wrapping two `role="radio"` buttons. Default `"bug"`. Maps to `feedbackKindEnum`.
2. **title**: single-line `<Input>`, required, `maxLength ~120`. Label "What's it about?".
3. **description / body**: `<Textarea>` primary input (required, `maxLength ~4000`) **plus** optional voice dictation, copying the questionnaire `LongTextField` pattern verbatim (`apps/web/components/questionnaire/question.tsx`, ~L418–477):
   - parent holds `const [dictating, setDictating] = React.useState(false)` and the `body` value;
   - below the textarea: when `dictating`, render `<RecorderPanel onTranscript={appendTranscript} onDismiss={() => setDictating(false)} promptKey="bug_report" />`; else a `<Button variant="outline"><Mic/> Dictate instead</Button>`;
   - reuse the exact `appendTranscript` helper (newline-joiner + `.slice(0, maxLength)`);
   - capture the raw transcript separately into a `voiceTranscript` ref to persist alongside the (possibly edited) body.

Header: `<DialogTitle>Report a bug or request a feature</DialogTitle>` + `<DialogDescription>Tell us what happened — type or dictate.</DialogDescription>`. Footer: Cancel (`variant="outline"`, `onClick` closes) + Send (primary).

Internal state machine: `editing → submitting → success` (brief confirmation, then auto-close + reset) **or** `error` (inline `role="alert"`, destructive color, stay open so text isn't lost). On close, reset `kind`/`title`/`body`/`dictating`.

**New `promptKey="bug_report"` is inert until two server edits land** (see [Error handling](#promptkey-registration-required-server-edit) note and these exact files):
- `apps/web/lib/voice-prompts.ts`: add `export const BUG_REPORT_PROMPT` (dense with app/repro vocab: "Camp 404, bug, crash, freeze, error, 404, login, sign in, button, page, screen, reproduce, steps, expected, actual, feature request, questionnaire, reimbursement, announcement, inventory, recipe, Capacitor, iOS, Android").
- `apps/web/app/api/voice/transcribe/route.ts`: today line 10 is `const ACCEPTED_PROMPT_KEYS = new Set(["questionnaire"]);` and lines 62–64 map every accepted key to `QUESTIONNAIRE_PROMPT`. Refactor the lookup to a `Record<string, string>` keyed by `promptKey` (`{ questionnaire: QUESTIONNAIRE_PROMPT, bug_report: BUG_REPORT_PROMPT }`) and `const prompt = PROMPTS[promptKey];` (unknown key → `undefined`). **Security-critical:** this preserves the "server-known prompt, client cannot inject" property — only known keys map to known prompts, and the questionnaire path must not regress.

### 4. Submit action — `apps/web/app/feedback/actions.ts` (new, `"use server"`)

Export `submitFeedbackAction(input: unknown): Promise<ActionResult>` using the repo's exact `ActionResult<T>` type (defined at `apps/web/app/captains/announcements/actions.ts:14–16`):

```ts
export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };
```

- Guard with `const user = await getAuthenticatedUser()` (from `@/lib/auth`) — **not** `...OrRedirect` (a modal must not redirect). If `null`, return `{ ok: false, error: "Sign in to send feedback." }`. (Require-auth vs allow-anonymous is an [open decision](#open-decisions-need-maintainer-sign-off-before-build); leaning require-auth since the gate only mounts under `<Providers>`.)
- Validate with a Zod schema (define `FeedbackReportInput` in `@camp404/types`, mirroring `ComposeAnnouncementInput`): `kind` enum, `title` 1..120, `body` 1..4000, optional `route` / `appVersion` / `voiceTranscript`, `platform` enum. On failure return `{ ok: false, error: parsed.error.issues[0]?.message }`.
- **Client context provenance:** `userAgent` — read server-side from `headers()` (more trustworthy than client-sent). `route` — client sends `window.location.pathname` captured at submit time. `platform` — passed from the client (the gate knows web vs native). `appVersion` — from a build/env constant if wired, else `null` ([open decision](#open-decisions-need-maintainer-sign-off-before-build)).
- Branch on `isE2ETestMode()` (from `@/lib/test-mode`): `true` → `testStore.createFeedbackReport(...)`; `false` → `createHttpDb().insert(schema.feedbackReports).values({ reporterUserId: campUserId, ... }).returning({ id })`. Single insert → HTTP driver, no transaction.
- Return `{ ok: true }`. No `revalidatePath` needed (no server-rendered list yet).

---

## Data model

Append to `packages/db/src/schema.ts` (the single schema file). **Reuse the existing `platformEnum`** at `schema.ts:89` (`["web","ios","android"]`) — do **not** mint a new one. Include a house-style section-header comment block. Status enum width is an [open decision](#open-decisions-need-maintainer-sign-off-before-build); the draft below uses the minimal surface.

```ts
// --- Feedback reports ----------------------------------------------------
// In-app bug reports and feature requests, opened by the "shake your phone"
// gesture or the always-present report button. One row per submission — the
// in-repo capture/inbox. Triaging into the maintainer's external Intake
// Tracker (an MCP server, not an in-repo model) is a downstream, code-side
// concern keyed off `status` + `externalRef`. The voice path reuses
// RecorderPanel; the manual section of the source dialog is out of scope.

export const feedbackKindEnum = pgEnum("feedback_kind", ["bug", "feature"]);

export const feedbackStatusEnum = pgEnum("feedback_status", [
  "new",
  "triaged",
  "closed",
]);

export const feedbackReports = pgTable(
  "feedback_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // set null (not cascade): a report is a durable record we keep for triage
    // even if the account is later deleted — matches audit_log / reimbursements.
    reporterUserId: uuid("reporter_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    kind: feedbackKindEnum("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),

    // Optional client context captured at submit time — denormalised because
    // there's no row to join back to. route = the in-app path shaken on;
    // userAgent + appVersion + platform help reproduce.
    route: text("route"),
    userAgent: text("user_agent"),
    appVersion: text("app_version"),
    platform: platformEnum("platform"),

    // Verbatim dictation transcript kept alongside the (possibly edited) body,
    // mirroring recipes.transcript.
    voiceTranscript: text("voice_transcript"),

    status: feedbackStatusEnum("status").notNull().default("new"),

    // Triage stamps + external reference (the Intake Tracker issue id once
    // forwarded). Nullable, no default. externalRef is a plain text seam, NOT
    // an FK — mirrors mcpAuditLog.clientId surviving the external lifecycle.
    triagedByUserId: uuid("triaged_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    triagedAt: timestamp("triaged_at", { mode: "date" }),
    externalRef: text("external_ref"),

    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (f) => ({
    reporterIdx: index("feedback_reports_reporter_idx").on(f.reporterUserId),
    statusIdx: index("feedback_reports_status_idx").on(f.status),
    kindIdx: index("feedback_reports_kind_idx").on(f.kind),
    createdAtIdx: index("feedback_reports_created_at_idx").on(f.createdAt),
  }),
);
```

**Migration:** after editing the schema, run `pnpm --filter @camp404/db db:generate` — it produces `packages/db/migrations/0012_*.sql` + `meta/0012_snapshot.json` + a `meta/_journal.json` entry (latest existing is `0011_far_toro`). Apply with `pnpm --filter @camp404/db db:migrate`. **Do not hand-write the SQL.**

**Test-store note** — edits to `apps/web/lib/test-store.ts` (the `globalThis["__camp404TestStore__"]` singleton):
1. Add a `TestFeedbackReport` interface mirroring the row (same shape style as `TestBroadcast` / `TestDelivery`).
2. Add `feedbackReports: TestFeedbackReport[]` to `TestStoreState`, init `[]` in `globalState()`, bind `const feedbackReports = S.feedbackReports;` next to the other stable array bindings (~L128–137).
3. Add methods `createFeedbackReport(input)` (`id: crypto.randomUUID()`, `status: "new"`, `createdAt: new Date()`) and `listFeedbackReports()` / `listFeedbackReportsForUser(userId)` returning newest-first (`.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())`).
4. Add `feedbackReports.length = 0;` to `reset()` (~L558) so `DELETE /api/test/reset` clears it.
5. Export `TestFeedbackReport` in the trailing `export type { ... }` block.

---

## Error handling

- The submit action returns the repo-standard `{ ok: true } | { ok: false; error: string }`. The modal renders `{ ok: false }` inline as `role="alert"` (destructive color) above the footer and **stays open** so the user's text isn't lost — matching the `RecorderPanel` inline-error and `ActionResult` rendering conventions.
- Validation failures surface the first Zod issue message; no stack/internals leak to the client (mirrors the transcribe route's "don't leak Groq internals" handling at `route.ts:70–76`).
- Unexpected render-time errors in the gate or modal are caught by the recently-added in-app error boundaries (`app/error.tsx`, `app/global-error.tsx`); the gate itself returns nothing visible when `!open` (analogous to AcknowledgementGate's `if (!current) return null`), so it can't break unrelated pages.
- The shake hook fails safe: on `"denied"`/`"unsupported"`, no listener is attached and the button remains the working path. iOS silent-failure (listening without a granted permission yields **no events and no error**) is prevented by the feature-detect + gesture-gated `requestPermission()`.

#### promptKey registration (required server edit)

`promptKey="bug_report"` does nothing until `apps/web/lib/voice-prompts.ts` (add `BUG_REPORT_PROMPT`) and `apps/web/app/api/voice/transcribe/route.ts` (the `Set → Record` lookup refactor) both land. Until then dictation in the modal still works but uses no biasing prompt for an unknown key (the route returns `undefined` for the prompt, which is harmless). Keep the questionnaire path byte-identical.

---

## Mobile / Capacitor notes

- The same `apps/web` bundle runs as PWA, in mobile-web, and inside the Capacitor WKWebView (`apps/mobile`, `webDir: ../web/out`, static export via `MOBILE_BUILD=1`). All shake / motion / `localStorage` code is `"use client"` and `typeof`-guards `window` / `DeviceMotionEvent` so SSG never crashes.
- **Zero new native deps.** No `@capacitor/motion`, no `cap sync`, no Info.plist motion-usage string (the generic web `devicemotion` event needs none). This mirrors the repo precedent of MediaRecorder-over-native-recorder in `use-voice-recorder.ts`.
- **iOS 13+** (Safari and WKWebView): `DeviceMotionEvent.requestPermission()` must be called from a user gesture; you cannot auto-enable shake on first load. Hence the opt-in tap. iOS Safari also requires a secure context for motion; `capacitor://` is treated secure, but **verify on-device** once a native build exists.
- **Android** (Chrome/WebView): fires `devicemotion` freely with no `requestPermission` — guard with the feature-detect and just `addEventListener` when opted in.
- `@capacitor/motion` is **not** installed and, importantly, would **not** remove the iOS gesture requirement; the `TODO(capacitor)` seam in `use-shake.ts` is the localized place to adopt it later.

---

## Accessibility & reduced-motion

- **No shake-only dead-ends.** The always-present, keyboard-focusable trigger button (`aria-label="Report a bug or request a feature"`) is the canonical open path; shake calls the identical `setOpen(true)`. Desktop, keyboard, screen-reader, reduced-motion, and motion-denied iOS users all reach the same modal.
- Radix `Dialog` supplies focus-trap, Esc-to-close, scroll-lock, and `aria-modal`. The `<DialogTitle>` is a real heading (not `sr-only`).
- The `kind` toggle uses `role="radiogroup"` + `role="radio"` semantics.
- **Reduced motion:** if `matchMedia("(prefers-reduced-motion: reduce)").matches`, default the shake opt-in OFF and surface copy like "Shake-to-report is off (reduced motion)". The button is unaffected — full functionality without motion.
- The voice-dictation mic-permission prompt happens inside the already-open modal, which is fine.

---

## Persistence of the iOS opt-in

There is no `localStorage` / Preferences abstraction in `apps/web` today (`@capacitor/preferences` is installed in `apps/mobile` but unused by web). Persist the single opt-in boolean client-side with `window.localStorage` key `"camp404.shakeReport.enabled"` (works in both PWA and WKWebView). No server-side opt-in column. This is the lowest-friction path matching the no-native-deps angle; a server-side per-user setting is an [open decision](#open-decisions-need-maintainer-sign-off-before-build).

---

## Intake-Tracker relationship

The Intake Tracker is an **external** MCP server the maintainer OAuth-connects to from claude.ai; it is **not** an in-repo data model, and the app holds no credential to push to it. **Recommendation: store in-app + pull via a new in-repo MCP tool.** Do **not** call the external tracker from the submit action.

- Submit writes only to `feedback_reports` (`status: "new"`).
- Add `registerFeedbackTools(server)` in a new `apps/web/lib/mcp/tools/feedback.ts`, wired into `registerCampMcpTools` in `apps/web/lib/mcp/server.ts`. Follow `apps/web/lib/mcp/tools/recipes.ts` exactly: `server.registerTool` wrapped in `runTool({ toolName, extra, argsForAudit, handler })`, Zod enums from `schema.feedbackKindEnum.enumValues` / `schema.feedbackStatusEnum.enumValues`, `createHttpDb()`, `truncateList`.
- **Captain/maintainer tier** (gate via `scope` like the recipes review note): `list_feedback_reports` (filter by status/kind, newest-first) and `triage_feedback_report` / `mark_feedback_triaged(id, status, externalRef)` which sets `status`, `triagedByUserId = scope.campUserId`, `triagedAt`, and `externalRef` (the Intake Tracker issue id). Whether to also ship a member `list_my_feedback_reports` now, and whether triage ships in v1 vs the deferred captain batch, are [open decisions](#open-decisions-need-maintainer-sign-off-before-build).
- The maintainer's claude.ai session then reads via the in-repo tool, creates the issue in the external Intake Tracker by hand/agent, and writes back `externalRef` — keeping the two MCP servers decoupled and the link auditable via `mcpAuditLog`.

---

## Testing strategy

**Unit:**
- `use-shake.ts`: feed synthetic `accelerationIncludingGravity` samples; assert threshold crossings + multi-hit window + cooldown fire `onShake` exactly once and respect `enabled=false`. Assert `requestPermission()` returns `"granted"` when `requestPermission` is absent (Android/desktop) and `"unsupported"` when `DeviceMotionEvent` is undefined.
- `appendTranscript`: newline-joiner and `maxLength` slice (reused helper — light coverage).
- Submit action: Zod validation paths and the `isE2ETestMode()` branch into `testStore`.

**E2E (Playwright):**
- **Primary open seam is the always-present button** — `page.getByRole("button", { name: /report a bug/i }).click()`. This is stable, sensor-free, and is the same decision as the accessibility spine (no synthetic-event flakiness, nothing to gate out of production).
- Fill `kind` / `title` / `body` → Send → assert success copy; then assert the row landed via the test-store (`listFeedbackReports`) or a test-only read.
- **DeviceMotion simulation (optional, dev-only extra):** real hardware can't dispatch `devicemotion` in CI. If a shake-path spec is wanted, gate a synthetic seam behind `isE2ETestMode()` / non-prod — e.g. the gate also listens for `window.addEventListener("camp404:simulate-shake", () => setOpen(true))` and the spec does `window.dispatchEvent(new Event("camp404:simulate-shake"))`. This must be gated out of production (anyone could dispatch it). **The button remains the primary seam; the synthetic event is never the only test path.**
- Reset between specs relies on `feedbackReports.length = 0` in `testStore.reset()`.

---

## Out of scope

- **The "manual" section of the source intake-tracker dialog is explicitly out of scope.** Do not design or build it.
- **Screenshot / attachment capture** is out for v1 (confirm in open decisions).
- **Push to the external Intake Tracker** at submit time (rejected — no credential, fragile coupling).
- **Native `@capacitor/motion` integration** (deferred behind the `TODO(capacitor)` seam).
- **A server-rendered feedback list / triage UI** in the web app (the MCP tools are the v1 triage surface).

---

## Open decisions (need maintainer sign-off before build)

1. **Always-present button: yes/no and placement.** Recommend YES (it makes shake optional and is the clean E2E seam). Decide `fixed bottom-4 right-4 z-40` vs tucking it into an existing menu (menu costs discoverability).
2. **Native plugin now vs later.** Recommend LATER (web-first via raw DeviceMotion). Verified blockers: no `@capacitor/core` in `apps/web`, no generated ios/android projects, no mobile CI, and `@capacitor/motion` does **not** remove the iOS gesture-permission requirement. Behind the `TODO(capacitor)` seam.
3. **Intake Tracker push vs pull.** Recommend store-in-app + pull-via-new-MCP-tool (the app has no OAuth credential to push). Confirm; and decide whether the read tool ships now (member `list_my_feedback_reports`) vs deferred to the captain batch (`list_feedback_reports` + `triage_feedback_report` with `externalRef` write-back).
4. **Status enum width.** `["new","triaged","closed"]` (drafted, minimal — fits a small camp tool) vs `["new","triaged","resolved","wont_fix"]` vs the 5-state `["new","triaged","in_progress","resolved","wont_fix"]`. **Pick before `db:generate`** — it bakes into migration 0012.
5. **Shake sensitivity + reduced-motion.** Threshold (~15–18 m/s²), multi-hit window (~300–600ms), cooldown (~1.5s) need real-device tuning (bumpy desert vehicles = false-positive risk). Confirm reduced-motion defaults the opt-in OFF.
6. **iOS opt-in surface + persistence.** One-time inline prompt/chip vs a Settings toggle vs both; persist via `localStorage` (recommended for a single boolean, no native dep) vs `@capacitor/preferences`. Revisit if a server-side per-user setting is wanted.
7. **Auth requirement.** Require `getAuthenticatedUser()` and reject anonymous with `{ ok: false }` (recommended — gate mounts under `<Providers>`) vs allow anonymous `reporterUserId = null`.
8. **`promptKey` route refactor scope.** Confirm the `Set → Record` change in `apps/web/app/api/voice/transcribe/route.ts` maps only known keys to known prompts (unknown → `undefined`), preserving the no-client-injection property and not regressing questionnaire dictation. `bug_report` transcription is unbiased until `voice-prompts.ts` + the route land.
9. **Screenshot / attachment capture.** Confirm OUT for v1.
10. **`appVersion` source.** No `NEXT_PUBLIC_APP_VERSION` / build stamp is wired today — add one or leave the column nullable for v1 (drafted: nullable).
11. **Persisting both `body` and `voiceTranscript`.** The verbatim transcript may capture more than the user intended to send (pre-edit text), and `userAgent`/`route`/`appVersion` are denormalised PII on a row that outlives the reporter (`set null` FK). Confirm retention/privacy expectation.
