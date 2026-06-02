# AuthShell — organism plan

- **mapsTo:** PROMOTE (keep shared, already an organism in the right place — formalise as the canonical auth chrome; do NOT move into `@camp404/ui`).
- **Home:** **`apps/web` (app-local)** — per component-library `mapsTo: "PROMOTE → keep shared apps/web/components/auth-shell.tsx"`. It stays app-resident because it imports `next/navigation` (`useRouter`) for the Back button, which the layering rule forbids in `@camp404/ui` (ui = presentation only, never `next/*`). It composes only `@camp404/ui` primitives + a Lucide icon, so it sits at the app tier consuming the library, not inside it.
- **Target file path:** `apps/web/components/auth-shell.tsx` (REUSE the existing file; EXTEND only for token/typography reconciliations).

---

## Current state — what exists today (the old design's component/route markup)

**The component exists and is already shared** at `apps/web/components/auth-shell.tsx` (verified, 59 lines). It is a `"use client"` component (needs `useRouter` for Back).

Current implementation (`auth-shell.tsx`):
- Props: `children`, `className?`, `footer?: ReactNode`, `hideBack?: boolean` (`auth-shell.tsx:10-17`).
- Outer: `<div className="flex min-h-svh flex-col items-center justify-center bg-[color:var(--color-muted)] p-6 md:p-10">` (`auth-shell.tsx:33`).
- Inner column: `<div className={cn("w-full max-w-sm", className)}>` (`auth-shell.tsx:34`).
- Back button (rendered only when `!hideBack`): `Button variant="ghost" size="sm"` + Lucide `ArrowLeft` + label "Back", `onClick={() => router.back()}` (`auth-shell.tsx:35-47`).
- Card: `<Card className="overflow-hidden p-0"><CardContent className="p-6 md:p-8">{children}</CardContent></Card>` (`auth-shell.tsx:48-50`).
- Footer (rendered only when `footer` truthy): `<p className="px-6 pt-4 text-center text-xs text-[color:var(--color-muted-foreground)]">{footer}</p>` (`auth-shell.tsx:51-55`).
- Imports `Card`/`CardContent` from `@camp404/ui/components/card`, `Button` from `@camp404/ui/components/button`, `cn` from `@camp404/ui/lib/utils`, `ArrowLeft` from `lucide-react`. Header comment notes it is mirrored from the `intake-tracker` login-04 shadcn block.

**Confirmed consumers today (4 mount sites, grep-verified):**
- `apps/web/app/auth/[path]/page.tsx:24,32` — wraps `SignUpForm` and `<Suspense><SignInForm/></Suspense>`, both `hideBack` (surface 02).
- `apps/web/app/signup/required/page.tsx:30` — `hideBack footer="Camp 404 is invite-only."` wrapping `InviteGateForm` (surface 03).
- `apps/web/app/pending-approval/page.tsx:49` — `hideBack` wrapping the pending/rejected card body (surface 05).

**The leaf it composes is confirmed:** `Card`/`CardContent` exist in `packages/ui/src/components/card.tsx` (six exports; see `molecule-card.md`). `Button` is the canonical primitive (`atom-button.md`).

**Gaps vs spec (reconciliations to carry, not behaviour changes):**

| Gap | Where | Required fix |
|---|---|---|
| Footer uses `text-xs` (Inter 12px). Spec: footer "Camp 404 is invite-only." is `--text-brand-label` — **JetBrains Mono / 11px / 500** (`design-tokens.md:47`; surface 03 §AuthShell chrome `JetBrains Mono/11px/normal`). | `auth-shell.tsx:52` | Restyle footer `<p>` to the brand-label token (mono/11px) once font tokens land (Phase 0). |
| `bg-[color:var(--color-muted)]` is an arbitrary-value escape hatch. | `auth-shell.tsx:33` | Snap to `bg-muted` once token aliases are wired (foundations); behaviour-neutral. |
| `text-[color:var(--color-muted-foreground)]` arbitrary-value on Back + footer. | `auth-shell.tsx:40,52` | Snap to `text-muted-foreground`. |
| `Card` carries `shadow-sm` + `rounded-xl` from `card.tsx`; board wants `--radius`, no shadow. | inherited via `card.tsx:11` | Fixed in `molecule-card.md` Step 2 (radius/shadow normalisation) — AuthShell inherits the fix, no AuthShell change. |
| The downstream card *bodies* (pending-approval icon badge `bg-amber-500/15`, headings `text-2xl`) are token drifts owned by **their** surface organisms, not AuthShell. AuthShell only owns the chrome. | `pending-approval/page.tsx:55,67` | Out of scope here — flagged in surface 05; AuthShell is the wrapper only. |

