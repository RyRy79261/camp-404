# Harvest Unit 09 — Bulletins / announcements with pinning + markdown

**Donor:** quagga-portal (AfrikaBurn Contributors App), at
`/tmp/claude-1000/-home-ryan-repos-Personal-camp-404/845134f9-90e2-4e43-94d4-18d487ff8c56/scratchpad/ab-app`
**Target:** Camp 404, at `/home/ryan/repos/Personal/camp-404`
All donor paths below are repo-relative to the donor root. All line numbers verified by
`cat -n` / `rg -n` on 2026-09-08.

---

## 1. Purpose

The donor's **bulletin** subsystem is its org→audience broadcast product: a markdown-bodied,
audience-targeted, draft-then-publish notice that fans out one inbox notification per resolved
recipient, is deep-linkable as a standalone read page in **all three apps**, can be **pinned**
to a recipient dashboard banner, and reports a **read rate** ("12 of 30 read · 40%") back to the
author, computed off `notifications.read_at`.

Its design law, stated in three places in code
(`packages/types/src/notifications.ts:42-46`, `packages/db/src/schema.ts:1739-1746`,
`apps/org/components/bulletins/bulletin-composer.tsx:31-33`), is the **fewer-forms law**:

> A bulletin is title + markdown body + audience + optional pin. Nothing else — a bulletin never
> collects data. Anything that needs an answer is a questionnaire.

The second law, encoded in the publish action's guards and named in the test file's header
docblock (`apps/org/lib/__tests__/bulletin-actions.test.ts:5-15`), is:

> A BULLETIN IS A BROADCAST, AND IT CANNOT BE RECALLED.

That single sentence produces the four hardest-won behaviours in the whole unit, and they are
the ones Camp 404 most wants: **title + audience freeze at publish**, **body stays editable and
notifies nobody**, **`SELECT … FOR UPDATE` row-lock so a double publish cannot double-fan-out**,
and **broadcast authorisation is re-checked AT publish, not trusted from save time**.

### Why this matters to Camp 404

Camp 404's `/captains/announcements`
(`apps/web/app/captains/announcements/{page.tsx,announcements-manager.tsx,actions.ts}` +
`packages/db/src/broadcasts.ts`) is roughly the same feature at an earlier stage:

