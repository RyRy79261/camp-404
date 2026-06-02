# Verification — 15 captains-announcements

**Verdict:** accurate  ·  checked 78 claims, verified 76.
The doc is an exceptionally faithful, digit-exact transcription of the real source: every line citation I spot-checked (page.tsx, announcements-manager.tsx, actions.ts, broadcasts.ts, audience.ts, announcement.ts, schema.ts, test-store.ts) landed on the claimed code. No high- or medium-severity defects found; the only blemishes are one soft "convention" framing and one cosmetic line-range that is one line short.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| low | "wider than the global `max-w-lg` convention" (line 24) — framed as an established convention | `max-w-lg` appears in only 3 app files, `max-w-3xl` in 2; it is not a dominant, enforced convention. The factual part (this page uses `max-w-3xl`) IS correct. | apps/web/app/captains/announcements/page.tsx:35 |
| low | "Single section card titled ... (`announcements-manager.tsx:166-183`)" — composer header range stated as 166-183 | The `<section>` opens at 166 and the header `<div>` closes at 183, but the composer fields (Title/Message/How-it-lands/error/notice/submit) run on through 273. The cited range only covers the title + Cancel-edit row, not the full "single section card". Effectively cosmetic — the title/cancel claim it backs is correct. | apps/web/app/captains/announcements/announcements-manager.tsx:166-183 |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | The published meta footer also guards the timestamp behind `a.publishedAt &&` before rendering `toLocaleString()`; doc states the timestamp unconditionally. Harmless (published rows always have `publishedAt`), but the conditional exists. | apps/web/app/captains/announcements/announcements-manager.tsx:356-358 |
| low | `dispatchDueBroadcasts` (the cron worker the doc lists as "dead/unused-here") copies `refId: b.refId ?? b.id` and `refType: b.refType ?? null` — a subtle divergence from the inline publish which hard-codes `refType:"announcement"`. Out of unit scope (unit 27) and doc correctly flags it as not exercised here. | packages/db/src/broadcasts.ts:369-370 |