---

## Composition — leaves, core helpers, services, server/client split

### Leaf components consumed
- **`Card` + `CardContent`** — `packages/ui/src/components/card.tsx` · plan: `design/spec/impl/components/molecule-card.md` (REUSE; AuthShell uses `default` variant, passes `overflow-hidden p-0` / `p-6 md:p-8` via className). **Hard prerequisite:** `molecule-card.md` Steps 1-2 (radius/shadow normalisation) should land so the chrome picks up the token-correct surface.
- **`Button`** (variant `ghost`, size `sm`) — `packages/ui/src/components/button.tsx` · plan: `design/spec/impl/components/atom-button.md` (REUSE) — Back button only.
- **Lucide `ArrowLeft`** — `lucide-react` (REUSE) — Back affordance icon.
- **`cn`** — `@camp404/ui/lib/utils` (REUSE) — className merge for the `className` passthrough.

### `@camp404/core` helpers
- **None.** AuthShell is pure presentational chrome. It holds no access/clearance logic, no `rankLevel`, no `nextGate`. All gating decisions (`hasCampAccess`, `isApproved`, `requireClearance`) happen in the **page server components** that decide *whether* to render AuthShell — never inside the shell. This is consistent with `architecture.md` (core = pure logic; AuthShell only paints).

### Services / server-actions
- **None — AuthShell calls zero services.** It is a layout wrapper. The data/auth work is owned by its children and the host pages:
  - The gating reads (`getAuthenticatedUserOrRedirect`, `ensureCampUser`, `hasCampAccess`, `isApproved`, `getBurnerProfile`) live in the **page** server components (`signup/required/page.tsx`, `pending-approval/page.tsx`) — see `service-layer/01-identity-access-gating.md`. AuthShell never sees them.
  - The auth mutations (`authClient.signIn.email`/`signUp.email`/`signIn.social`) live in `SignInForm`/`SignUpForm` (surface 02). The invite redemption (`submitInviteCode` → `redeemInviteForUser`) lives in `InviteGateForm` (surface 03; `service-layer/02-invites.md`). AuthShell is agnostic to all of them.

### Server-component vs `"use client"` split
- **AuthShell is `"use client"`** — required, because `useRouter().back()` powers the Back button (`auth-shell.tsx:1,4,30`). This is the minimal client boundary: it is a thin chrome shell, so marking it client costs nothing meaningful.
- **Its host pages are server components** (`force-dynamic`) — they do the gating redirects, then render `<AuthShell>` with children. Server children (e.g. the pending-approval card body, which is plain server JSX) pass through the client boundary as `children` props with no issue (React composition rule). Client children (`SignInForm`, `InviteGateForm`) are independently `"use client"`.
- **No new split is introduced** by the redesign — the current boundary is already correct.

---

## API & data flow

### Props (stable — the redesign keeps the contract)
```tsx
interface AuthShellProps {
  children: ReactNode;       // the card body (a form organism or a static branch)
  className?: string;        // merged onto the inner max-w-sm column (escape hatch)
  footer?: ReactNode;        // optional brand-label line UNDER the card; only invite-gate uses it
  hideBack?: boolean;        // suppress the Back button (true on all 4 current mounts)
}
```

### What it fetches vs receives
- **Fetches:** nothing. No data, no session, no DB, no env.
- **Receives:** everything as props/children. The shell is fully driven by its caller.