| Capability | Donor bulletins | Camp 404 announcements |
|---|---|---|
| Draft → publish lifecycle | ✅ `published_at` null = draft | ✅ `broadcasts.published_at` null = draft |
| Author-only draft edit/delete | ✅ (`update`/`create` capability split, `apps/org/lib/actions/bulletins.ts:124-128`) | ✅ `isOwnedAnnouncementDraft` (author-scoped WHERE), but **WP2 #126** says list-side Edit/Delete/Publish is not owner-restricted in the UI |
| **Markdown body + editor** | ✅ Tiptap `MarkdownEditor` + `MarkdownView` | ❌ plain `text` body; `react-markdown ^10.1.0` + `rehype-sanitize ^6.0.0` are **declared in `apps/web/package.json` and imported by zero files** — verified by `rg -ln "react-markdown\|rehype-sanitize" apps packages` returning only `apps/web/package.json` |
| **Pinning** | ✅ `bulletins.pinned` + `setBulletinPinned` + `PinnedBulletinBanner` on the camp dashboard | ❌ no pin column, no banner, no concept |
| **Expiry** | ❌ **neither repo has one** — no `expires_at` on `bulletins`; unpinning is the only "take it down" | ❌ |
| **Audience targeting** | ✅ 11 single-choice options over a shared 5-shape `AudienceSpec` | ⚠️ composer hardcodes `scope: 'everyone'` (`packages/types/src/announcement.ts:19-22` says so verbatim); the schema supports `[everyone, team, team_leads, drivers, individual]` with **no writer** (WP12 #136) |
| **Read receipts** | ✅ read-rate bar off `notifications.read_at`, aggregated in SQL | ✅ `acknowledgedCount` off `notification_deliveries.acknowledged_at` (a stronger signal — an explicit ack, not just an open) + `recipientCount`; no `read_at` roll-up on the captain view |
| **Publish confirm / recall** | ❌ **no confirm, no recall, no delete, no unpublish** in the donor either (verified: `rg -n "deleteBulletin\|unpublish"` finds nothing under `apps/org`) | ❌ — this is Camp 404 **WP1 #125**, and the donor does **not** solve it |
| **Race-safe publish** | ✅ `.for("update")` row lock, twice (`actions/bulletins.ts:159`, `:315`) | ✅ different mechanism: `UPDATE … WHERE isOwnedAnnouncementDraft` claim + `(broadcast_id, user_id)` dedupe index + `ON CONFLICT DO NOTHING` |
| **Immutable-after-send fields** | ✅ title + audience frozen, refused loudly | ❌ nothing frozen |
| **Standalone deep-linkable read page** | ✅ `/bulletins/[id]` in web + suppliers (+ an org redirect to the editor) | ❌ announcements are inbox-only; there is no `/announcements/[id]` |
| **Live "resolves to ~N recipients" preview** | ✅ debounced server action (300 ms) | ❌ |
| **"Preview — how recipients see it"** | ✅ live `NotificationItem` + `BulletinCard` side panel | ❌ |
| **Scheduled send** | ❌ donor has no `send_at` | ✅ Camp 404 `broadcasts.send_at` + `dispatchDueBroadcasts` cron |
| **Push** | ❌ | ✅ FCM pipeline |
| **Acknowledge takeover** | ❌ (donor's blocking interrupt is questionnaire-only) | ✅ `broadcast_presentation` `[acknowledge, popup, feed]` + `AcknowledgementGate` |

Net: **the donor is ahead on authoring, markdown, targeting, freezing, pinning and read-page
surfacing; Camp 404 is ahead on delivery (scheduling, push, acknowledge presentation).**
The two halves are complementary, and the donor half is largely portable.

---

## 2. File inventory (with line counts)

### 2a. `packages/ui` — the portable presentation layer (tenant-agnostic)

| Path | Lines | Role |
|---|---:|---|
| `packages/ui/src/lib/bulletin.ts` | 24 | Pure `readRate(read, of)` maths. No React, no deps. |
| `packages/ui/src/components/bulletin-card.tsx` | 115 | Card: kicker, pin marker, title, 2-line preview, meta, audience chip, optional read-rate progress bar. No hooks → RSC-safe. |
| `packages/ui/src/components/pinned-bulletin-banner.tsx` | 63 | Slim translucent pinned banner + "Read →" link; `onDismiss` is opt-in (omit ⇒ zero event handlers ⇒ RSC-safe). |
| `packages/ui/src/components/audience-select.tsx` | 81 | Dumb Select variant + "Resolves to ~N burners" line. Resolves nothing itself. |
| `packages/ui/src/components/notification-item.tsx` | 144 | Inbox row; `NOTIFICATION_KIND_ICON` 7-kind glyph map; unread dot; `blocking` accent flag. RSC-safe. |
| `packages/ui/src/components/notification-bell.tsx` | 53 | Bell + capped unread badge (`max` default 99 → "99+"). `forwardRef`, RSC-safe. |
| `packages/ui/src/components/markdown-editor/extensions.ts` | 35 | Shared Tiptap extension set — **the sanitiser**. |
| `packages/ui/src/components/markdown-editor/markdown-editor.tsx` | 196 | The compose editor. Markdown string in, markdown string out. 6-button toolbar. |
| `packages/ui/src/components/markdown-editor/markdown-view.tsx` | 46 | Read-only renderer (`editable: false`). |
| `packages/ui/src/components/markdown-editor/markdown.ts` | 33 | Headless `roundTripMarkdown(md)` — detached editor, used by tests. |

### 2b. `packages/types` / `packages/core` — validation + pure domain

| Path | Lines | Role |
|---|---:|---|
| `packages/types/src/notifications.ts` | 58 | `NotificationKind`, `NotificationPayload`, **`BulletinComposeInput`**, `NotificationFilter`. |
| `packages/types/src/audience.ts` | 191 | The whole `AudienceSpec` discriminated union + selector enums + label maps. |
| `packages/core/src/notifications.ts` | 412 | Payload builders incl. `bulletinNotification`; `resolveBulletinAudience`; `buildBulletinNotifications`; `resolveNotificationLinkApp` / `notificationLinkIsLocal`; `shouldSendImmediateEmail`; `isUnread`/`countUnread`; `groupNotificationsByDay`; `notificationMentionsAny`. |
| `packages/core/src/audience.ts` | 313 | `resolveAudience(spec, ctx)` — pure, injected row sets. |
| `packages/core/src/questionnaire-authz.ts` | (fn at `:57-70`) | `canAuthorAudience` / `canActivateAudience` — the broadcast-right predicate. |

### 2c. `apps/org` — the console (authoring)

| Path | Lines | Role |
|---|---:|---|
| `apps/org/lib/bulletins.ts` | 126 | Read models `listBulletins()` / `getBulletin(id)` with SQL read-rate tallies. |
| `apps/org/lib/actions/bulletins.ts` | 386 | `saveBulletin`, `publishBulletin`, `setBulletinPinned` + `fanOut`, `audienceKey`, `assertOrgAudience`, `broadcastRefusal`, `PUBLISHED_FROZEN_MESSAGE`. |
| `apps/org/components/bulletins/bulletin-composer.tsx` | 316 | The compose/edit client form + live preview panel. |
| `apps/org/components/bulletins/audience-options.ts` | 94 | Option-value ⇄ `AudienceSpec` mapping + count-noun. |
| `apps/org/components/bulletins/audience-count.ts` | 102 | `"use server"` `previewBulletinAudienceCount` — gated on the `bulletins` domain. |
| `apps/org/components/bulletins/preview-text.ts` | 27 | `plainPreview(markdown, max=220)` — 9-rule regex markdown strip. |
| `apps/org/app/(console)/bulletins/page.tsx` | 117 | Sent + Drafts list. |
| `apps/org/app/(console)/bulletins/new/page.tsx` | 40 | Compose page. |
| `apps/org/app/(console)/bulletins/[id]/edit/page.tsx` | 74 | Edit page. |
| `apps/org/app/(console)/bulletins/[id]/page.tsx` | 15 | **Redirect to `/edit`** — the deep link means "reader" in the participant app and "work on this" in the console. |
| `apps/org/app/(console)/bulletins/loading.tsx` | 27 | Skeleton (two sections × two `SkeletonCard lines={2}`). |
| `apps/org/lib/__tests__/bulletin-actions.test.ts` | 501 | The contract. 20 tests. |

### 2d. Recipient-side read surfaces

| Path | Lines | Role |
|---|---:|---|
| `apps/web/lib/bulletins.ts` | 93 | `getBulletinForCurrentUser(id)`, `getPinnedBulletinsForCurrentUser()`. |
| `apps/web/app/(app)/bulletins/[id]/page.tsx` | 143 | Participant standalone bulletin page. |
| `apps/web/app/(app)/bulletins/[id]/loading.tsx` | 28 | Skeleton. |
| `apps/suppliers/app/(portal)/bulletins/[id]/page.tsx` | 91 | Supplier standalone bulletin page (added 27 Jul 2026, audit B3). |
| `apps/suppliers/lib/notifications.ts:140-192` | 53 | `getBulletinForSupplier(userId, bulletinId)`. |
| `apps/web/app/(app)/camps/[slug]/page.tsx:29, :166, :269-274` | — | The **only** `PinnedBulletinBanner` call site, and it never passes `onDismiss`. |

### 2e. Inbox plumbing that the bulletin rides on

| Path | Lines | Role |
|---|---:|---|
| `apps/web/lib/notifications.ts` | 163 | `getUnreadNotificationCount`, `listNotificationGroups`, `recentNotifications`, **chunked** `insertNotifications`. |
| `apps/web/lib/notifications-actions.ts` | 80 | `markNotificationRead`, `markAllNotificationsRead` (own rows only). |
| `apps/web/components/notifications/format.ts` | 172 | `relativeTime`, `sourceLabel`, `dayGroupHeading`, `isBlockingNotification`, `toRowItem`. |
| `apps/web/components/notifications/filter-tabs.tsx` | 59 | All / Unread · n / **Bulletins** tabs, state in `?filter=`. |
| `apps/web/components/notifications/notification-row.tsx` | 67 | Click → optimistic read + navigate. |
| `apps/web/app/(app)/notifications/page.tsx` | 118 | Inbox page with per-filter empty copy. |
| `apps/web/app/api/notifications/digest/route.ts` | 36 | **Declared design stub** — returns `{status:"stub", scheduled:false}`. |

### 2f. Schema + migrations

| Path | Lines | Role |
|---|---:|---|
| `packages/db/src/schema.ts:1739-1773` | 35 | `bulletins` table. |
| `packages/db/src/schema.ts:1833-1892` | 60 | `notifications` table. |
| `packages/db/src/schema.ts:229-237` | 9 | `notificationKindEnum`. |
| `packages/db/migrations/0009_left_blue_shield.sql` | 34 | Creates `notification_kind`, `bulletins`, `notifications`, 4 FKs, 4 indexes. |
| `packages/db/migrations/0021_demonic_starhawk.sql` | 23 | Adds `notifications.origin` + `notifications.link_app` (21 lines of that file are the incident comment). |

### 2g. Tests

| Path | Lines | Covers |
|---|---:|---|
| `apps/org/lib/__tests__/bulletin-actions.test.ts` | 501 | Actions + read models. |
| `packages/ui/src/components/__tests__/markdown-editor.test.tsx` | 244 | Editor a11y, toolbar, link prompt, reset guard, **XSS**. |
| `packages/ui/src/components/__tests__/tier2-3.test.tsx` | (bulletin parts `:59-84`, `:139-151`, markdown round-trip `:153+`) | `readRate`, `BulletinCard` bar, `PinnedBulletinBanner`. |
| `packages/ui/src/components/__tests__/audience-select.test.tsx` | ~95 | Count line, placeholder, disabled. |
| `packages/core/src/__tests__/notifications.test.ts` | 373 | Fan-out, org-internal isolation, privacy guard, link-app rules. |
| `apps/web/lib/__tests__/notifications-inbox.test.ts` | 270+ | `getBulletinForCurrentUser`, `getPinnedBulletinsForCurrentUser`. |
| `apps/suppliers/lib/__tests__/notifications.test.ts:180-224` | 45 | `getBulletinForSupplier` authz + unpublished + chunking. |
| `e2e/specs/org-staff/bulletins-targeting.spec.ts` | 66 | Compose → publish → targeted receives, non-targeted provably does not. |
| `e2e/specs/org-staff/bulletins-audience-reach.spec.ts` | 153 | Artwork-leads vs camp-leads control; **cross-app** org→suppliers hop. |

**Total dedicated bulletin surface: ~2,050 lines of source + ~1,400 lines of test.**

---

## 3. Capability list (exhaustive, each cited)

### Authoring

1. **Compose a bulletin: title + markdown body + audience + pin.** Nothing else.
   `packages/types/src/notifications.ts:47-53`; the composer renders exactly four controls
   (`bulletin-composer.tsx:175-248`).
2. **Save as draft (no notification).** `input.publish === false` → `published_at` stays null;
   `apps/org/lib/actions/bulletins.ts:228`. Test: `bulletin-actions.test.ts:265-280`
   ("creates a DRAFT without notifying anybody").
3. **Publish on create.** One transaction: insert with `published_at = now` → resolve audience →
   fan out → audit `bulletin.publish`. `actions/bulletins.ts:218-251`.
4. **Publish an existing draft** via `publishBulletin({ id })` — a separate action carrying its
   own row lock and its own re-authorisation. `actions/bulletins.ts:291-357`.
5. **Correct a published bulletin's BODY** — allowed, and it notifies nobody.
   `actions/bulletins.ts:180-186`; test `bulletin-actions.test.ts:205-236`.
6. **Toggle pin** independently, on drafts *and* published rows.
   `setBulletinPinned` `actions/bulletins.ts:362-386`; audit row `bulletin.pin` with
   `meta: { pinned }`.
7. **Live audience count** with 300 ms debounce, from the same resolver the publish uses.
   `bulletin-composer.tsx:91-114`; server action `audience-count.ts:62-101`.
8. **Live "how recipients see it" preview** — a real `NotificationItem` + a real `BulletinCard`,
   fed the same title/preview/audience/pin the publish would use.
   `bulletin-composer.tsx:288-313`.
9. **Informational-only callout** rendered in the form, so the fewer-forms law is told to the
   author rather than only enforced. `bulletin-composer.tsx:250-259`.
10. **Pin copy that describes what the pin actually does** — a 9-line comment
    (`bulletin-composer.tsx:221-229`) records that the old copy promised "a banner … until
    dismissed" and *both halves were false*; the copy now says readers cannot dismiss it and
    suppliers/org get no banner at all.

### The freeze (the most valuable behaviour)

11. **Title and audience FREEZE at publish**, and the refusal is **loud**, not a silent discard —
    because the composer posts the whole form back and a dropped title change would toast
    "Bulletin saved." over an unmoved title. `actions/bulletins.ts:100-101` (the message),
    `:166-172` (the guard). Test `bulletin-actions.test.ts:177-203`.
12. **Audience comparison is order-insensitive** on the selector arrays — `["a","b"]` and
    `["b","a"]` reach the same people and must not read as a change. `audienceKey()`
    `actions/bulletins.ts:76-88`. Test `:238-263`.
13. **Never un-publish, never re-stamp.** `...(input.publish && !alreadyPublished ? { publishedAt: now } : {})`
    — `actions/bulletins.ts:186`. Test asserts `values.publishedAt` is `undefined` on a
    published-row edit (`:230`).

### Authorisation (two independent gates, both server-side)

14. **Console capability gate**, verb chosen by path: `create` when composing, `update` when
    correcting. `actions/bulletins.ts:117-128`. The comment records the defect: both paths used
    to ask for `update`, so a role given "may correct what is already there" could compose and
    broadcast. Test `:132-157`.
15. **Broadcast-right gate** — `canActivateAudience` admits only org AUTHORS (`god`/`org_staff`).
    `packages/core/src/questionnaire-authz.ts:30`, `:57-70`. An **engineer** passes the
    capability and is refused here, with a refusal named to their rank
    (`broadcastRefusal`, `actions/bulletins.ts:60-64`). Test `:114-130`.
16. **Project (camp-scoped) audiences are refused outright** on both save and publish —
    "Bulletins broadcast to org audiences, not a single camp."
    `actions/bulletins.ts:44-46`, `:322`. Tests `:94-112`, `:367-384`.
17. **The broadcast right is RE-CHECKED at publish**, against the *stored* audience, because the
    save-time answer may be stale (a role can be rescoped between drafting and sending).
    `actions/bulletins.ts:320-330`. Test `:341-365`.
18. **Preview refuses in the same words the publish would** — `broadcastRefusal` is duplicated
    verbatim into `audience-count.ts:51-55` with a comment saying so.

### Race safety

19. **`SELECT … FOR UPDATE` row lock on both publish paths.** `actions/bulletins.ts:149-159` and
    `:310-315`. The comments record the live incident: "two publishes racing the same draft (a
    double-clicked button, two staff on the same row) both read `published_at IS NULL`, both
    passed, and both fanned out — the whole audience got the notice twice, and nothing in the
    console said why."
20. **Second publish is refused**, not tolerated: "That bulletin is already published."
    `actions/bulletins.ts:317-319`. Test `:318-339`.
21. **Row write + fan-out + audit are one atomic unit** (`withTransaction`) — "a published
    bulletin must never exist without its recipients' notifications, nor notifications without
    the published row." `actions/bulletins.ts:139-141`.

### Fan-out

22. **One notification row per resolved recipient**, kind `bulletin`, `link = /bulletins/<id>`,
    `bulletinId` set. `packages/core/src/notifications.ts:200-211`, `:297-310`.
23. **`linkApp` is deliberately `null`** for bulletins — `/bulletins/<id>` exists in all three
    apps and each authorises the read from the recipient's own row, so "treat as local wherever
    it is read" is the only value right for a mixed burner+supplier audience.
    `actions/bulletins.ts:276-285`. Test asserts `rows[0]?.linkApp` is `null` (`:302`).
24. **`origin: "org"`** stamped on every bulletin row (`actions/bulletins.ts:284`).
25. **Empty audiences fan out to zero rows — a valid, non-error outcome.**
    `packages/core/src/audience.ts:274-278`; test `notifications.test.ts:113-124`.
26. **Chunked insert at 1000 rows/statement.** `apps/web/lib/notifications.ts:124-126`, `:144-161`.
    The comment records the ceiling as live, not theoretical: Postgres' 65535-parameter limit
    kills a single insert at ~10923 rows, "and because a bulletin publish wraps this in a
    transaction, the whole broadcast rolled back. AfrikaBurn is comfortably bigger than 10922
    people."
27. **Audit trail**: `bulletin.create` / `bulletin.update` / `bulletin.publish` / `bulletin.pin`
    written inside the same transaction. `actions/bulletins.ts:202-209`, `:244-248`, `:347-351`,
    `:377-382`.

### Reading (recipient side)

28. **Read authorisation IS the notification row.** A bulletin is readable only by a user who
    has a `notifications` row for it — the read-side enforcement of the same audience. An
    org-internal or untargeted broadcast **404s rather than leaking**.
    `apps/web/lib/bulletins.ts:32-43`; `apps/suppliers/lib/notifications.ts:167-178`.
    Test: `apps/suppliers/lib/__tests__/notifications.test.ts:186-197` also asserts the bulletin
    row **is not even read** when the authz fails (`expect(db.against("bulletins")).toEqual([])`).
29. **Unpublished bulletins are never returned**, even with a notification row from a previous
    cycle. `apps/web/lib/bulletins.ts:56`; `suppliers/lib/notifications.ts:191`.
    Test `suppliers .test.ts:210-216`.
30. **Zod at the route boundary** — a non-uuid path segment is a 404, never a query.
    `apps/web/app/(app)/bulletins/[id]/page.tsx:83-85`.
31. **Standalone bulletin page** with kicker "Bulletin · From AfrikaBurn", `en-GB` published
    date, audience chip, pin marker, `<hr>`, `MarkdownView` body, "Back to notifications" link.
    `apps/web/app/(app)/bulletins/[id]/page.tsx:99-142`.
32. **Pinned banner on the camp dashboard**, newest first, published-only.
    `apps/web/lib/bulletins.ts:64-93`; rendered `apps/web/app/(app)/camps/[slug]/page.tsx:269-274`.
33. **Bulletins filter tab** in the inbox (`?filter=bulletins` → `kind = 'bulletin'`).
    `apps/web/lib/notifications.ts:69-70`; tabs `filter-tabs.tsx:16-22`.
34. **Bulletins never get immediate email** — only registration decisions and blocking
    questionnaires do. `packages/core/src/notifications.ts:320-327`;
    test `notifications.test.ts:263-274`.

### Read-rate reporting

35. **`readRate(read, of)`** clamps `read` into `[0, of]` and returns `0%` for a zero-recipient
    bulletin (no divide-by-zero). `packages/ui/src/lib/bulletin.ts:19-24`.
36. **Read/sent tallies computed in SQL**, `count(*) filter (where read_at is not null)::int`.
    List: one grouped aggregate for the whole page (`apps/org/lib/bulletins.ts:73-84`). Detail:
    a single-row aggregate for **one** bulletin (`:112-123`) — its 10-line docblock records that
    it used to be a filter over `listBulletins()`, so opening one bulletin "fetched every
    bulletin row in the deployment — bodies included, which are up to 20 000 characters each —
    and then aggregated every bulletin notification ever sent, to read a single row and a single
    pair of counts out of the result." Test `bulletin-actions.test.ts:488-500` asserts the detail
    query contains no `groupBy`.
37. **A bulletin nobody received reports 0/0**, not `undefined/undefined`. `NO_TALLY`
    `apps/org/lib/bulletins.ts:38`, `:86`. Test `:470-478`.
38. **Read-rate bar is `role="progressbar"`** with `aria-valuenow/min/max` + `aria-label="Read rate"`.
    `bulletin-card.tsx:97-109`.

### Markdown

39. **WYSIWYG markdown editor whose value in/out is a markdown STRING.**
    `markdown-editor.tsx:125-134`; test asserts the emitted value contains `## …` and **not**
    `<h2>` (`markdown-editor.test.tsx:134-146`).
40. **6-button toolbar**: Bold, Italic, Heading (level 2 only), Link, Bullet list, Numbered list.
    `markdown-editor.tsx:73-118`.
41. **`role="textbox"` + `aria-multiline="true"` + `aria-label`** on the contenteditable region,
    with an 11-line comment explaining that a bare contenteditable announces as a generic *group*
    — found because an e2e spec could not find it by role.
    `markdown-editor.tsx:146-163`. Test `:59-74`.
42. **`aria-pressed` on every toolbar button** reports what the caret stands in.
    `markdown-editor.tsx:50`. Test `:103-123`.
43. **External-reset guard**: reseeding from a changed `value` uses `{ emitUpdate: false }`, so a
    controlled autosaving parent cannot loop against itself.
    `markdown-editor.tsx:175-183`. Test `:188-207` calls this out as the load-bearing behaviour.
44. **Link prompt semantics**: cancel (`null`) changes nothing; empty string **unsets** the link;
    otherwise `setLink`. `markdown-editor.tsx:62-71`. Tests `:149-181`.
45. **`MarkdownView` — read-only render via the same schema.** `markdown-view.tsx:31-45`.
46. **The schema IS the sanitiser.** `Markdown.configure({ html: false, … })` makes raw HTML in
    the markdown plain text; the ProseMirror schema can only emit nodes/marks the extensions
    define. `extensions.ts:12-16`. Test: `<img src=x onerror="alert(1)">` renders as **text**,
    `container.querySelector("img")` is null. `markdown-editor.test.tsx:232-243`.
47. **Links restricted to safe protocols** `["http","https","mailto"]`, `rel="noopener noreferrer nofollow"`,
    `target="_blank"`, `openOnClick: false`. `extensions.ts:21-26`.
48. **Headings capped to levels [2, 3]** — a bulletin body cannot mint an `<h1>` competing with
    the page title. `extensions.ts:20`.
49. **`roundTripMarkdown(md)`** — headless normalise-through-the-schema helper.
    `markdown.ts:27-32`.
50. **`plainPreview(markdown, max=220)`** — a 9-rule regex strip (fenced code, inline code,
    images, links→text, headings, blockquotes, list bullets, emphasis, whitespace collapse) with
    a `…` truncation. Pure and dependency-free so both the server list and the client composer
    use it. `preview-text.ts:7-27`.

### Design / UX polish worth stealing

51. **`loading.tsx` skeletons** on the org list and the participant bulletin page — Camp 404 has
    **zero** `loading.tsx` files (WP7 #131).
52. **The console `/bulletins/[id]` route is a redirect to `/edit`** so staff following their own
    inbox link do not land on a dead route. `apps/org/app/(console)/bulletins/[id]/page.tsx:1-15`.
53. **Empty state with a CTA** on the list. `apps/org/app/(console)/bulletins/page.tsx:43-56`.
54. **Drafts render at `opacity-70` with a hover restore.** `:109-113`.
55. **Meta copy differs by state**: `Draft · not sent · last edited <date>` vs
    `From AfrikaBurn · <date>`. `:99-103`.

---

## 4. Data model (verbatim)

### `bulletins` — `packages/db/src/schema.ts:1748-1773`

```ts
export const bulletins = pgTable(
  "bulletins",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => editions.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    bodyMd: text("body_md").notNull(),
    // Same enum/shape as questionnaire audiences (validated by AudienceSpec in
    // @quagga/types; resolved by @quagga/core resolveAudience at publish time).
    audience: jsonb("audience").$type<AudienceSpec>().notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Null = draft; set on publish (the fan-out trigger).
    publishedAt: timestamp("published_at", { mode: "date" }),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (b) => ({
    editionIdx: index("bulletins_edition_idx").on(b.editionId),
    publishedIdx: index("bulletins_published_idx").on(b.publishedAt),
  }),
);
```

**Nine columns. No `expires_at`. No `deleted_at`. No `status` enum** — draft/sent is
`published_at IS NULL`.

### `notifications` — `packages/db/src/schema.ts:1841-1892` (columns only)

```
id            uuid PK default gen_random_uuid()
user_id       uuid NOT NULL → users.id ON DELETE cascade
kind          notification_kind NOT NULL
title         text NOT NULL
body          text
link          text
origin        text            -- 'org' | 'camp' | 'system'   (migration 0021, NULLABLE)
link_app      text            -- 'web' | 'org' | 'suppliers' (migration 0021, NULLABLE)
bulletin_id   uuid → bulletins.id ON DELETE cascade
created_at    timestamp NOT NULL default now()
read_at       timestamp
```

Indexes:
- `notifications_user_read_idx` on `(user_id, read_at)` — unread count + filter
- `notifications_user_created_idx` on `(user_id, created_at DESC NULLS LAST)` — inbox list

Note `origin` and `link_app` are **plain `text`, not pgEnums** — deliberate, per the 21-line
migration comment (`0021_demonic_starhawk.sql:1-21`): all three apps migrate at build time, so
whichever deploys first would be writing columns the others do not yet bind, and "every
notification insert swallows its own exception, making that failure silent."

### `notificationKindEnum` — `packages/db/src/schema.ts:229-237`

```ts
export const notificationKindEnum = pgEnum("notification_kind", [
  "registration",
  "wrangler",
  "role",
  "questionnaire",
  "supplier",
  "security",
  "bulletin",
]);
```

Mirrored three times, by contract: this enum, the `NotificationKind` Zod enum
(`packages/types/src/notifications.ts:16-24`), and `NOTIFICATION_KIND_ICON`
(`packages/ui/src/components/notification-item.tsx:36-44`). Each file's header says "keep the
three in sync".

### `AudienceSpec` — `packages/types/src/audience.ts:136-143`

A 5-member discriminated union on `kind`:

```ts
export const AudienceSpec = z.discriminatedUnion("kind", [
  OrgInternalAudience,   // { kind: "org_internal" }
  OrgOutboundAudience,   // { kind: "org_outbound", selectors: OrgOutboundSelector[] (min 1) }
  OrgOfficerAudience,    // { kind: "org_officer", officerKeys: OfficerKey[] (min 1) }
  OrgSuppliersAudience,  // { kind: "org_suppliers" }
  ProjectAudience,       // { kind: "project", groupId, mode: "everyone"|"roles", roleIds: string[] }
]);
```

`OrgOutboundSelector` — `audience.ts:36-51`, **7 members, verbatim**:

```
all_current_burners      // every burner with a Burner Bio for the active edition
camp_leads               // leads/admins of any theme_camp group
registered_camp_leads    // leads/admins of camps with an approved registration this edition
mv_leads                 // leads/admins of mutant_vehicle groups
mv_grant_requesters      // MV groups whose current-edition registration has grants_interest = true
art_leads                // leads/admins of artwork groups
art_grant_requesters     // artwork groups with grants_interest = true this edition
```

`ORG_OUTBOUND_SELECTOR_LABELS` — `audience.ts:58-67`:

```ts
{
  all_current_burners: "All current burners",
  camp_leads: "Theme camp leads",
  registered_camp_leads: "Registered camp leads",
  mv_leads: "Mutant vehicle leads",
  mv_grant_requesters: "MV grant requesters",
  art_leads: "Artwork leads",
  art_grant_requesters: "Art grant requesters",
}
```

`OFFICER_AUDIENCE_LABELS` — `audience.ts:98-107`, 5 members:

```ts
{
  lnt_officer: "All registered LNT Leads",
  safety_officer: "All registered Safety Officers",
  fire_safety_officer: "All registered Safety Barons",
  sound_officer: "All registered Sound Officers",
  safety_monitor: "All registered Safety Monitors",
}
```

The bulletin picker therefore offers **7 outbound + 5 officer + Suppliers + Org internal = 14
options** (`audience-options.ts:32-45`), single-choice.

### `BulletinComposeInput` — `packages/types/src/notifications.ts:47-53`

```ts
export const BulletinComposeInput = z.object({
  title: z.string().trim().min(1, "Give the bulletin a title.").max(200),
  bodyMd: z.string().trim().min(1, "Write the bulletin body.").max(20000),
  audience: AudienceSpec,
  pinned: z.boolean().default(false),
  publish: z.boolean().default(false),
});
```

**Digit-exact limits: title ≤ 200 chars, body ≤ 20 000 chars, both trimmed and min 1.**
Camp 404's `ComposeAnnouncementInput` is title ≤ **120**, body ≤ **5 000**
(`packages/types/src/announcement.ts:24-25`).

### `NotificationFilter` — `packages/types/src/notifications.ts:57`

```ts
export const NotificationFilter = z.enum(["all", "unread", "bulletins"]);
```

### `NotificationPayload` — `packages/types/src/notifications.ts:33-38`

```ts
z.object({
  kind: NotificationKind,
  title: z.string().min(1),
  body: z.string().nullable().default(null),
  link: z.string().nullable().default(null),
})
```

### Audit action strings (free-text `audit_events.action`)

`bulletin.create` · `bulletin.update` · `bulletin.publish` · `bulletin.pin`
(`apps/org/lib/actions/bulletins.ts:205-207`, `:246`, `:349`, `:379`).
`bulletin.pin` additionally carries `meta: { pinned: boolean }` (`:381`).

---

## 5. Public API surface (verbatim signatures)

### `packages/ui/src/lib/bulletin.ts`

```ts
export interface ReadRate { read: number; of: number; percent: number }
export function readRate(read: number, of: number): ReadRate
```

### `packages/ui/src/components/bulletin-card.tsx`

```ts
export interface BulletinCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  preview?: React.ReactNode;
  audience?: React.ReactNode;
  meta?: React.ReactNode;
  pinned?: boolean;
  readRate?: { read: number; of: number };
}
export function BulletinCard(props: BulletinCardProps)
```

### `packages/ui/src/components/pinned-bulletin-banner.tsx`

```ts
export interface PinnedBulletinBannerProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  href: string;
  readLabel?: string;      // default "Read"
  onDismiss?: () => void;  // omit → server-safe, no button
}
export function PinnedBulletinBanner(props: PinnedBulletinBannerProps)
```

### `packages/ui/src/components/markdown-editor/*`

```ts
// extensions.ts
export const markdownExtensions: Extensions

// markdown-editor.tsx
export interface MarkdownEditorProps {
  value?: string;                          // markdown
  onChange?: (markdown: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;                      // default "Bulletin body"
}
export function MarkdownEditor(props: MarkdownEditorProps)

// markdown-view.tsx
export interface MarkdownViewProps { value: string; className?: string }
export function MarkdownView({ value, className }: MarkdownViewProps)

// markdown.ts
export function roundTripMarkdown(markdown: string): string
```

### `packages/ui/src/components/audience-select.tsx`

```ts
export interface AudienceOption { value: string; label: string }
export interface AudienceSelectProps {
  options: readonly AudienceOption[];
  value?: string;
  onValueChange?: (value: string) => void;
  resolvedCount?: number | null;   // null/undefined → line hidden
  countNoun?: string;              // default "burners"
  placeholder?: string;            // default "Choose an audience"
  disabled?: boolean;
  id?: string;
  className?: string;
}
export function AudienceSelect(props: AudienceSelectProps)
```

Count-line copy (`audience-select.tsx:41-45`), digit-exact:

```ts
function resolveLine(count: number, noun: string): string {
  if (count === 0) return `Resolves to no ${noun} yet`;
  if (count === 1) return `Resolves to ~1 ${noun.replace(/s$/, "")}`;
  return `Resolves to ~${count} ${noun}`;
}
```

### `packages/ui/src/components/notification-item.tsx`

```ts
export type NotificationKind =
  | "registration" | "wrangler" | "role" | "questionnaire"
  | "supplier" | "security" | "bulletin";
export const NOTIFICATION_KIND_ICON: Record<NotificationKind, LucideIcon>
export interface NotificationItemProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  kind: NotificationKind;
  title: React.ReactNode;
  body?: React.ReactNode;
  meta?: React.ReactNode;
  timeAgo?: string;
  source?: string;
  read?: boolean;
  blocking?: boolean;
}
export function NotificationItem(props: NotificationItemProps)
```

### `packages/core/src/notifications.ts`

```ts
export function bulletinNotification(input: {
  bulletinTitle: string; bulletinId: string;
}): NotificationPayload

export type NotificationOrigin = "org" | "camp" | "system";
export type NotificationApp = "web" | "org" | "suppliers";

export interface NotificationRow extends NotificationPayload {
  userId: string;
  bulletinId?: string | null;
  origin?: NotificationOrigin | null;
  linkApp?: NotificationApp | null;
}

export function resolveNotificationLinkApp(
  linkApp: NotificationApp | null | undefined,
  writingApp: NotificationApp,
): NotificationApp | null

export function notificationLinkIsLocal(
  linkApp: string | null | undefined,
  thisApp: NotificationApp,
): boolean

export function resolveBulletinAudience(
  spec: AudienceSpec, ctx: AudienceContext,
): string[]

export function buildBulletinNotifications(
  input: { bulletinId: string; title: string },
  userIds: readonly string[],
): NotificationRow[]

export function shouldSendImmediateEmail(
  kind: NotificationKind, opts?: { blocking?: boolean },
): boolean

export function notificationMentionsAny(
  payload: NotificationPayload, needles: readonly string[],
): boolean

export function isUnread(n: { readAt: Date | null }): boolean
export function countUnread(notifications: readonly { readAt: Date | null }[]): number

export interface DayGroup<T> { key: string; label: string; items: T[] }
export function groupNotificationsByDay<T extends { createdAt: Date }>(
  items: readonly T[], now: Date = new Date(),
): DayGroup<T>[]
```

### `packages/core/src/audience.ts`

```ts
export interface AudienceContext {
  editionId: string;
  orgGroupId: string;
  memberships: readonly AudienceMembership[];
  groups: readonly AudienceGroup[];
  registrations: readonly AudienceRegistration[];
  bios: readonly AudienceBio[];
  roleAssignments: readonly AudienceRoleAssignment[];
  projectRoles?: readonly AudienceProjectRole[];
  suppliers?: readonly AudienceSupplier[];
}
export function resolveAudience(spec: AudienceSpec, ctx: AudienceContext): string[]
```

### `apps/org/lib/bulletins.ts`

```ts
export interface BulletinSummary {
  id: string; title: string; bodyMd: string;
  audience: AudienceSpec; audienceLabel: string;
  pinned: boolean;
  publishedAt: Date | null; createdAt: Date; updatedAt: Date;
  readCount: number; sentCount: number;
}
export async function listBulletins(): Promise<BulletinSummary[]>
export async function getBulletin(id: string): Promise<BulletinSummary | null>
```

### `apps/org/lib/actions/bulletins.ts`

```ts
export type SaveBulletinResult = { ok: true; id: string } | { ok: false; error: string };
export async function saveBulletin(raw: z.input<typeof SaveInput>): Promise<SaveBulletinResult>
export async function publishBulletin(raw: { id: string }): Promise<ActionResult>
export async function setBulletinPinned(raw: { id: string; pinned: boolean }): Promise<ActionResult>
```
where `SaveInput = BulletinComposeInput.extend({ id: z.string().uuid().optional() })`
(`:66-68`) and `ActionResult = { ok: true } | { ok: false; error: string }`
(`apps/org/lib/actions/result.ts:4`).

### `apps/org/components/bulletins/*`

```ts
// audience-count.ts ("use server")
export type BulletinAudienceCountResult =
  { ok: true; count: number } | { ok: false; error: string };
export async function previewBulletinAudienceCount(
  raw: { audience: AudienceSpec; editionId: string },
): Promise<BulletinAudienceCountResult>

// audience-options.ts
export interface BulletinAudienceOption { value: string; label: string }
export const BULLETIN_AUDIENCE_OPTIONS: readonly BulletinAudienceOption[]
export function audienceSpecForOption(value: string): AudienceSpec | null
export function optionForAudienceSpec(spec: AudienceSpec | null | undefined): string | undefined
export function audienceCountNoun(value: string | undefined): string

// preview-text.ts
export function plainPreview(markdown: string, max = 220): string
```

### `apps/web/lib/bulletins.ts` / `apps/suppliers/lib/notifications.ts`

```ts
export interface ParticipantBulletin {
  id: string; title: string; bodyMd: string;
  pinned: boolean; publishedAt: Date | null;
}
export async function getBulletinForCurrentUser(id: string): Promise<ParticipantBulletin | null>
export async function getPinnedBulletinsForCurrentUser(): Promise<ParticipantBulletin[]>

export interface SupplierBulletin { /* identical shape */ }
export async function getBulletinForSupplier(
  userId: string, bulletinId: string,
): Promise<SupplierBulletin | null>
```

---

## 6. UX behaviours

### Org list (`/bulletins`)

- Page heading: eyebrow `Console / Bulletins`, title `Bulletins`, description
  *"Broadcasts to an audience — informational only. Anything that needs an answer is a
  questionnaire."* (`page.tsx:30-33`).
- Split into two `<section>`s with mono uppercase `tracking-[0.2em]` headings: **Sent** then
  **Drafts** (`:61-63`, `:72-74`). Sections are omitted when empty.
- Every row is a whole-card `<Link>` to `/bulletins/<id>/edit`, focus-ring on the wrapper (`:90-93`).
- Sent rows get the read-rate bar; drafts get `readRate={undefined}` and `opacity-70` (`:104-113`).
- Empty state: Megaphone icon, *"No bulletins yet"*, *"Write one when there is something every
  camp lead (or every burner) needs to know. Keep it to what they can act on."* + a
  `New bulletin` CTA (`:43-56`).

### Compose / edit (`/bulletins/new`, `/bulletins/[id]/edit`)

Two-column at `lg` (form left, preview aside `lg:w-80`), stacked below (`bulletin-composer.tsx:171`).

- **Title** — `Field` labelled required, help *"Keep it short — this becomes the notification
  headline."*, `maxLength={200}`, placeholder *"e.g. Ticket resale window opens 1 March"*.
- **Body** — `MarkdownEditor`, help *"Markdown supported — bold, italic, links, lists."*
- **Audience** — `AudienceSelect`, help *"Resolved live by the same rules questionnaires use."*,
  the resolver error surfaces as the Field's `error`.
- **Pin** — a bordered `bg-muted/30` block, switch on the right, copy: *"Pinned bulletins sit in
  a banner at the top of a recipient's camp dashboard until you unpin them here — readers cannot
  dismiss it. Suppliers and org staff get no banner; the pin just shows on their copy of the
  bulletin."*
- **Callout** — accent-bordered Info block: *"Bulletins are informational only — if you need
  answers or data, send a questionnaire instead."*
- **Footer bar** — left: state-dependent sentence. Published: *"Already published — edits correct
  the copy; recipients are not notified again."* Draft: *"Publishing resolves the audience now
  and notifies everyone it matches for `<editionName>`."* Right: `Save draft`/`Save changes`
  (outline) and, **only when not published**, `Publish bulletin` (disabled without an audience;
  label becomes `Working…` while pending).
- **Aside** — mono label *"Preview — how recipients see it"*, then a `NotificationItem`
  (`kind="bulletin"`, `timeAgo="Just now"`, `source="AfrikaBurn"`) inside a `Card` with `p-1`,
  then a `BulletinCard` with `meta="From AfrikaBurn · Just now"`, then a Megaphone line
  *"Recipients read it in their inbox and on the bulletin page."*
- Preview title falls back to **"Untitled bulletin"**; preview body falls back to
  *"Your bulletin body appears here."* Compose preview truncates at **180** chars
  (`plainPreview(bodyMd, 180)`, `:168`); the list uses the default **220**.
- **Toasts**: no audience → `toast.error("Pick an audience", { description: "A bulletin has to
  know who it is going to." })`. Zod failure → `toast.error("Check the bulletin", { description:
  <first issue message> })`. Success → `"Bulletin published."` with description
  `Sent to <audienceLabel.toLowerCase()>.`, or `"Bulletin saved."` (editing) / `"Draft saved."`
  (new). Then `router.push("/bulletins")` + `router.refresh()`.
- No active edition → the composer is replaced by a card: *"No active edition is seeded yet — a
  bulletin can only be broadcast against an active edition."* (`new/page.tsx:28-34`).

### Participant bulletin page (`/bulletins/[id]`)

`ArrowLeft` "Back to notifications" → kicker `Bulletin · From AfrikaBurn` (11 px bold uppercase
`tracking-[0.18em]` accent) → `text-3xl font-extrabold` title → meta row
`Published 12 Feb 2027 · [audience badge] · 📌 Pinned` → `<hr>` → `MarkdownView`.
Container `max-w-3xl`. `dynamic = "force-dynamic"`.

The audience chip maps `org_outbound`→joined selector labels, `org_officer`→joined officer
labels, `project`→**"Your camp"**, `org_suppliers`→"Suppliers", `org_internal`→`null`
(`page.tsx:35-55`).

### Inbox row behaviour

Clicking a row optimistically clears the unread dot, calls `markNotificationRead` (own rows
only — the WHERE pins `user_id`), then `router.push(link)` or `router.refresh()`. A row that is
already read and has no link renders as an inert div rather than a button
(`notification-row.tsx:46`).

---

## 7. Validation + edge-case rules (digit-exact)

| Rule | Value / behaviour | Cite |
|---|---|---|
| Title length | trimmed, `min(1)`, `max(200)` | `types/notifications.ts:48` |
| Body length | trimmed, `min(1)`, `max(20000)` | `types/notifications.ts:49` |
| `pinned` default | `false` | `:51` |
| `publish` default | `false` | `:52` |
| `id` on save | `z.string().uuid().optional()` | `actions/bulletins.ts:67` |
| Publish input | `z.object({ id: z.string().uuid() })` | `:288` |
| Pin input | `z.object({ id: z.string().uuid(), pinned: z.boolean() })` | `:359` |
| Preview input | `{ audience: AudienceSpec, editionId: z.string().uuid() }` | `audience-count.ts:34-37` |
| Route param | `z.string().uuid()` → `notFound()` on failure, **never** a query | `web .../[id]/page.tsx:28, :84-85` |
| Inbox `?filter=` | unknown value falls back to `"all"` rather than throwing | `notifications/page.tsx:66-70` |
| Which capability | `create` if raw `id` is a string, else `update` — read **before** the parse, safe because `SaveInput` rejects a non-uuid id | `actions/bulletins.ts:117-128` |
| Audience-change detection | order-insensitive sort+join per kind | `audienceKey`, `:76-88` |
| Frozen-field refusal | thrown, not silently dropped | `:166-172` |
| Re-publish | refused: `"That bulletin is already published."` | `:317-319` |
| Missing row | `"That bulletin no longer exists."` | `:160`, `:316` |
| No active edition | `"No active edition to attach the bulletin to."` | `:133-134` |
| Camp-scoped audience | `"Bulletins broadcast to org audiences, not a single camp."` | `:45`, `audience-count.ts:76-78` |
| Engineer refusal | `` `${ORG_RANK_LABELS.engineer} accounts don't broadcast to burners in AfrikaBurn's name — ask org staff to send it.` `` | `:62` |
| Generic refusal | `"You are not allowed to broadcast to that audience."` | `:63` |
| `readRate` clamp | `total = max(0, floor(of))`; `opened = min(max(0, floor(read)), total)`; `percent = total===0 ? 0 : round(opened/total*100)` | `lib/bulletin.ts:20-22` |
| `readRate(1,3).percent` | `33` (round, not floor) | test `tier2-3.test.tsx:62` |
| `readRate(50,30)` | `{read:30, of:30, percent:100}` | test `:70` |
| `readRate(-5,30).read` | `0` | test `:71` |
| No tally | `{ sent: 0, read: 0 }` | `apps/org/lib/bulletins.ts:38` |
| `plainPreview` default max | `220`; compose preview passes `180` | `preview-text.ts:20`, `composer:168` |
| Truncation | `text.slice(0, max).trimEnd() + "…"` | `preview-text.ts:26` |
| Notification insert chunk | **1000** rows/statement (8 bound columns → ceiling at 8191) | `apps/web/lib/notifications.ts:124-126` |
| Inbox list cap | `.limit(200)` | `apps/web/lib/notifications.ts:77` |
| Header panel | `.limit(6)` default | `:98` |
| Bell badge cap | `max = 99` → `"99+"` | `notification-bell.tsx:20-22` |
| Audience debounce | `300` ms `setTimeout`, cancelled on unmount/change | `composer:98-113` |
| Heading levels | `[2, 3]` only | `extensions.ts:20` |
| Link protocols | `["http", "https", "mailto"]` | `extensions.ts:24` |
| Raw HTML in markdown | `html: false` → rendered as **text** | `extensions.ts:29` |
| `linkify` / `breaks` | `true` / `false` | `extensions.ts:30-31` |
| `env`-less reads | `listBulletins() → []`, `getBulletin() → null`, and **zero DB calls** | `apps/org/lib/bulletins.ts:62`, `:100`; test `:449-454` |
| Signed-out reads | `getBulletinForCurrentUser → null`, `getPinnedBulletinsForCurrentUser → []` | `apps/web/lib/bulletins.ts:30`, `:69`; test `:258-268` |
| Pinned list filter | published-only, filtered **in JS after the query** (`rows.filter(b => b.publishedAt !== null)`) — a latent partial-index opportunity | `apps/web/lib/bulletins.ts:92` |
| Audience resolution output | de-duplicated **and sorted** (`[...new Set(ids)].sort()`) | `core/audience.ts:99-101` |
| Empty audience | `[]` — valid, not an error | `core/audience.ts:274-278` |

### Edge cases the donor explicitly handles that Camp 404 has no equivalent for

- **Multi-selector audience on edit.** `optionForAudienceSpec` returns `undefined` for a spec
  with >1 selector, "leaving the picker empty rather than silently narrowing it"
  (`audience-options.ts:66-84`).
- **Draft with notification rows from a previous cycle** — `publishedAt === null` still 404s the
  read page (`suppliers .test.ts:210-216`).
- **A bulletin whose author account was deleted** — `created_by_user_id` is
  `ON DELETE set null`, so the row survives (`schema.ts:1760-1762`).
- **A bulletin whose edition is deleted** — `ON DELETE cascade`, and `notifications.bulletin_id`
  cascades in turn (`schema.ts:1752-1754`, `:1877-1879`).

---

## 8. Test coverage

**Unit — `apps/org/lib/__tests__/bulletin-actions.test.ts` (501 lines, 20 tests, `fakeDb` harness):**

`saveBulletin` (9): camp-scoped refusal + no insert · engineer refusal wording · `create` vs
`update` capability per path (asserts `toHaveBeenLastCalledWith({capability, domain:"bulletins"})`)
· no active edition · row gone · **title/audience freeze** (asserts *zero* updates recorded) ·
body-correction-after-publish (asserts `values.publishedAt` and `values.title` are `undefined`,
zero notification inserts, audit `bulletin.update`) · reordered selectors are not a change ·
draft creates without notifying (audit `bulletin.create`) · publish-on-create fans out one row
per recipient with `linkApp === null` and audit `bulletin.publish`.

`publishBulletin` (5): row gone · **second publish refused, zero notifications** · **re-checks
the broadcast right at publish** (engineer → zero updates, zero notifications) · stored
camp-scoped audience refused · happy path stamps a `Date`, inserts 1 notification, audits with
`subject`.

`setBulletinPinned` (2): refused without `update` on `bulletins` · toggles + audits
`meta: { pinned: true }`.

Read models (4): env-less returns `[]`/`null` with `db.calls === []` · read rate off the
notification fan-out (`sentCount: 40, readCount: 12`, `audienceLabel: "Org members (internal)"`)
· zero tally for an unreceived bulletin · null for a missing id **and no notifications aggregate
was even attempted** · one-bulletin tally uses no `groupBy`.

**UI — `packages/ui/src/components/__tests__/markdown-editor.test.tsx` (244 lines):**
`aria-multiline`/`aria-label`/`contenteditable` · default label "Bulletin body" · seeded markdown
becomes real `h2`/`ul li` structure · all 6 toolbar buttons named · `aria-pressed` reflects the
caret · **emits `## …` not `<h2>`** · link prompt cancel/empty semantics · external reset does
not emit · `MarkdownView` has no textbox and no `contenteditable=true` · re-renders on value
change · **XSS: `<img src=x onerror=...>` is text, `querySelector("img")` is null**.

It also carries two honest annotations worth stealing as practice: a 15-line jsdom
`getClientRects` shim with the reason (`:18-49`), and a **declared known gap** at `:125-132` —
the toolbar does not repaint on transaction because `shouldRerenderOnTransaction` is not passed
to `useEditor`, so the test asserts mount-time truth only rather than pinning the defect.

**UI — `tier2-3.test.tsx`:** `readRate` maths (4 cases), the `BulletinCard` bar with a
`progressbar` role and `aria-valuenow === "40"`, `PinnedBulletinBanner` link href + **no dismiss
button by default**, and markdown round-trip preservation of bold/italic/heading/lists.

**Core — `packages/core/src/__tests__/notifications.test.ts` (373 lines):**
`resolveBulletinAudience === resolveAudience` (proves the "one resolver, two consumers" claim) ·
exactly one row per recipient, all with `kind:"bulletin"`, `bulletinId`, `link:"/bulletins/b-1"` ·
empty audiences → `[]` · **org-internal isolation** (`["god","orgMember","staff"].sort()`, and
explicitly `not.toContain("campRegLead")`) · **privacy**: no builder emits a hard-locked value,
plus a non-vacuous positive control · bulletins never get immediate email · the whole
`linkApp` rule set including *"a bulletin's null survives all the way to the reader's inbox"*.

**App reads:** `apps/web/lib/__tests__/notifications-inbox.test.ts` (bulletin authz, unpublished
filtering, signed-out/env-less); `apps/suppliers/lib/__tests__/notifications.test.ts:180-224`
(authz scoped to **both** user and bulletin with exact bound params `[USER, "b-1", 1]`, and the
bulletin row not read at all when authz fails).

**E2E (2 specs, ~219 lines, desktop-only, skip without `E2E_GOD_EMAIL`):**
`bulletins-targeting.spec.ts` — compose with real markdown typing into the
`getByRole("textbox", { name: /bulletin body/i })` region, pick "Theme camp leads", publish,
assert the targeted burner receives it *and can read the body*, assert the non-targeted burner
has it in neither the default nor the `?filter=bulletins` view.
`bulletins-audience-reach.spec.ts` — its 27-line header is a small essay on why the first spec
is insufficient ("that is one selector out of eleven, and it is the FRIENDLIEST one — a resolver
that simply returned 'every burner with a bio' would pass it"). It adds (1) artwork-leads with a
**theme-camp lead as the control**, and (2) suppliers, published on `:3001` and read on `:3002` —
the only cross-app assertion in the suite. `test.setTimeout(240_000)`.

**Not covered anywhere:** setting a link over a selection (needs real layout — explicitly ceded
to e2e at `markdown-editor.test.tsx:183-186`); the pin's effect on the camp-dashboard banner;
`plainPreview`; `audience-options.ts`; `previewBulletinAudienceCount`.

---

## 9. Dependency footprint

### New runtime packages Camp 404 would have to install

| Package | Donor version | Needed by |
|---|---|---|
| `@tiptap/core` | `^3.29.0` | `extensions.ts`, `markdown.ts` |
| `@tiptap/pm` | `^3.29.0` | peer (ProseMirror) |
| `@tiptap/react` | `^3.29.0` | `markdown-editor.tsx`, `markdown-view.tsx` |
| `@tiptap/starter-kit` | `^3.29.0` | `extensions.ts` |
| `tiptap-markdown` | `^0.9.0` | `extensions.ts`, markdown in/out |

All five are declared in `packages/ui/package.json:31-34, :45`. **Camp 404 has none of them.**

### Already present in Camp 404 (no action)

`lucide-react` (icons `Megaphone`, `Pin`, `X`, `Bell`, `Users`, `Info`, `Save`, `Send`, `Bold`,
`Italic`, `Heading2`, `Link`, `List`, `ListOrdered`, `ClipboardList`, `Compass`, `Package`,
`PartyPopper`, `ShieldAlert`, `UserCheck`, `ArrowLeft`, `Inbox`, `BellOff`, `Plus`, `Loader2`) ·
`zod` · `drizzle-orm` · `class-variance-authority` / `clsx` / `tailwind-merge` via `cn()` ·
`@radix-ui/react-select` (behind the donor's `Select`) · `@radix-ui/react-tabs` — **not** in
Camp 404, needed only if the `filter-tabs` pattern comes too.

### Camp 404 dependency notes

- `react-markdown ^10.1.0` + `rehype-sanitize ^6.0.0` are declared in `apps/web/package.json`
  and imported by **nothing**. A Tiptap port would make them permanently dead; a
  react-markdown-based alternative would revive them without any new dependency. The donor's own
  `docs/component-spec.md:50` names react-markdown as the intended renderer, but **there is not
  one `react-markdown` import anywhere in the donor tree** — the renderer is Tiptap's
  `markdown-view.tsx`. That doc line is stale.
- The donor's `Switch` in the pin control uses `checked`/`onCheckedChange`/`disabled`/`aria-label`
  — API-compatible with Camp 404's Radix switch. No adaptation needed for this call site.
- `EmptyState` differs: donor takes `action?: React.ReactNode`, Camp 404 takes `children`. The
  org list uses `action` (`page.tsx:48`).
- `Field` (donor-only, `packages/ui/src/components/field.tsx`) wraps label/help/required/error —
  it is a near drop-in and the composer depends on it for three fields.
- `Skeleton`/`SkeletonRegion`/`SkeletonCard` (donor-only) back both `loading.tsx` files.

### Internal coupling of the UI components (the portability signal)

`bulletin-card.tsx` imports only `./card`, `./badge`, `../lib/utils`, `../lib/bulletin`,
`lucide-react`, `react`. `pinned-bulletin-banner.tsx` imports only `lucide-react`, `react`,
`../lib/utils`. `audience-select.tsx` imports only `./select`, `../lib/utils`. **None of them
import `@quagga/types`, `@quagga/core`, or anything tenant-shaped.** A repo-wide grep for
`groupId|orgId|tenant|editionId` across `packages/ui/src` returns zero hits.

---

## 10. AfrikaBurn / multi-tenant coupling

Ranked from "no coupling" to "rewrite".

### Zero coupling — lift verbatim after the `@quagga/` → `@camp404/` sed

- `packages/ui/src/lib/bulletin.ts` (24 lines, pure maths)
- `packages/ui/src/components/bulletin-card.tsx`
- `packages/ui/src/components/pinned-bulletin-banner.tsx`
- `packages/ui/src/components/audience-select.tsx`
- `packages/ui/src/components/markdown-editor/**` (4 files)
- `packages/ui/src/components/notification-bell.tsx`
- `apps/org/components/bulletins/preview-text.ts` (27 lines, pure regex)

The only brand string in the whole `packages/ui` bulletin set is the kicker word `"Bulletin"` in
`bulletin-card.tsx:53` and the default `ariaLabel = "Bulletin body"` in
`markdown-editor.tsx:140` — both plain props/defaults, both a one-word rename.

### Light coupling — a rename, not a rewrite

- **`notification-item.tsx`.** Its `NotificationKind` union is the donor's 7 kinds. Camp 404 has
  `broadcast_kind` `[announcement, team_message, lead_directive, reminder, system]`. The
  component is a `Record<Kind, LucideIcon>` lookup + a `blocking` accent flag — swap the union
  and the map, keep everything else. The `blocking && kind === "questionnaire"` special-case
  (`:87`) maps cleanly onto Camp 404's `presentation === "acknowledge"`.
- **`plainPreview`**, `readRate`, `roundTripMarkdown` — no coupling at all.
- **`bulletins` table.** Drop `edition_id` (Camp 404 has no editions dimension); either drop
  `audience` jsonb entirely in favour of Camp 404's existing `broadcasts.scope`/`team`, or keep a
  narrowed jsonb. **Everything else transfers 1:1**: `title`, `body_md`, `published_at` (null =
  draft), `pinned`, `created_by_user_id ON DELETE set null`, `created_at`, `updated_at`, and
  the two indexes.

### Heavy coupling — port the *shape*, not the code

- **`AudienceSpec` and `resolveAudience`.** Every donor selector is a statement about
  `groups`/`group_kind`/`registrations`/`editions`/`suppliers` — dimensions Camp 404 does not
  have. `resolveOutboundSelector` (`core/audience.ts:160-191`) is seven `case`s over
  `theme_camp`/`mutant_vehicle`/`artwork`. `resolveOfficerAudience` walks `project_roles` +
  consent. `org_suppliers` reads `suppliers.user_id`. **Camp 404's equivalent already exists** —
  `resolveAudience` in `packages/db/src/broadcasts.ts:52` over `broadcast_scope`
  `[everyone, team, team_leads, drivers, individual]`. Port the *pattern* (pure function over
  injected row sets, de-duplicated + sorted output, empty is valid) and the *option-value ⇄ spec
  mapping* from `audience-options.ts`, then point `AudienceSelect` at Camp 404's five scopes.
  This directly addresses **WP12 #136** ("no writer for any non-`everyone` broadcast scope").
- **`apps/org/lib/actions/bulletins.ts`.** The *logic* — capability-per-path, freeze on publish,
  `audienceKey`, `FOR UPDATE`, publish-time re-authorisation, atomic write+fanout+audit — is
  entirely portable. The *authz calls* are not: `requireOrgSession({capability, domain})`
  resolves through `org_departments` / `org_roles` / `orgCanInDomain` / the 8-key hardcoded
  domain list, which exists **only because reviewers are a different organisation from the
  people being reviewed**. In Camp 404 that whole second permission system collapses to
  `requireCaptain()` (already written, `apps/web/app/captains/announcements/actions.ts:23-39`).
  The two-gate *idea* still transfers usefully though: gate 1 = "may you touch this screen"
  (captain), gate 2 = "may you broadcast to THIS audience" (e.g. a team lead may broadcast to
  their own team but not camp-wide) — which is exactly the WP12 "team-lead post to your crew"
  gap.
- **`apps/org/lib/bulletins.ts`.** The SQL tally shape is portable verbatim; only the table
  names change (`notifications` → `notification_deliveries`, `read_at` → `read_at`, and Camp 404
  additionally has `acknowledged_at`).

### Do not port

- **`origin` / `link_app` on `notifications`.** Both columns exist *solely* because the donor is
  three apps over one table. Camp 404 is one app; every link resolves locally, and
  `resolveNotificationLinkApp` / `notificationLinkIsLocal` are answers to a question Camp 404
  does not have. (The *pattern* — "`undefined` means unspecified, `null` means deliberately
  none, and `??` cannot tell them apart" — is a genuinely good general lesson, recorded at
  `core/notifications.ts:241-258`.)
- **`apps/suppliers/**` bulletin surfaces.** Camp 404 has no supplier population. Note the
  supplier page is a near-verbatim fork of the web page (91 vs 143 lines, same
  `formatPublished`, same `BulletinId` Zod, same layout) — the donor's own
  `docs/simplification-audit.md:58-60` warns that any component lifted from an app directory
  should be assumed to have a near-twin, one of which is already behind. Here the twins have
  already drifted: the web page renders a computed audience chip, the supplier page hardcodes
  `<Badge variant="outline">Suppliers</Badge>` (`suppliers .../page.tsx:73`).
- **`edition_id`.** Camp 404's `camp_settings` is a physically-enforced singleton
  (`packages/db/src/schema.ts:1422-1447`); there is no per-year namespace to key on.
- **The `.light` / `.org-accent` theme branches** any lifted component's classes assume — Camp
  404 is dark-only. The bulletin components use only semantic tokens
  (`bg-primary`, `bg-muted`, `text-muted-foreground`, `border-input`, `bg-primary/10`,
  `border-primary/30`, `ring-ring`, `ring-offset-background`) and **every one of those exists in
  Camp 404's `@theme`** — so they compile unchanged and simply re-skin to magenta/violet. There
  is **not one `ab-*` brand class** in any bulletin file (verified).

---

## 11. Verbatim excerpts of the most valuable pieces

### 11.1 The freeze — `apps/org/lib/actions/bulletins.ts:90-101, :142-215`

```ts
/**
 * WHAT A PUBLISHED BULLETIN WILL NOT LET YOU CHANGE, said to the author.
 *
 * Ryan, 28 Jul 2026: title and audience are frozen after publish, the body
 * stays editable, and an edit sends nothing new. The reason is that the fan-out
 * already happened: every recipient's notification row carries the title as it
 * was sent, and the audience that resolved to those rows cannot be re-aimed
 * after the fact. Rewriting either left the console's own "sent to N people"
 * detail describing a broadcast that never took place.
 */
const PUBLISHED_FROZEN_MESSAGE =
  "This bulletin has already gone out. Its title and audience are fixed — recipients' notifications carry the title it was sent with, and a broadcast cannot be re-aimed afterwards. Correct the body here, or send a new bulletin.";
```

```ts
    if (input.id) {
      await withTransaction(async (tx) => {
        // `for update` LOCKS the row for the rest of the transaction. Without
        // it the already-published guard below is a plain read that two
        // concurrent publishes both pass, and the whole audience receives the
        // same bulletin twice. The lock makes "is it published?" and "stamp it
        // and fan out" one indivisible step.
        const [existing] = await tx
          .select({
            id: schema.bulletins.id,
            title: schema.bulletins.title,
            audience: schema.bulletins.audience,
            publishedAt: schema.bulletins.publishedAt,
          })
          .from(schema.bulletins)
          .where(eq(schema.bulletins.id, input.id!))
          .limit(1)
          .for("update");
        if (!existing) throw new Error("That bulletin no longer exists.");
        const alreadyPublished = existing.publishedAt !== null;

        // Refuse the frozen edits rather than dropping them silently: the
        // composer posts the whole form back, so a discarded title change would
        // toast "Bulletin saved." over a title that did not move.
        if (
          alreadyPublished &&
          (input.title !== existing.title ||
            audienceKey(input.audience) !== audienceKey(existing.audience))
        ) {
          throw new Error(PUBLISHED_FROZEN_MESSAGE);
        }

        await tx
          .update(schema.bulletins)
          .set({
            // Title and audience are only the author's to set while the
            // bulletin is still a draft. Once it has gone out they are the
            // record of WHAT WAS SENT, so a published row keeps its own.
            ...(alreadyPublished
              ? {}
              : { title: input.title, audience: input.audience }),
            bodyMd: input.bodyMd,
            pinned: input.pinned,
            // Publishing a draft stamps published_at; never un-publish or restamp.
            ...(input.publish && !alreadyPublished ? { publishedAt: now } : {}),
            updatedAt: now,
          })
          .where(eq(schema.bulletins.id, input.id!));
```

### 11.2 The audience key — `apps/org/lib/actions/bulletins.ts:70-88`

```ts
/**
 * A comparable key for an audience spec, so "is this the same audience?" is one
 * answer rather than a structural walk at each call site. Order-insensitive on
 * the selector arrays: `["a","b"]` and `["b","a"]` reach exactly the same people
 * and must not read as a change.
 */
function audienceKey(spec: AudienceSpec): string {
  switch (spec.kind) {
    case "org_outbound":
      return `org_outbound:${[...spec.selectors].sort().join(",")}`;
    case "org_officer":
      return `org_officer:${[...spec.officerKeys].sort().join(",")}`;
    case "project":
      return `project:${spec.groupId}:${spec.mode}:${[...spec.roleIds].sort().join(",")}`;
    case "org_internal":
    case "org_suppliers":
      return spec.kind;
  }
}
```

### 11.3 Publish-time re-authorisation + the race comment — `apps/org/lib/actions/bulletins.ts:300-336`

```ts
    // Guard read, publish stamp, fan-out and audit are one atomic unit.
    await withTransaction(async (tx) => {
      // `for update` is what makes the already-published guard below actually
      // hold. A transaction is not on its own a lock: two publishes racing the
      // same draft (a double-clicked button, two staff on the same row) both
      // read `published_at IS NULL`, both passed, and both fanned out — the
      // whole audience got the notice twice, and nothing in the console said
      // why. The lock serialises them, so the second one finds the row
      // published and is refused.
      const [bulletin] = await tx
        .select()
        .from(schema.bulletins)
        .where(eq(schema.bulletins.id, input.id))
        .limit(1)
        .for("update");
      if (!bulletin) throw new Error("That bulletin no longer exists.");
      if (bulletin.publishedAt !== null) {
        throw new Error("That bulletin is already published.");
      }
      // Re-check the stored audience is one this actor may broadcast to.
      if (
        bulletin.audience.kind === "project" ||
        !canActivateAudience(
          authzMemberships(session),
          bulletin.audience,
          session.orgGroupId,
        )
      ) {
        throw new Error(broadcastRefusal(session));
      }
```

### 11.4 The read-rate tallies — `apps/org/lib/bulletins.ts:70-123`

```ts
  // Per-bulletin read/sent tallies from the notifications fan-out. One grouped
  // aggregate for the whole page, which is the right shape HERE — the list
  // renders every bulletin, so every group is used.
  const tallies = await db
    .select({
      bulletinId: schema.notifications.bulletinId,
      sent: sql<number>`count(*)::int`,
      read: sql<number>`count(*) filter (where ${schema.notifications.readAt} is not null)::int`,
    })
    .from(schema.notifications)
    .where(eq(schema.notifications.kind, "bulletin"))
    .groupBy(schema.notifications.bulletinId);
```

```ts
/**
 * A single bulletin for the compose/edit + read-rate detail.
 *
 * Its own two queries rather than a filter over `listBulletins()`. That is what
 * it used to be, and it meant opening ONE bulletin fetched every bulletin row
 * in the deployment — bodies included, which are up to 20 000 characters each —
 * and then aggregated every bulletin notification ever sent, to read a single
 * row and a single pair of counts out of the result. The cost grew with the
 * whole broadcast history for a page that shows one notice.
 */
```

### 11.5 The markdown sanitiser — `packages/ui/src/components/markdown-editor/extensions.ts` (whole file, 35 lines)

```ts
import { StarterKit } from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import type { Extensions } from "@tiptap/core";

// Shared Tiptap extension set for the bulletin-compose editor and the read-only
// MarkdownView. Vendored ("Markdown
// editor decision": minimal-tiptap-style, tiptap-markdown for markdown in/out,
// React 19-compatible). Kept deliberately minimal to the bulletin needs:
// headings, bold, italic, links, bullet/ordered lists (StarterKit bundles all
// of these in v3).
//
// Safety: `html: false` makes tiptap-markdown treat raw HTML in the markdown as
// plain text rather than parsing it, and the ProseMirror schema below is the
// sanitiser — generated HTML can only contain nodes/marks this schema defines,
// so there is no path for arbitrary/script HTML to render. Links are restricted
// to safe protocols.

export const markdownExtensions: Extensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    link: {
      openOnClick: false,
      autolink: true,
      protocols: ["http", "https", "mailto"],
      HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
    },
  }),
  Markdown.configure({
    html: false,
    linkify: true,
    breaks: false,
    transformPastedText: true,
    transformCopiedText: true,
  }),
];
```

### 11.6 The read-rate maths — `packages/ui/src/lib/bulletin.ts` (whole file, 24 lines)

```ts
export interface ReadRate {
  /** Recipients who have opened the bulletin (clamped to 0…of). */
  read: number;
  /** Total recipients the bulletin was sent to. */
  of: number;
  /** Integer percentage 0–100 (0 when nobody was targeted). */
  percent: number;
}

/**
 * Derive the read-rate state for a bulletin. `read` is clamped into [0, of] so
 * a stale count can never render a >100% or negative bar; a zero-recipient
 * bulletin reads as 0%.
 */
export function readRate(read: number, of: number): ReadRate {
  const total = Math.max(0, Math.floor(of));
  const opened = Math.min(Math.max(0, Math.floor(read)), total);
  const percent = total === 0 ? 0 : Math.round((opened / total) * 100);
  return { read: opened, of: total, percent };
}
```

### 11.7 The markdown preview strip — `apps/org/components/bulletins/preview-text.ts` (whole file, 27 lines)

```ts
const RULES: readonly [RegExp, string][] = [
  [/```[\s\S]*?```/g, " "],            // fenced code
  [/`([^`]*)`/g, "$1"],                // inline code
  [/!\[[^\]]*\]\([^)]*\)/g, " "],      // images
  [/\[([^\]]*)\]\([^)]*\)/g, "$1"],    // links → their text
  [/^\s{0,3}#{1,6}\s+/gm, ""],         // headings
  [/^\s{0,3}>\s?/gm, ""],              // block quotes
  [/^\s{0,3}([-*+]|\d+\.)\s+/gm, ""],  // list bullets
  [/(\*\*|__|\*|_|~~)/g, ""],          // emphasis marks
  [/\s+/g, " "],                       // collapse whitespace
];

/** Strip markdown to a single-line preview, truncated to `max` characters. */
export function plainPreview(markdown: string, max = 220): string {
  const text = RULES.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    markdown,
  ).trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}