## Spot-confirmed
- `export const dynamic = "force-dynamic"` (page.tsx:9); `metadata = { title: "Announcements — Camp 404" }` (page.tsx:11). Both exact.
- Gating spine in order: `getAuthenticatedUserOrRedirect()` → `ensureCampUser` → `!hasCampAccess` redirect `/signup/required` → `!isApproved` redirect `/pending-approval` → `rank !== "captain"` redirect `/` (page.tsx:20-30). Exact.
- Back link ghost Button → `/captains/tools`, "Camp tools", `ChevronLeft` (page.tsx:36-40). H1 "Announcements & notifications" and lead copy verbatim incl. "Everyone but you receives it." (page.tsx:42-49). `max-w-3xl px-6 py-10` (page.tsx:35).
- `listAnnouncements()` loaded, passes `currentUserId={campUser.id}` (page.tsx:32, 52-55).
- Composer h2 "New announcement"/"Edit draft" gated on `form.editingId` (announcements-manager.tsx:168-170). Cancel-edit ghost+`X` only while editing, `onClick={reset}` (171-182). `reset()` = `EMPTY_FORM` + clear error (94-97).
- Title `Input maxLength={120}` placeholder "Burn-night briefing" (188-197); Message `Textarea maxLength={5000} rows={6}` placeholder "What does everyone need to know?" (202-210); presentation `Select` rendering icon+label from `PRESENTATION_META`, hint line below (213-244).
- Inline error `role="alert" text-destructive` and `text-emerald-400` notice with `notice && !error` suppression (246-255). Submit "Save draft"/"Update draft", `Loader2` while pending else `Pencil` (257-271). Disabled guard `pending || !form.title.trim() || !form.body.trim()` (261).
- Drafts header `Drafts {drafts.length>0 && (count)}` (277-279), empty "No drafts." (280-281); cards with Edit(ghost,Pencil)/Delete(ghost,destructive,Trash2)/Publish to camp(primary,Send) (283-323). `drafts = filter publishedAt === null` (91).
- Published header (329-331), empty "Nothing published yet." (332-335); "Sent to {n} member(s)" singular/plural (346-347), " · by you" when `senderId === currentUserId` (348), acknowledge-only `CheckCircle2` + "{ack}/{recip} acknowledged" (350-355). `published = filter publishedAt !== null` (92).
- `AnnouncementHeader` pill short-words "Acknowledge"/"Pop-up"/"Inbox", `title={meta.hint}` (385-389, 382). Confirmed they differ from composer labels.
- `requireCaptain` error strings verbatim: "Not signed in." / "Your account isn't camp-active yet." / "Your account is still awaiting approval." / "Captain access only." returns `{ok:true, captainId}` (actions.ts:23-40).
- `saveDraftAction` (43-60), `updateDraftAction` w/ "Draft not found or already published." (63-85), `deleteDraftAction` same string (88-98), `publishAction` passes through `{ok:false}`, returns `{recipientCount}` (104-114). `ActionResult<T>` union (14-16). All revalidate `/captains/announcements`.
- `isOwnedAnnouncementDraft` = AND(id, senderId, kind='announcement', scope='everyone', publishedAt IS NULL) (broadcasts.ts:36-44). Used in update/delete/publish-claim.
- `listAnnouncements` selects kind='announcement', leftJoin users for `displayName` as `senderName`, correlated `count(*)::int` subqueries for recipient/acknowledged, `desc(createdAt)`, null-coalesced to 0 (broadcasts.ts:117-149).
- `createAnnouncementDraft` inserts kind='announcement', scope='everyone' (159-175). `publishAnnouncement` pooled-DB transaction: claim via owned-draft predicate RETURNING title/body/channel/presentation; missing → "Draft not found, already published, or not yours."; `resolveAudience({scope:'everyone', team:null})`; zero recipients → `{ok:true, recipientCount:0}`; bulk insert `.onConflictDoNothing()` with `refType:"announcement"`, `refId:broadcast.id` (228-290). `pool.end()` in finally.
- `computeAudience`: `real` set = `!isSystem && !sanitised`; everyone → `[...real]`; final `[...new Set(ids)].filter(real.has(id) && id !== senderId)` (audience.ts:34-63). Sender + system + sanitised exclusion confirmed.
- `AnnouncementPresentation` z.enum ["acknowledge","popup","feed"] (announcement.ts:8-12). `ComposeAnnouncementInput`: title `.trim().min(1,"Give it a title.").max(120)`, body `.trim().min(1,"Write the announcement.").max(5000)`, presentation `.default("acknowledge")` (23-27). Actions surface `parsed.error.issues[0]?.message ?? "Invalid."` (actions.ts:51,72).
- All five `broadcast_kind` members announcement/team_message/lead_directive/reminder/system (schema.ts:128-134). All five `broadcast_scope` (136-142). `notification_channel` push/in_app/both (144-148). `push_delivery_status` queued/sent/failed/skipped (150-155). `broadcast_presentation` acknowledge/popup/feed (166-170).
- `broadcasts.channel` default `'both'` (778); `broadcasts.presentation` AND `notification_deliveries.presentation` both default `'feed'` (783-785, 846-848); `pushStatus` default `'queued'` (849-851). Schema-default `feed` vs compose-default `acknowledge` divergence confirmed real.
- `broadcasts` table 763-807: id uuid defaultRandom pk, senderId onDelete:'set null', kind/scope notNull, team nullable, title/body notNull, channel default both, presentation default feed, refType text/refId uuid nullable, publishedAt/dispatchedAt/sendAt nullable timestamps, createdAt notNull defaultNow; indexes `broadcasts_sender_idx`, `broadcasts_created_at_idx`. Exact.
- `broadcast_targets` composite PK (broadcastId, userId) (810-823). `notification_deliveries` 830-887: broadcastId nullable onDelete cascade, userId notNull onDelete cascade, title/body/channel notNull, presentation default feed, pushStatus default queued, refType/refId/readAt/acknowledgedAt/deliveredAt, createdAt; indexes user_read/user_ack/broadcast + partial uniqueIndex `notification_deliveries_broadcast_user_uniq` on (broadcastId,userId) WHERE broadcastId IS NOT NULL. Exact.
- `acknowledgeDelivery` refuses non-acknowledge deliveries via `eq(presentation,"acknowledge")` clause (broadcasts.ts:450-453). Matches §Validation roll-up claim.
- `isApproved` returns true only for god-email or `approvalStatus === "approved"` → `rejected` resolves false, so rejected hits the pending-approval block; no separate rejected branch (lib/users.ts:231-235). Confirms States §Rejected.
- E2E test store divergences ALL confirmed: `createBroadcastDraft` stores no kind/scope (test-store.ts:362-372); update/delete/publish predicate is only `id + senderId + publishedAt === null` (381-386, 394-399, 408-413); publish audience = all `usersByAuthId.values()` except sender, no isSystem/sanitised filter (421-423); no ON CONFLICT / transaction. Facade selects via `isE2ETestMode()` (notifications.ts:117-119).
- "Dead/unused-here" inventory accurate: `dispatchDueBroadcasts`, `getPendingAcknowledgements`, `acknowledgeDelivery`, `listInbox`, `countUnread`, `markRead`, and team/team_leads/drivers/individual scope branches all exist and none is reached from this captain-composer surface (broadcasts.ts:306-529, audience.ts:43-58).
- `senderId` onDelete 'set null' → `senderName` null when sender row deleted (schema.ts:767-768; leftJoin broadcasts.ts:140) — matches Validation §Recipient senderName.

## Low-confidence / could-not-verify
- The "global `max-w-lg` convention" framing (line 24) is a design assertion, not a code fact; `max-w-lg`/`max-w-3xl` are roughly evenly used, so "convention" is editorial. The code-level claim (page uses `max-w-3xl`) is verified.
- Recipient-side rendering / push engine behavior (acknowledge gate full-screen takeover, popup dismissal, feed silent landing) is explicitly deferred to unit 27 and not present in these files — taken on the doc's own scoping, not independently verified here.
- The claim that the list `recipientCount` (live `count(*)`) and the publish-time audience size "agree ... less any ON CONFLICT skips" (line 152) is logically sound given the unique index but is a runtime invariant not directly testable from static source.