### How state flows
- AuthShell holds **no React state**. Its only dynamic behaviour is `router.back()` on Back-button click (and Back is suppressed on every current consumer via `hideBack`).
- All form state, validation state, submitting/error state lives **inside the children** (`SignInForm`/`SignUpForm`/`InviteGateForm`), not in the shell. AuthShell is render-stable per the component-library entry: "static chrome; children own form states."
- Gating/redirect state flows **above** AuthShell in the page server component (the page decides to render the shell at all, or `redirect()` away before it mounts).

### Forms: actions + validation
- AuthShell owns **no form, no action, no validation**. It is `<form>`-free. The actions and validation are owned by the child organisms and documented on their surfaces:
  - sign-in/sign-up: `authClient.*` calls, presence + password-match validation (surface 02 §Validation).
  - invite-gate: `submitInviteCode` server action, rate-limit + code-usability validation (surface 03 §Validation).

---

## States

AuthShell itself is **static chrome** — it has no empty/loading/error/submitting/success states of its own. The matrix below maps the full global state grammar onto this component to show explicitly where each state is owned.

| State | Owned by AuthShell? | Treatment |
|---|---|---|
| **Empty** | No | The child form/branch renders its empty state inside `CardContent`; shell unchanged. |
| **Loading** | No | Host pages are `force-dynamic` server components — they await auth+DB and arrive complete (no skeleton). Where children fetch (`SignInForm` reads `useSearchParams`), the **page** wraps it in `<Suspense fallback={null}>` *inside* AuthShell (`auth/[path]/page.tsx:33`); the shell chrome paints, the form area is briefly `null`. |
| **Error** | No | Child renders its `role="alert"` block inside `CardContent` (sign-in/sign-up server/validation errors; invite-gate alerts). Shell is inert. |
| **Submitting** | No | Child's submit button flips to disabled/loading label; shell does not react. |
| **Success** | No | Success = page navigation/redirect; AuthShell unmounts. No success UI in the shell. |
| **Disabled** | No | N/A — the shell has one interactive element (Back), only present when `!hideBack`; it is never disabled. |
| **Back variants (own chrome states)** | **Yes** | `with-back` (`!hideBack` → ghost Back + `ArrowLeft`, `onClick=router.back()`), `hideBack` (suppressed — all 4 current mounts). |
| **Footer variants (own chrome states)** | **Yes** | `with-footer` (renders brand-label `<p>` under the card — invite-gate "Camp 404 is invite-only.") vs no-footer (sign-in/sign-up/pending). |
| **Preview-but-locked (CaptainLock)** | **No — and explicitly N/A** | These are **pre-access gates outside the authenticated app shell**. Surface 02 §Gating: "This surface carries none… `CaptainLock` does not appear here." Surface 03: "No `CaptainLock`." Surface 05 §matrix: "Not applicable — pre-access gate entirely outside the authenticated app shell." AuthShell never hosts rank-gated sections; `requireClearance`/`CaptainLock` belong to the authenticated TopChrome surfaces, not here. |

**Gating states that route *around* AuthShell (page-level, never rendered as a shell state):**
- Unauthenticated → `redirect("/auth/sign-in")` before any shell mounts.
- Already has access / god email → `redirect("/")` before invite-gate/pending shells render.
- Approved since last load → `redirect("/")` before the pending shell renders.
- Onboarding incomplete → `redirect("/onboarding/questionnaire")`.

These are owned by the host server components (per `service-layer/01-identity-access-gating.md`), not by AuthShell. The shell only renders once the page has decided it is the correct screen.

---

## Build steps

> AuthShell is **PROMOTE/REUSE** — it already exists and works across 3 surfaces. The "build" here is a small token/typography reconciliation, not a rewrite. **Drop no functionality**: keep all four props, both variants (with-back/hideBack, with-footer), the `router.back()` behaviour, the `overflow-hidden p-0` / `p-6 md:p-8` Card geometry, and the `max-w-sm` + `min-h-svh` centring exactly.

### Prerequisites (must land first)
1. **Phase 0 foundations** (`foundations-tokens.md`): `--font-jetbrains-mono` + `--text-brand-label` step wired; `bg-muted`/`text-muted-foreground` Tailwind token aliases available. Gates the footer/escape-hatch reconciliations.
2. **`molecule-card.md` Steps 1-2** (radius → `--radius`, drop `shadow-sm`): so the chrome surface is token-correct. AuthShell consumes the fixed Card with no AuthShell-side change.
3. `atom-button.md` (REUSE, already canonical — no blocking work).