```

### 11.8 Recipient-side read authorisation — `apps/web/lib/bulletins.ts:24-58`

```ts
/** A published bulletin the CURRENT user received, else null (404-safe). */
export async function getBulletinForCurrentUser(
  id: string,
): Promise<ParticipantBulletin | null> {
  if (!isDatabaseConfigured()) return null;
  const user = await getCurrentCampUser();
  if (!user) return null;

  // The user must have a notification for this bulletin (⇒ they were targeted).
  const [received] = await db()
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.userId, user.id),
        eq(schema.notifications.bulletinId, id),
      ),
    )
    .limit(1);
  if (!received) return null;
  /* … then select the bulletin, and: */
  if (!bulletin || bulletin.publishedAt === null) return null;
  return bulletin;
}
```

---

## 12. Gotchas, defects and honest gaps in the donor

1. **No delete, no unpublish, no recall, no publish confirmation.** Verified by
   `rg -n "deleteBulletin|unpublish"` across `apps/org` — nothing. Unpinning is the only
   "take it down" motion, and the composer's own copy admits it. **The donor does not solve
   Camp 404's WP1 #125 announcement-recall gap.**
2. **No expiry.** No `expires_at` on `bulletins`. Pinned bulletins stay pinned until an author
   unpins them; the composer copy says so ("until you unpin them here").
3. **Pinned banner is not dismissible in practice.** `PinnedBulletinBanner` renders a ✕ only
   when handed `onDismiss`, and the single call site
   (`apps/web/app/(app)/camps/[slug]/page.tsx:269-274`) does not pass it. The donor's
   simplification audit recorded a `DismissiblePinnedBulletinBanner` wrapper as dead code
   (`docs/simplification-audit.md:923`); it has since been **deleted** — the file no longer
   exists.
4. **Only ONE pinned bulletin renders**, despite `getPinnedBulletinsForCurrentUser()` returning
   a list — the camp page destructures a single `pinnedBulletin`. Multiple pins silently show one.
5. **The pinned query filters published-ness in JS after the query** (`bulletins.ts:92`), not in
   SQL — a draft that was pinned still hits the wire.
6. **Toolbar `aria-pressed` goes stale.** Documented, measured, and deliberately not asserted:
   `useEditor` in `@tiptap/react` 3.29 only re-renders per transaction with
   `shouldRerenderOnTransaction: true`, which this editor does not pass
   (`markdown-editor.test.tsx:125-132`). Typing inside bold text leaves Bold un-pressed.
   **If you port the editor, pass that option.**
7. **`window.prompt` for the link URL** (`markdown-editor.tsx:64`). Works, is testable, is not a
   design. Camp 404 would want a Dialog.
8. **`MarkdownView` is client-only** and spins up a full ProseMirror instance to render read-only
   prose. On a page whose only dynamic content is the body, that is a large client bundle for a
   static render. Camp 404's already-declared-but-unused `react-markdown` + `rehype-sanitize`
   would render this on the server for free. **Recommend: port the EDITOR from Tiptap, render
   the VIEW with react-markdown.** (`markdown.ts:4-8` explicitly warns the headless helper is
   "intentionally not for hot server-side paths".)
9. **`docs/component-spec.md:50` is stale** — it names react-markdown as the bulletin renderer,
   and there is not one react-markdown import in the donor tree.
10. **Two near-identical bulletin read pages** (web 143 lines / suppliers 91 lines) that have
    already drifted — the supplier one hardcodes its audience badge. Expect the donor's twin-file
    hazard here.
11. **`origin`/`link_app` are `text`, not enums**, so a typo is only caught by
    `notificationLinkIsLocal`'s string compare. Deliberate (staggered three-app deploy), but the
    reason does not apply to Camp 404 — use a pgEnum if you keep them at all (you should not).
12. **The email digest is a declared stub.** `apps/web/app/api/notifications/digest/route.ts`
    returns `{ok:true, status:"stub", scheduled:false}` and sends nothing. So in the donor,
    **a bulletin generates no email of any kind, ever** — in-app only.
13. **`buildAudienceContext` reads seven whole tables unfiltered** on every audience preview
    keystroke-debounce (`apps/org/lib/questionnaires/queries.ts:412-472` — `memberships` and
    `groups` and `project_roles` and `member_role_assignments` have no WHERE at all). At
    AfrikaBurn scale that is a real cost per 300 ms debounce tick. Camp 404 at 30–80 users would
    not notice, but do not copy the shape into anything larger.
14. **`previewBulletinAudienceCount` is a duplicated authz path** — it exists only because the
    composer originally reused the questionnaire flow's preview action, which gates on the
    `questionnaires` domain, so a Bulletins-department author was refused their own audience
    count in a message naming a department that owns a different screen, *while Publish stayed
    armed* (`audience-count.ts:16-32`). The lesson is portable even though the org-domain
    machinery is not: **gate the preview on the same thing you gate the write on.**
15. **`bulletins` is inert in the donor's own permission model.** `packages/core/src/org-domains.ts:34-45`
    says `bulletins` carries neither `read_personal_information` nor `delete`, so owning that
    domain "is inert". Only the `canActivateAudience` rank check does real work.
16. **`saveBulletin` returns `{ok:true, id}` while `publishBulletin`/`setBulletinPinned` return
    the bare `ActionResult`** — two result shapes in one file. Minor, but pick one when porting.

---

## 13. Recommended port plan for Camp 404 (opinionated, one paragraph per phase)

**Phase 1 — free wins, no schema change.** Lift `readRate` + `BulletinCard` + `plainPreview` +
`PinnedBulletinBanner` + `AudienceSelect` into `@camp404/ui` verbatim (sed the scope, run
`pnpm format`, add `.stories.tsx` to match house style). Add the read-rate bar to
`/captains/announcements` fed by the `acknowledgedCount`/`recipientCount` that
`listAnnouncements` **already returns** (`packages/db/src/broadcasts.ts:104-108`) — that is a
shipped read model with no UI on it today. Add the two `loading.tsx` skeletons (WP7 #131).

**Phase 2 — markdown.** Add the five Tiptap packages, port `markdown-editor/`, pass
`shouldRerenderOnTransaction: true`, replace `window.prompt` with a Dialog, and render the body
with the already-installed `react-markdown` + `rehype-sanitize` on the server rather than
Tiptap's `MarkdownView`. Widen `ComposeAnnouncementInput.body` from 5 000 to something closer to
the donor's 20 000, and keep `plainPreview` for the list rows.

**Phase 3 — the freeze + race safety.** Port `PUBLISHED_FROZEN_MESSAGE`, the `audienceKey`
order-insensitive comparison, and the publish-time re-authorisation into
`publishAnnouncement`/`updateAnnouncementDraft`. Camp 404 already has an atomic claim
(`isOwnedAnnouncementDraft` + dedupe index), so the `FOR UPDATE` lock is optional — but the
**title/scope freeze and the loud refusal are not**, and they are the single most valuable idea
in this unit.

**Phase 4 — pinning + the standalone read page.** Add `broadcasts.pinned boolean not null default false`
plus a `setPinnedAction`, render `PinnedBulletinBanner` on home (Camp 404's analogue of the camp
dashboard), and build `/announcements/[id]` with the donor's exact authorisation rule: **the
delivery row is the permission** — `notification_deliveries` where `(broadcast_id, user_id)`
matches the signed-in user, else `notFound()`. That single rule is what makes team-scoped
announcements safe the day WP6 #130 lands the `team_memberships` write path.

**Phase 5 — audience targeting (WP12 #136).** Port `audience-options.ts`'s option-value ⇄ spec
mapping and `previewBulletinAudienceCount`'s debounced live count over Camp 404's existing
five-value `broadcast_scope`, and add the donor's two-gate idea: captain-or-lead to reach the
screen, then a per-scope predicate so a team lead may broadcast to their own team and no further.
This is the writer that Camp 404's schema, `resolveAudience` and dispatch cron have been waiting
for.

**Do not port:** `edition_id`, `origin`/`link_app`, the org-domain/`requireOrgSession` layer, the
`AudienceSpec` union itself, the suppliers surfaces, or the email-digest stub.