### Step 1 — Token reconciliation pass (the only EXTEND)
- Footer `<p>`: replace `text-xs text-[color:var(--color-muted-foreground)]` with the brand-label token — JetBrains Mono / 11px / 500 (`--text-brand-label`) + `text-muted-foreground`. Keep `px-6 pt-4 text-center`.
- Outer wrapper: `bg-[color:var(--color-muted)]` → `bg-muted`.
- Back button: `text-[color:var(--color-muted-foreground)]` → `text-muted-foreground`.
- **Acceptance:** all 4 consumers render byte-identical layout; the invite-gate footer renders in JetBrains Mono 11px; no arbitrary-value `[color:var(...)]` escapes remain in `auth-shell.tsx`; `pnpm build` + `pnpm lint` green for `apps/web`.

### Step 2 — Confirm props + behaviour are untouched
- Verify `hideBack`, `footer`, `className`, `children` all behave as before; `router.back()` still wired on the (currently-unused) with-back path.
- **Acceptance:** TypeScript clean; the `AuthShellProps` interface is unchanged; grep shows the 4 mount sites compile without edits.

### Step 3 — (Optional, low-priority) Surface the with-back path
- Today all 4 mounts pass `hideBack`. The with-back variant is spec-supported (`variant: with-back`) but unexercised. No action required unless a future flow (e.g. a multi-step pre-auth wizard) needs it; keep the code path live for that contract.
- **Acceptance:** none required; documented as a live-but-unused capability.

### Tests
- **Storybook** (`auth-shell.stories.tsx`, app-local or in the package's story surface for app components):
  - `Default` — children = placeholder card body, no footer, `hideBack`.
  - `WithFooter` — `footer="Camp 404 is invite-only."` rendering in brand-label mono (invite-gate anatomy).
  - `WithBack` — `hideBack={false}` showing the ghost Back + `ArrowLeft`.
  - `WithForm` — mounts a stub form to verify `CardContent` padding/geometry.
- **Vitest / RTL** (`auth-shell.test.tsx`):
  - renders children inside the Card/CardContent.
  - `hideBack` (default-ish on mounts) → no Back button in the DOM; `hideBack={false}` → Back button present with accessible "Back" label + `ArrowLeft`.
  - clicking Back calls `router.back()` (mock `next/navigation`).
  - `footer` truthy → renders the footer `<p>` with the text; absent → no footer node.
  - `className` merges onto the inner `max-w-sm` column (no clobber of `w-full max-w-sm`).
  - layout assertions: outer carries `min-h-svh` + centring; footer carries the brand-label/mono class.
- **No service/integration tests** — AuthShell has no data path.

---

## Consumers

| Surface | Route | How AuthShell is mounted | Notes |
|---|---|---|---|
| **02 Auth — sign-in** | `/auth/sign-in` | `AuthShell hideBack` → `<Suspense fallback={null}><SignInForm/></Suspense>` (`auth/[path]/page.tsx:31-37`) | No footer. Suspense lives inside the shell. |
| **02 Auth — sign-up** | `/auth/sign-up` | `AuthShell hideBack` → `<SignUpForm/>` (`auth/[path]/page.tsx:23-27`) | No footer. |
| **03 Invite gate** | `/signup/required` | `AuthShell hideBack footer="Camp 404 is invite-only."` → `<InviteGateForm email=… />` (`signup/required/page.tsx:30-32`) | **The only footer consumer.** |
| **05 Approval gate** | `/pending-approval` | `AuthShell hideBack` → static pending/rejected card body (`pending-approval/page.tsx:49-90`) | No footer; children are plain server JSX (icon badge + heading + copy + sign-out `Button`). |

**Not a consumer:** the hosted Neon Auth fallback (`/auth/<other>` → `<AuthView>`) deliberately renders in a bare `<main className="… max-w-md …">` with **no AuthShell** (`auth/[path]/page.tsx:43-47`; surface 02 §Hosted fallback). Carry that asymmetry forward — do not wrap the fallback in AuthShell.
