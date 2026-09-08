# Slim ledger — all 892 assessed assets

chk: ok = adversarial verifier upheld; REFUTED = verifier disagreed (read the per-unit digest for the correction); ? = verifier did not cover this exact item

| unit | slug | asset | verdict | rec | val | eff | chk | planned |
|---|---|---|---|---|---|---|---|---|
| 01 | questionnaire-engine | Question / PageBlock / Questionnaire Zod schema (15 kinds, 2 content blocks, 2 page kinds) | PARTIAL | INSPIRE | medium | M | ok | /home/ryan/repos/Personal/camp-404/docs/questionnaire-builder.md |
| 01 | questionnaire-engine | validateOne — per-question answer validation | PARTIAL | ADAPT | high | M | ok |  |
| 01 | questionnaire-engine | TextFormat presets + checkTextFormat | MISSING | COPY | high | S | ok |  |
| 01 | questionnaire-engine | "Other…" in-band answer encoding | MISSING | COPY | high | S | ok |  |
| 01 | questionnaire-engine | validateQuestionnaireDefinition — structural integrity validator | PARTIAL | ADAPT | high | L | ok | /home/ryan/repos/Personal/camp-404/docs/questionnaire-builder.md |
| 01 | questionnaire-engine | Branch-resolving runtime (nextPageId / resolvePath / visibleQuestions) | PARTIAL | INSPIRE | medium | M | ok | /home/ryan/repos/Personal/camp-404/docs/questionnaire-builder.md |
| 01 | questionnaire-engine | validateSubmission — branch-aware server-side submit validation | PARTIAL | ADAPT | high | S | ok |  |
| 01 | questionnaire-engine | deriveProgress — path-aware progress + completeness | PARTIAL | ADAPT | medium | M | ok | /home/ryan/repos/Personal/camp-404/docs/questionnaire-builder.md |
| 01 | questionnaire-engine | Deterministic seeded shuffle (presentationBlocks / presentationOptions) | MISSING | SKIP | low | S | ok |  |
| 01 | questionnaire-engine | aggregateResponses / aggregateQuestion — 7-shape results engine | MISSING | ADAPT | high | L | ok | /home/ryan/repos/Personal/camp-404/docs/questionnaire-builder.md |
| 01 | questionnaire-engine | resolveActivationDefinition — the activation snapshot rule | PARTIAL | ADAPT | high | M | ok |  |
| 01 | questionnaire-engine | Activation required-action builders + completion tally | PARTIAL | ADAPT | medium | M | ok | /home/ryan/repos/Personal/camp-404/docs/questionnaire-builder.md |
| 01 | questionnaire-engine | firstBlockingAction + RequiredActionLike gating spine | ALREADY_HAVE | SKIP | low | S | REFUTED |  |
| 01 | questionnaire-engine | actionRoute + ensureRequiredAction + listRequiredActions (server gating layer) | PARTIAL | INSPIRE | medium | S | ok | /home/ryan/repos/Personal/camp-404/DEFERRED.md |
| 01 | questionnaire-engine | Close-releases-the-gate (read-side) + close-as-recall (write-side) | PARTIAL | ADAPT | medium | S | ok |  |
| 01 | questionnaire-engine | Builder v2 block palette (20 entries) + createBlock / convertBlock / id allocation | ALREADY_HAVE | INSPIRE | medium | S | ok |  |
| 01 | questionnaire-engine | QuestionnaireBuilderV2 — the authoring canvas | PARTIAL | INSPIRE | high | M | ok | /home/ryan/repos/Personal/camp-404/docs/questionnaire-builder.md |
| 01 | questionnaire-engine | BlockEditor — per-block authoring UI incl. branching | ALREADY_HAVE | INSPIRE | low | S | ok |  |
| 01 | questionnaire-engine | DefinitionIssue path parser + inline issue placement | MISSING | ADAPT | high | S | ok | /home/ryan/repos/Personal/camp-404/docs/questionnaire-builder.md |
| 01 | questionnaire-engine | saveDefinitionV2 — the server-side validation gate | PARTIAL | ADAPT | medium | S | REFUTED |  |
| 01 | questionnaire-engine | QuestionnaireRunner — the respondent runner | PARTIAL | ADAPT | high | M | ok | /home/ryan/repos/Personal/camp-404/design/spec/impl/app/24-questionnaire-runner.md |
| 01 | questionnaire-engine | QuestionField — the 15-kind renderer | PARTIAL | INSPIRE | medium | L | ok | /home/ryan/repos/Personal/camp-404/design/spec/impl/app/20-field-renderer.md |
| 01 | questionnaire-engine | ContentBlockView — decorative-by-construction block renderer | ALREADY_HAVE | SKIP | low | S | ok |  |
| 01 | questionnaire-engine | ResultsView — Summary/Individual tabs + per-question charts + CSV export | MISSING | ADAPT | high | L | ok | /home/ryan/repos/Personal/camp-404/docs/questionnaire-builder.md |
| 01 | questionnaire-engine | ResponseViewer — per-respondent completion table + answer dialog | MISSING | ADAPT | high | M | ok | /home/ryan/repos/Personal/camp-404/docs/questionnaire-builder.md |
| 01 | questionnaire-engine | QuestionnairePreview — author preview using the real renderer and real branching | ALREADY_HAVE | SKIP | low | S | ok |  |
| 01 | questionnaire-engine | BlockingBadge — 'Required · blocks until done' vs 'Optional' | PARTIAL | ADAPT | medium | S | ok | /home/ryan/repos/Personal/camp-404/DEFERRED.md |
| 01 | questionnaire-engine | PendingQuestionnaires card — the NON-BLOCKING delivery surface | MISSING | ADAPT | high | M | ok | /home/ryan/repos/Personal/camp-404/DEFERRED.md |
| 01 | questionnaire-engine | Blocking-gate fill page (hard takeover + gate ordering + already-submitted state) | PARTIAL | ADAPT | high | M | ok | /home/ryan/repos/Personal/camp-404/design/spec/impl/app/27-questionnaire-complete.md |
| 01 | questionnaire-engine | ConsoleGate — the same hard gate applied to a second app shell | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 01 | questionnaire-engine | getActivation / getFillView / submitResponse (participant data layer) | ALREADY_HAVE | INSPIRE | medium | S | ok |  |
| 01 | questionnaire-engine | createAndActivateProjectQuestionnaire — build-and-send in one transaction | PARTIAL | INSPIRE | medium | S | ok |  |
| 01 | questionnaire-engine | activateQuestionnaire — the org send action (draft refusal, snapshot, fan-out, audit, notify) | PARTIAL | INSPIRE | medium | S | REFUTED |  |
| 01 | questionnaire-engine | saveQuestionnaireDefinition — slug keys, unique-key allocation, version bump, audit | PARTIAL | INSPIRE | low | S | ok |  |
| 01 | questionnaire-engine | listOrgQuestionnaires + tallyActivations (author-side list read model) | PARTIAL | ADAPT | high | M | REFUTED | /home/ryan/repos/Personal/camp-404/docs/questionnaire-builder.md |
| 01 | questionnaire-engine | getActivationResults + canReadActivationResults (results privacy boundary + read model) | MISSING | ADAPT | high | M | ok | /home/ryan/repos/Personal/camp-404/docs/questionnaire-builder.md |
| 01 | questionnaire-engine | AudienceSpec union + activation/builder boundary schemas | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 01 | questionnaire-engine | questionnaire-authz predicates | NOT_APPLICABLE | INSPIRE | low | S | ok |  |
| 01 | questionnaire-engine | resolveAudience — audience spec to user ids | ALREADY_HAVE | SKIP | low | S | ok |  |
| 01 | questionnaire-engine | AudienceSelect — the deliberately dumb audience picker | PARTIAL | REWRITE | medium | S | ok | /home/ryan/repos/Personal/camp-404/DEFERRED.md |
| 01 | questionnaire-engine | mapForm2Answers — questionnaire answers mirrored into typed columns with honest drift reporting | PARTIAL | INSPIRE | high | M | ok |  |
| 01 | questionnaire-engine | Frozen v1 definition fixture — backward compatibility as a test, not a promise | MISSING | COPY | high | S | ok |  |
| 01 | questionnaire-engine | validateOne exhaustiveness harness (question-fixtures + union assertion) | MISSING | COPY | high | S | ok |  |
| 01 | questionnaire-engine | Source-assertion test that ON CONFLICT names its partial index | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 01 | questionnaire-engine | questionnaire-snapshot regression suite (proves the fix AND the bug) | MISSING | ADAPT | high | M | ok |  |
| 01 | questionnaire-engine | E2E specs for the whole loop | PARTIAL | INSPIRE | medium | M | ok | /home/ryan/repos/Personal/camp-404/docs/e2e-true-auth.md |
| 01 | questionnaire-engine | docs/questionnaire-spec.md — the design authority | ALREADY_HAVE | INSPIRE | medium | S | ok | /home/ryan/repos/Personal/camp-404/docs/questionnaire-builder.md |
| 01 | questionnaire-engine | Seeded questionnaire templates (definition-only reference data) | PARTIAL | INSPIRE | medium | S | ok | /home/ryan/repos/Personal/camp-404/design/spec/open-questions.md |
| 02 | questionnaire-builder-ui | Questionnaire Zod schema authority (15 question kinds + 2 content blocks + 2 page kinds) | PARTIAL | INSPIRE | medium | M | ok |  |
| 02 | questionnaire-builder-ui | validateOne — per-answer validation with exact user-facing messages | PARTIAL | INSPIRE | medium | S | ok |  |
| 02 | questionnaire-builder-ui | validateQuestionnaireDefinition — structural integrity with dotted-path issues | PARTIAL | ADAPT | high | M | REFUTED | docs/questionnaire-builder.md:491-493 (Phase D §6.2 shipped as a flat list); the dotted-path half is unplanned |
| 02 | questionnaire-builder-ui | Questionnaire runtime — branching, progress, branch-aware submit, seeded shuffle | PARTIAL | INSPIRE | medium | M | REFUTED |  |
| 02 | questionnaire-builder-ui | aggregateResponses — 7-shape per-question results engine, chart-library agnostic | MISSING | ADAPT | high | M | ok | docs/questionnaire-builder.md:394-400 (§7.2 per-kind aggregation) and :491-493 (Phase E) |
| 02 | questionnaire-builder-ui | Activation lifecycle builders + resolveActivationDefinition (the SNAPSHOT resolver) | ALREADY_HAVE | SKIP | low | S | ok |  |
| 02 | questionnaire-builder-ui | Builder v2 block palette + factories + id allocation | ALREADY_HAVE | SKIP | low | S | ok |  |
| 02 | questionnaire-builder-ui | BlockEditor — the per-block editor with type selector, per-kind bodies, and the branching UI | PARTIAL | INSPIRE | high | M | REFUTED | docs/questionnaire-builder.md:495-499 (Phase F — 'functional logic editor ("show this when [earlier field] [op |
| 02 | questionnaire-builder-ui | QuestionnaireBuilderV2 — the three-column authoring shell | ALREADY_HAVE | SKIP | low | S | ok |  |
| 02 | questionnaire-builder-ui | Dotted-path issue router + inline/panel issue rendering | MISSING | ADAPT | high | M | ok |  |
| 02 | questionnaire-builder-ui | QuestionnairePreview — author preview dialog driven by the real engine | ALREADY_HAVE | SKIP | low | S | ok |  |
| 02 | questionnaire-builder-ui | ResultsView — Summary/Individual tabs with 7 chart shapes | MISSING | ADAPT | high | L | ok | docs/questionnaire-builder.md:402-409 (§7.3 Responses surface — 'the collect payoff — was missing') and :491-4 |
| 02 | questionnaire-builder-ui | CSV export of questionnaire responses | MISSING | ADAPT | high | S | ok | docs/questionnaire-builder.md:407 ('CSV export (one row per response; columns = fields)') — Phase E |
| 02 | questionnaire-builder-ui | saveDefinitionV2 — the server-side validation gate | PARTIAL | ADAPT | medium | S | ok |  |
| 02 | questionnaire-builder-ui | saveQuestionnaireDefinition — create/edit with key allocation, version bump, atomic audit | PARTIAL | INSPIRE | low | S | ok |  |
| 02 | questionnaire-builder-ui | activateQuestionnaire — atomic send with audience resolution, snapshot and fan-out | PARTIAL | INSPIRE | high | M | ok | WP4 #128 — 'a NON-BLOCKING questionnaire send (the DEFAULT on the Send screen) currently reaches nobody' |
| 02 | questionnaire-builder-ui | submitConsoleQuestionnaire — response upsert + gate flip in one transaction | ALREADY_HAVE | SKIP | low | S | ok |  |
| 02 | questionnaire-builder-ui | Questionnaire console read models (list, definition, activation, results, gate) | PARTIAL | REWRITE | high | M | REFUTED | docs/questionnaire-builder.md:384-392 (§7.1 Derivations — single source of truth) and :491-493 (Phase E) |
| 02 | questionnaire-builder-ui | Console list page with per-activation completion bars | MISSING | ADAPT | high | M | ok | docs/questionnaire-builder.md:384-392 (§7.1) — the completion derivation is specced; WP10 #134 records the rea |
| 02 | questionnaire-builder-ui | Activation results page (scope gate + PII gate + aggregate + completion header) | MISSING | REWRITE | high | M | REFUTED | docs/questionnaire-builder.md:379-409 (§7 — 'Captain-only, published-only, builder questionnaires only. Routes |
| 02 | questionnaire-builder-ui | ActivationForm — the send screen with live resolved-audience count | PARTIAL | ADAPT | high | S | ok | WP6 #130 — 'zero-audience protection on sends'; docs/questionnaire-builder.md:441-451 (§6.4 Send/Activate scre |
| 02 | questionnaire-builder-ui | AudienceSelect — dumb audience picker with a resolved-count line | MISSING | INSPIRE | low | S | ok |  |
| 02 | questionnaire-builder-ui | BlockingBadge — the mandatory Required/Optional badge | PARTIAL | ADAPT | medium | S | ok | WP4 #128 — 'activation.blocking is not threaded into BuilderRunner (runner.tsx:27)' |
| 02 | questionnaire-builder-ui | ContentBlockView — info panel + image figure renderer | ALREADY_HAVE | SKIP | low | S | ok |  |
| 02 | questionnaire-builder-ui | QuestionField — the full respondent field renderer (all 15 kinds + display variants) | PARTIAL | INSPIRE | medium | M | ok | WP11 #135 — 'multi_select lacks the tappable card treatment single_select got (question.tsx:228)'; design/spec |
| 02 | questionnaire-builder-ui | QuestionnaireRunner (participant, v2) — branch trail, step rail, localStorage draft autosave | PARTIAL | INSPIRE | medium | M | ok |  |
| 02 | questionnaire-builder-ui | QuestionnaireRunner (console) — the branch- and content-block-aware gate runner | ALREADY_HAVE | SKIP | low | S | REFUTED |  |
| 02 | questionnaire-builder-ui | ResponseViewer — per-respondent answer dialog | MISSING | ADAPT | high | S | ok | docs/questionnaire-builder.md:405 ('Per-respondent detail view') — Phase E; WP10 #134 'no captain/lead read-ba |
| 02 | questionnaire-builder-ui | ConsoleGate — full-app blocking takeover for a questionnaire | PARTIAL | INSPIRE | medium | M | ok | design/spec/impl/app/25-global-overlays.md — the app-wide QuestionnaireBlock overlay + GET /api/required-actio |
| 02 | questionnaire-builder-ui | PendingQuestionnaires — the non-blocking delivery surface | MISSING | ADAPT | high | S | REFUTED | WP4 #128 (a non-blocking send reaches nobody); design/spec/impl/app/27-questionnaire-complete.md; packages/typ |
| 02 | questionnaire-builder-ui | FileUpload — Vercel Blob client-upload primitive with honest degradation | MISSING | ADAPT | medium | M | ok |  |
| 02 | questionnaire-builder-ui | Blob client-upload token route with per-kind policy and per-domain authz | MISSING | ADAPT | medium | S | ok |  |
| 02 | questionnaire-builder-ui | Simple camp-scoped builder (flat, 5 kinds, scope-aware audience) | NOT_APPLICABLE | INSPIRE | medium | S | ok |  |
| 02 | questionnaire-builder-ui | Frozen v1 backward-compatibility fixture | MISSING | ADAPT | high | S | ok |  |
| 02 | questionnaire-builder-ui | KIND_SAMPLES — exhaustiveness fixture for a switch with no default arm | MISSING | ADAPT | high | S | ok |  |
| 02 | questionnaire-builder-ui | Snapshot regression suite that proves the bug it prevents | MISSING | ADAPT | high | S | REFUTED |  |
| 02 | questionnaire-builder-ui | E2E: build → branch → publish → activate → answer → aggregate | PARTIAL | INSPIRE | medium | M | ok |  |
| 02 | questionnaire-builder-ui | questionnaire-spec.md §Builder v2 — the requirements document that produced all of this | ALREADY_HAVE | INSPIRE | low | S | ok |  |
| 02 | questionnaire-builder-ui | AudienceSpec + builder/activation boundary schemas | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 02 | questionnaire-builder-ui | questionnaire-authz predicates (org vs project authoring and results visibility) | NOT_APPLICABLE | INSPIRE | low | S | ok |  |
| 02 | questionnaire-builder-ui | Console skeleton loading state for the questionnaires list | MISSING | ADAPT | high | S | ok | WP7 #131 — 'ZERO loading.tsx files exist across 24 force-dynamic pages' |
| 02 | questionnaire-builder-ui | Participant/camp questionnaire store (create+activate, list, fill view, pending, submit) | PARTIAL | REWRITE | medium | M | ok |  |
| 03 | questionnaire-runner-ui | questionnaire-runtime (branching, progress, branch-aware submit, seeded shuffle) | PARTIAL | INSPIRE | medium | S | ok |  |
| 03 | questionnaire-runner-ui | questionnaire-results (per-question aggregation, 7 chart shapes, orphan answers) | MISSING | ADAPT | high | M | ok | docs/questionnaire-builder.md:487-493 (Phase E — Metrics + responses + reminders) and §7.1-7.2 (:380-397); res |
| 03 | questionnaire-runner-ui | QuestionnaireRunner (participant, v2) | PARTIAL | INSPIRE | medium | M | ok | WP4 #128 ('activation.blocking is not threaded into BuilderRunner'); WP7 #131 (per-control pending states) |
| 03 | questionnaire-runner-ui | QuestionField (15-kind renderer with the labelable/composite ARIA split) | PARTIAL | ADAPT | high | M | ok | WP8 #132 (40 a11y findings); WP11 #135 ('multi_select lacks the tappable card treatment single_select got', qu |
| 03 | questionnaire-runner-ui | Question / ContentBlock / Page Zod schemas + validateOne + validateResponses | PARTIAL | SKIP | low | L | ok |  |
| 03 | questionnaire-runner-ui | ResultsView (Summary/Individual tabs, 7 chart renderers, orphan disclosure, CSV export) | MISSING | ADAPT | high | L | ok | docs/questionnaire-builder.md:487-493 (Phase E) and §7.3 (:399-406, 'the "collect" payoff — was missing'); WP1 |
| 03 | questionnaire-runner-ui | questionnaire-store (persistence + activation service) | ALREADY_HAVE | SKIP | low | XL | ok |  |
| 03 | questionnaire-runner-ui | Blocking gate spine (firstBlockingAction / listRequiredActions / pendingBlockingRoute / enforceGate / viewerIsGated) | PARTIAL | INSPIRE | medium | S | ok | DEFERRED.md:71 (redirect-ladder consolidation — 'nextGate is called ONLY from apps/web/app/page.tsx:55'); WP2  |
| 03 | questionnaire-runner-ui | Fill route (/questionnaires/[activationId]) — the three-way fork | PARTIAL | ADAPT | high | S | ok | WP4 #128 ('thread activation.blocking into BuilderRunner', runner.tsx:27); WP7 #131 (zero loading.tsx across 2 |
| 03 | questionnaire-runner-ui | QuestionnaireFill (activation binder + seed derivation) | ALREADY_HAVE | SKIP | low | S | ok |  |
| 03 | questionnaire-runner-ui | BlockingBadge | PARTIAL | ADAPT | medium | S | ok | WP4 #128 (questionnaire delivery); WP11 #135 (badge/UI consistency) |
| 03 | questionnaire-runner-ui | PendingQuestionnaires card + listPendingQuestionnaires | MISSING | ADAPT | high | M | ok | WP4 #128 ('a NON-BLOCKING questionnaire send — the DEFAULT on the Send screen — currently reaches nobody', sen |
| 03 | questionnaire-runner-ui | CloseQuestionnaireButton (two-step recall with an honest refusal) | PARTIAL | ADAPT | medium | S | ok | WP1 #125 ('builder block/page deletes use bare window.confirm or nothing', builder-canvas.tsx:185, page-settin |
| 03 | questionnaire-runner-ui | closeQuestionnaireAction (transactional recall: activation closed + pending rows expired) | ALREADY_HAVE | SKIP | low | S | ok |  |
| 03 | questionnaire-runner-ui | ResponseViewer (web fork: completion table + capped per-respondent dialog) | MISSING | ADAPT | high | M | ok | docs/questionnaire-builder.md:401-403 (§7.3 per-respondent detail view); WP10 #134 item (d) |
| 03 | questionnaire-runner-ui | ContentBlockView (info_block / image_block) | ALREADY_HAVE | SKIP | low | S | ok |  |
| 03 | questionnaire-runner-ui | resolveActivationDefinition + activation key helpers + completion tally | PARTIAL | INSPIRE | medium | S | ok | docs/questionnaire-builder.md:383-388 (§7.1 derivations — completed/pending/sent and completion %) |
| 03 | questionnaire-runner-ui | ConsoleGate (full-screen blocking takeover) + getConsoleBlockingQuestionnaire | NOT_APPLICABLE | INSPIRE | low | M | ok | design/spec/impl/app/25-global-overlays.md (the NEW app-wide QuestionnaireBlock overlay + GET /api/required-ac |
| 03 | questionnaire-runner-ui | ActivationForm (send screen with a live debounced audience-count preview) | PARTIAL | INSPIRE | high | S | ok | WP6 #130 ('team-scoped questionnaire sends silently reach zero people' + zero-audience protection on sends) |
| 03 | questionnaire-runner-ui | QuestionnairePreview (author preview reusing the runtime + field renderer) | ALREADY_HAVE | SKIP | low | S | ok |  |
| 03 | questionnaire-runner-ui | navigateOnwards (deferred push/refresh after a state-changing transition) | NOT_APPLICABLE | INSPIRE | low | S | ok |  |
| 03 | questionnaire-runner-ui | validateQuestionnaireDefinition (author-side structural validation, 11 issue codes) | PARTIAL | ADAPT | medium | S | ok | WP1 #125 ('breaking edits to published fields with existing responses are not rejected server-side', apps/web/ |
| 03 | questionnaire-runner-ui | questionnaire-runtime test suite (the branching/progress/submit contract) | PARTIAL | INSPIRE | medium | M | ok |  |
| 03 | questionnaire-runner-ui | questionnaire-store test suite (38 it(), fake-db driven) | PARTIAL | INSPIRE | medium | M | ok | MEMORY: db-integration-tests-pglite.md (test real Drizzle queries with the packages/db PGlite harness + __setD |
| 03 | questionnaire-runner-ui | Blocking-gate e2e specs (trap, release-on-submit, release-on-close) | PARTIAL | INSPIRE | medium | M | ok | docs/questionnaire-builder.md:475-476 (Phase B e2e: 'receive activation → open → submit → required_action comp |
| 03 | questionnaire-runner-ui | Skeleton primitives + questionnaire loading states | MISSING | COPY | high | S | ok | WP7 #131 ('ZERO loading.tsx files exist across 24 force-dynamic pages') |
| 03 | questionnaire-runner-ui | CampHistoryEditor (debounced directory typeahead with a free-text fallback) | NOT_APPLICABLE | SKIP | low | M | ok |  |
| 03 | questionnaire-runner-ui | questionnaireReleasedNotification (blocking-forked in-app notification copy) | MISSING | ADAPT | high | M | ok | WP4 #128 ('a NON-BLOCKING questionnaire send currently reaches nobody — no notification/listing path exists') |
| 03 | questionnaire-runner-ui | Camp questionnaires author list (completion bar + per-member rows + audience label) | PARTIAL | INSPIRE | medium | M | ok | docs/questionnaire-builder.md:383-388 (§7.1 completion % derivation); WP10 #134 item (d) |
| 03 | questionnaire-runner-ui | AudienceSpec + questionnaire-authz (the org/participant permission fork) | NOT_APPLICABLE | SKIP | low | XL | ok |  |
| 04 | notifications-engine | notificationMentionsAny — privacy guard for notification payloads | MISSING | ADAPT | medium | S | ok |  |
| 04 | notifications-engine | Notification payload builder layer (10 event builders) | MISSING | REWRITE | high | M | REFUTED | /home/ryan/repos/Personal/camp-404/DEFERRED.md (WP3 #127, WP4 #128, WP10 #134 restate the consequences) |
| 04 | notifications-engine | Security notification + Resend email builders (19 functions) | MISSING | SKIP | low | L | ok |  |
| 04 | notifications-engine | maskEmail | MISSING | SKIP | low | S | ok |  |
| 04 | notifications-engine | groupNotificationsByDay + DayGroup<T> | MISSING | COPY | low | S | ok |  |
| 04 | notifications-engine | isUnread / countUnread — the pure mirror of the SQL predicate | PARTIAL | INSPIRE | low | S | ok |  |
| 04 | notifications-engine | shouldSendImmediateEmail — single-predicate delivery gating | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 04 | notifications-engine | resolveNotificationLinkApp / notificationLinkIsLocal — the undefined-vs-null discipline | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 04 | notifications-engine | resolveAudience — one pure resolver, two consumers | ALREADY_HAVE | SKIP | low | S | ok |  |
| 04 | notifications-engine | AudienceSpec + selector vocabulary (Zod) | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 04 | notifications-engine | NotificationKind / NotificationPayload / NotificationFilter / BulletinComposeInput (Zod) | PARTIAL | ADAPT | medium | S | REFUTED |  |
| 04 | notifications-engine | notifications table + migration 0009/0021 | ALREADY_HAVE | ADAPT | low | S | REFUTED |  |
| 04 | notifications-engine | bulletins table | ALREADY_HAVE | SKIP | low | S | ok |  |
| 04 | notifications-engine | security_events table + securityEventKindEnum | PARTIAL | INSPIRE | low | M | ok |  |
| 04 | notifications-engine | SECURITY_EVENT_TITLES + describeSecurityEvent | MISSING | INSPIRE | low | S | ok |  |
| 04 | notifications-engine | recordSecurityEvent — thin, best-effort request-context logger | MISSING | INSPIRE | low | S | REFUTED |  |
| 04 | notifications-engine | insertNotifications — chunked, provenance-stamping fan-out writer | MISSING | INSPIRE | low | S | ok |  |
| 04 | notifications-engine | Inbox read models (getUnreadNotificationCount / listNotificationGroups / recentNotifications) | PARTIAL | ADAPT | medium | S | ok | /home/ryan/repos/Personal/camp-404/design/spec/surfaces/09-notifications.md (open question 4: pagination / lis |
| 04 | notifications-engine | markNotificationRead / markAllNotificationsRead server actions | PARTIAL | ADAPT | medium | S | ok | /home/ryan/repos/Personal/camp-404/design/spec/surfaces/09-notifications.md (open question 5: refType/refId de |
| 04 | notifications-engine | saveBulletin / publishBulletin — row-locked publish with frozen-after-publish fields | PARTIAL | INSPIRE | high | M | ok | WP1 #125 — announcement publish has no confirm and no recall path (/home/ryan/repos/Personal/camp-404/apps/web |
| 04 | notifications-engine | Bulletin read-side authorization — the notification row IS the ACL | ALREADY_HAVE | SKIP | low | S | ok |  |
| 04 | notifications-engine | Bulletin read-rate telemetry (readRate + the filtered-count SQL) | PARTIAL | ADAPT | medium | S | ok |  |
| 04 | notifications-engine | NotificationItem — the one inbox row component | ALREADY_HAVE | SKIP | low | S | ok |  |
| 04 | notifications-engine | NotificationBell — badge-capped header bell | ALREADY_HAVE | SKIP | medium | S | ok |  |
| 04 | notifications-engine | NotificationPanel — lazy non-modal header dropdown | MISSING | SKIP | low | M | ok |  |
| 04 | notifications-engine | NotificationRow — optimistic mark-read + follow-link wrapper | MISSING | ADAPT | medium | M | ok | /home/ryan/repos/Personal/camp-404/design/spec/surfaces/09-notifications.md (open question 5: refType/refId ca |
| 04 | notifications-engine | NotificationFilterTabs — URL-state segmented control | MISSING | SKIP | low | M | ok |  |
| 04 | notifications-engine | MarkAllReadButton (and its silent drift) | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 04 | notifications-engine | format.ts — server-side row projection + sourceLabel honesty rule | ALREADY_HAVE | SKIP | low | S | ok |  |
| 04 | notifications-engine | sendEmail — Resend seam with the one-recipient-per-message POPIA rule | MISSING | INSPIRE | low | M | ok |  |
| 04 | notifications-engine | Digest cron — the honest design stub | PARTIAL | ADAPT | medium | S | ok | WP10 #134(c) — the reminders cron is a literal stub returning { ok: true, sent: 0 } after assertCron |
| 04 | notifications-engine | Bulletin composer with live audience count | MISSING | REWRITE | high | M | ok | WP6 #130 — zero-audience protection on sends; team-scoped questionnaire sends silently reach zero people |
| 04 | notifications-engine | AudienceSelect — dumb picker with a resolved-count line | MISSING | ADAPT | medium | S | ok | WP6 #130 (pairs with item 32) |
| 04 | notifications-engine | BulletinCard + PinnedBulletinBanner | MISSING | SKIP | low | M | ok |  |
| 04 | notifications-engine | AccountSecurityEvents card | MISSING | SKIP | low | M | ok |  |
| 04 | notifications-engine | plainPreview — markdown-to-one-line stripper | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 04 | notifications-engine | Notification surface loading.tsx skeletons | MISSING | ADAPT | high | M | ok | WP7 #131 — zero loading.tsx across 24 force-dynamic pages, one error boundary total |
| 04 | notifications-engine | Best-effort write discipline (hooks never roll back the primary action) | MISSING | ADAPT | high | M | REFUTED | /home/ryan/repos/Personal/camp-404/DEFERRED.md:53-58 — result-object server actions still throw raw on DB erro |
| 04 | notifications-engine | Env-less graceful degradation across every read | PARTIAL | SKIP | low | S | ok |  |
| 04 | notifications-engine | docs/notifications-spec.md — the intent doc | PARTIAL | INSPIRE | low | S | ok |  |
| 05 | notifications-ui | NotificationBell | PARTIAL | SKIP | low | S | ok |  |
| 05 | notifications-ui | NotificationItem + NOTIFICATION_KIND_ICON | PARTIAL | INSPIRE | medium | S | REFUTED | design/spec/impl/app/09-notifications.md (§Row-level variants — the shipped row is the built target) |
| 05 | notifications-ui | groupNotificationsByDay + DayGroup | MISSING | COPY | high | S | ok |  |
| 05 | notifications-ui | format.ts — relativeTime / sourceLabel / dayGroupHeading / isBlockingNotification / toRowItem | PARTIAL | ADAPT | medium | S | ok | design/spec/impl/app/09-notifications.md (Open item #7 — migrate formatRelativeTime into @camp404/core once co |
| 05 | notifications-ui | NotificationPanel (Popover dropdown) | MISSING | SKIP | low | M | ok |  |
| 05 | notifications-ui | NotificationRow (interactive wrapper) | MISSING | ADAPT | high | M | ok | design/spec/impl/app/09-notifications.md (Open item #5 — refType/refId deep-link, currently parked; and Open i |
| 05 | notifications-ui | NotificationFilterTabs + notificationsHref | MISSING | REWRITE | low | S | ok |  |
| 05 | notifications-ui | MarkAllReadButton | MISSING | COPY | high | S | ok |  |
| 05 | notifications-ui | NotificationDayGroups | MISSING | COPY | high | S | ok |  |
| 05 | notifications-ui | Inbox page (/notifications) — gate ladder, Zod-at-boundary filter, per-filter empty copy | PARTIAL | INSPIRE | high | M | ok | WP2 #126 (the notifications page skips the isApproved gate every sibling page enforces); design/spec/impl/app/ |
| 05 | notifications-ui | loading.tsx route skeletons (3 inboxes) | MISSING | ADAPT | high | S | REFUTED | WP7 #131 — zero loading.tsx files exist across 24 force-dynamic pages |
| 05 | notifications-ui | Skeleton / SkeletonRegion kit | MISSING | COPY | high | S | ok | WP7 #131 — loading/error boundaries across 24 force-dynamic pages |
| 05 | notifications-ui | Popover wrapper | ALREADY_HAVE | SKIP | low | S | ok |  |
| 05 | notifications-ui | Tabs wrapper | MISSING | SKIP | low | S | ok |  |
| 05 | notifications-ui | lib/notifications.ts — inbox reads + chunked fan-out insert | PARTIAL | INSPIRE | medium | M | ok |  |
| 05 | notifications-ui | notifications-actions.ts — markNotificationRead / markAllNotificationsRead | MISSING | ADAPT | high | S | ok | DEFERRED.md — result-object server actions still throw raw on DB errors (only createInviteAction try/catches) |
| 05 | notifications-ui | fetchRecentNotifications — the no-argument panel feed | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 05 | notifications-ui | HeaderNotificationBell (pass-through) + header mounting | PARTIAL | INSPIRE | medium | M | ok |  |
| 05 | notifications-ui | @quagga/core notifications — payload builders + link-app rules + email gating + privacy guard | MISSING | INSPIRE | medium | M | ok |  |
| 05 | notifications-ui | @quagga/core security-notifications — in-app + email builders for auth-adjacent events | MISSING | ADAPT | medium | L | ok |  |
| 05 | notifications-ui | securityEventKindEnum + the append-only security-events log pattern | MISSING | INSPIRE | low | M | ok |  |
| 05 | notifications-ui | Bulletin read-side authorisation (delivery-row-as-permission) | MISSING | ADAPT | high | M | ok | design/spec/impl/app/09-notifications.md (Open item #5 — refType/refId deep-link); WP12 #136 (no writer for no |
| 05 | notifications-ui | BulletinCard + readRate | PARTIAL | ADAPT | medium | S | ok |  |
| 05 | notifications-ui | PinnedBulletinBanner | MISSING | SKIP | low | S | ok |  |
| 05 | notifications-ui | NOTIFICATION_SOURCE_LABELS (org's kind → source-label map) | PARTIAL | INSPIRE | medium | S | ok |  |
| 05 | notifications-ui | notifications-spec.md — the product contract | PARTIAL | INSPIRE | medium | S | ok |  |
| 05 | notifications-ui | Notification digest cron route (DECLARED STUB) | PARTIAL | INSPIRE | medium | S | ok | WP10 #134 — implement the reminders cron (currently a {ok:true, sent:0} stub) |
| 05 | notifications-ui | Notification test suite (contract-as-tests) | PARTIAL | INSPIRE | high | M | ok | DEFERRED.md — MCP OAuth DB-flow tests note the harness blocker is now obsolete (a PGlite harness exists) |
| 05 | notifications-ui | E2E notification coverage (real browsers, no back doors) | PARTIAL | INSPIRE | medium | M | ok | DEFERRED.md — scope-aware test-store publish (test-store.publishBroadcast only models scope='everyone') |
| 06 | audit-log-security-events | writeAuditEvent | MISSING | ADAPT | high | S | ok | docs/telegram-bot-proposal.md:232 — "Audit log entries (audit_log) for invite issued / used" |
| 06 | audit-log-security-events | audit_events table + 4 indexes | PARTIAL | ADAPT | medium | S | ok |  |
| 06 | audit-log-security-events | getAuditTrail | MISSING | ADAPT | medium | M | REFUTED |  |
| 06 | audit-log-security-events | getMedicalAccessLog + canReadMedicalAccessLog | MISSING | ADAPT | high | M | ok |  |
| 06 | audit-log-security-events | canViewMedicalNotes + medicalAccessBasis (pure predicates) | NOT_APPLICABLE | REWRITE | medium | S | ok |  |
| 06 | audit-log-security-events | resolveMedicalNotesForViewer | MISSING | REWRITE | high | M | ok | DEFERRED.md:50 — "the owner/captain PII-read decrypt path (getIdDocuments, captain detail modal)" has no e2e c |
| 06 | audit-log-security-events | MedicalAccessPanel | MISSING | ADAPT | medium | M | ok |  |
| 06 | audit-log-security-events | AuditTrailList | MISSING | ADAPT | medium | S | ok |  |
| 06 | audit-log-security-events | /audit console page | MISSING | ADAPT | medium | M | ok |  |
| 06 | audit-log-security-events | /audit loading.tsx skeleton | MISSING | ADAPT | high | S | ok | WP7 #131 — "ZERO loading.tsx files exist across 24 force-dynamic pages"; design/spec/impl/build-coverage-audit |
| 06 | audit-log-security-events | activityLabel / activityTone / FEED_EXCLUDED_ACTIONS / relativeTime | MISSING | ADAPT | medium | S | ok |  |
| 06 | audit-log-security-events | getRecentActivity (the 6-row glance feed) | MISSING | ADAPT | medium | S | ok |  |
| 06 | audit-log-security-events | RecentActivity card | MISSING | INSPIRE | low | S | ok |  |
| 06 | audit-log-security-events | security_events table + securityEventKindEnum | MISSING | ADAPT | medium | M | ok |  |
| 06 | audit-log-security-events | recordSecurityEvent | MISSING | ADAPT | medium | S | ok |  |
| 06 | audit-log-security-events | listSecurityEvents (row read) | MISSING | COPY | medium | S | ok |  |
| 06 | audit-log-security-events | describeSecurityEvent + SECURITY_EVENT_TITLES | MISSING | COPY | medium | S | ok |  |
| 06 | audit-log-security-events | AccountSecurityEvents card | MISSING | ADAPT | medium | S | ok |  |
| 06 | audit-log-security-events | security-event presentation layer | MISSING | COPY | low | S | ok |  |
| 06 | audit-log-security-events | deviceLabel | MISSING | COPY | low | S | ok |  |
| 06 | audit-log-security-events | account security page composition | MISSING | INSPIRE | medium | L | ok |  |
| 06 | audit-log-security-events | security-factors DI wrapper | NOT_APPLICABLE | INSPIRE | low | S | ok |  |
| 06 | audit-log-security-events | Table primitive family | MISSING | COPY | high | S | ok |  |
| 06 | audit-log-security-events | Skeleton primitives + ConsoleTableSkeleton | MISSING | ADAPT | high | M | ok | WP7 #131 — loading.tsx across 24 force-dynamic pages |
| 06 | audit-log-security-events | fakeDb + whereMentions test harness | PARTIAL | ADAPT | medium | M | ok |  |
| 06 | audit-log-security-events | org actor test fixtures | NOT_APPLICABLE | INSPIRE | low | S | ok |  |
| 06 | audit-log-security-events | medical-audit-surface regression suite | MISSING | INSPIRE | high | M | ok |  |
| 06 | audit-log-security-events | security-events drift-guard test | MISSING | COPY | high | S | ok |  |
| 06 | audit-log-security-events | medical-access predicate tests | NOT_APPLICABLE | INSPIRE | medium | S | ok |  |
| 06 | audit-log-security-events | medical-notes-access e2e spec | MISSING | INSPIRE | medium | L | ok | DEFERRED.md:50 — the owner/captain PII-read decrypt path has no e2e coverage; AGENTS.md:133 marks e2e disabled |
| 06 | audit-log-security-events | audit_events.meta PII scrub on erasure | MISSING | ADAPT | medium | S | ok |  |
| 06 | audit-log-security-events | account.sanitized / account.released_holdings proof rows | MISSING | ADAPT | medium | S | ok |  |
| 06 | audit-log-security-events | cancelPendingDeletion — atomic audit + concurrency guard | MISSING | INSPIRE | high | S | ok | WP1 #125 — "decideApprovalAction has no stale/racing-decision guard" |
| 06 | audit-log-security-events | deletion-sweep cron route | PARTIAL | INSPIRE | medium | S | ok |  |
| 06 | audit-log-security-events | id-retention (POPIA storage limitation) | MISSING | REWRITE | medium | M | ok |  |
| 06 | audit-log-security-events | ORG_DOMAIN_DESCRIPTIONS as a permission-copy pattern | NOT_APPLICABLE | INSPIRE | low | S | ok |  |
| 06 | audit-log-security-events | guardConsole gate result shape | PARTIAL | INSPIRE | low | S | ok |  |
| 06 | audit-log-security-events | accounts-security-spec §Medical + §Security events log | MISSING | ADAPT | medium | S | ok |  |
| 06 | audit-log-security-events | AGENTS.md privacy-class law | PARTIAL | ADAPT | high | S | ok |  |
| 07 | roles-permissions | hasProjectPermission + the structural backstop | PARTIAL | ADAPT | medium | M | ok |  |
| 07 | roles-permissions | canManageQuestionnaireAudience — scoped send authority | MISSING | ADAPT | medium | M | ok | /home/ryan/repos/Personal/camp-404/DEFERRED.md (WP12 #136 — 'team-lead post to your crew' has no writer) |
| 07 | roles-permissions | Captain lock — enforceKindPermissions / isPermissionsLockedKind / allProjectPermissions | MISSING | COPY | medium | S | ok |  |
| 07 | roles-permissions | roleGrantsElevatedPrivileges — the escalation predicate | MISSING | COPY | medium | S | ok |  |
| 07 | roles-permissions | Escalation guards in the persistence layer (setMemberRoles + assignOfficer) | PARTIAL | INSPIRE | high | M | ok | WP6 (#130) team assignment; WP3 (#127) captain-promotion accept/decline surface |
| 07 | roles-permissions | Project role kind model + guards (ProjectRoleKind, UNDELETABLE/RENAMEABLE, canDelete/canRename/isBaseline) | MISSING | ADAPT | medium | S | ok |  |
| 07 | roles-permissions | DEFAULT_PROJECT_ROLES seed + defaultProjectRoleRows + teamLeadScopePatch | MISSING | ADAPT | medium | S | ok |  |
| 07 | roles-permissions | Role name normalisation + conflict detection (normalizeName / cleanRoleName / isValidRoleName / roleNameConflicts / dedupeRoleNames) | PARTIAL | COPY | medium | S | ok |  |
| 07 | roles-permissions | PROJECT_ROLE_CAP + roleCapReached | NOT_APPLICABLE | INSPIRE | low | S | ok |  |
| 07 | roles-permissions | roles-store — the camp-side persistence layer | MISSING | REWRITE | medium | L | ok |  |
| 07 | roles-permissions | Camp role/officer server actions + requirePermission gate | PARTIAL | ADAPT | high | M | ok | /home/ryan/repos/Personal/camp-404/DEFERRED.md:71 (redirect-ladder consolidation); WP2 (#126) server-side auth |
| 07 | roles-permissions | RolesSettings — the three-section role management screen | MISSING | ADAPT | medium | M | ok |  |
| 07 | roles-permissions | RoleRow — collapsed summary, rename, appearance, two-step delete | MISSING | ADAPT | medium | M | ok |  |
| 07 | roles-permissions | PrivilegeToggles / PrivilegeEditor / privilegeSummary | MISSING | ADAPT | medium | M | ok |  |
| 07 | roles-permissions | AppearancePicker — emoji + curated colour swatches | MISSING | COPY | low | S | ok |  |
| 07 | roles-permissions | NewRoleCard — inline create with full setup | MISSING | ADAPT | low | S | ok |  |
| 07 | roles-permissions | OfficerRow — consent-gated role assignment UI | NOT_APPLICABLE | SKIP | low | L | ok |  |
| 07 | roles-permissions | OfficerConsentBanner — accept / decline / WITHDRAW | NOT_APPLICABLE | INSPIRE | medium | S | ok |  |
| 07 | roles-permissions | AssignRolesDialog — multi-select role assignment from the roster | MISSING | ADAPT | high | M | ok | WP6 (#130) team assignment; /home/ryan/repos/Personal/camp-404/design/spec/impl/app/14-roster.md |
| 07 | roles-permissions | RoleBadge / RoleSwatch / ROLE_COLOR_HEX | PARTIAL | ADAPT | medium | S | ok |  |
| 07 | roles-permissions | OFFICER_CATALOG + trigger matrix + outstanding-officer arithmetic | NOT_APPLICABLE | SKIP | low | L | ok |  |
| 07 | roles-permissions | Officer consent state machine (assign / accept / decline / withdraw) | NOT_APPLICABLE | INSPIRE | medium | S | REFUTED | WP1 (#125) — decideApprovalAction has no stale/racing-decision guard |
| 07 | roles-permissions | orgCan / orgCanIn / orgCanInDomain — the three-question resolver | NOT_APPLICABLE | INSPIRE | low | M | ok |  |
| 07 | roles-permissions | summarizeOrgActor + OrgCapabilityGrant | NOT_APPLICABLE | INSPIRE | medium | M | ok |  |
| 07 | roles-permissions | orgCapabilityRefusal + scopeReason + systemManagerRefusal | NOT_APPLICABLE | INSPIRE | medium | S | ok |  |
| 07 | roles-permissions | Consequence copy tables (labels / consequences / descriptions) | PARTIAL | INSPIRE | medium | S | ok |  |
| 07 | roles-permissions | ENGINEER_RANK_CARVE_OUTS — a ceiling on a rank, not a default on a row | NOT_APPLICABLE | INSPIRE | medium | S | ok |  |
| 07 | roles-permissions | The anti-lockout anchor (god) + requireSystemManager | PARTIAL | ADAPT | high | M | ok | WP1 (#125) — deleteOwnAccount does not block the sole captain; /home/ryan/repos/Personal/camp-404/docs/first-t |
| 07 | roles-permissions | guardConsole — one gate no page can forget | MISSING | ADAPT | high | M | ok | /home/ryan/repos/Personal/camp-404/DEFERRED.md:71 (redirect-ladder consolidation); WP2 (#126) server-side auth |
| 07 | roles-permissions | requireOrgSession({ capability, domain }) — the type-enforced domain | MISSING | INSPIRE | medium | S | ok |  |
| 07 | roles-permissions | computeOrgRoleImpacts / DeletionImpact — who loses what | MISSING | ADAPT | high | M | ok | WP1 (#125) destructive-action safety (18 findings) |
| 07 | roles-permissions | RolesManager — the departments+roles management screen | NOT_APPLICABLE | INSPIRE | medium | XL | ok |  |
| 07 | roles-permissions | CapabilitySummary + grantsForRoles — one renderer, three surfaces | NOT_APPLICABLE | INSPIRE | low | M | ok |  |
| 07 | roles-permissions | Org role/department server actions — transactional + audited | MISSING | INSPIRE | high | M | ok | WP1 (#125) destructive-action safety; WP2 (#126) server-side authz gates; /home/ryan/repos/Personal/camp-404/D |
| 07 | roles-permissions | setOrgStaffRole — grant/revoke the door, with the sole-manager guard | PARTIAL | ADAPT | high | S | ok | WP1 (#125) — top finding: deleteOwnAccount does not block the sole captain |
| 07 | roles-permissions | resolveOrgSession — cached session with role resolution and bootstrap | PARTIAL | INSPIRE | high | M | REFUTED |  |
| 07 | roles-permissions | canBootstrapGod — the verified-email elevation gate | MISSING | ADAPT | high | S | ok | /home/ryan/repos/Personal/camp-404/docs/first-time-setup.md:86-87 (god-email deprecation is a deferred follow- |
| 07 | roles-permissions | AUTH_CAPABILITIES matrix + assertCapability + capabilityVerdict | MISSING | ADAPT | medium | M | ok |  |
| 07 | roles-permissions | canViewMedicalNotes + medicalAccessBasis | MISSING | ADAPT | high | M | ok | WP5 (#129) — roster data, emergency contacts flagged SAFETY-CRITICAL |
| 07 | roles-permissions | Longhand resolution-matrix test | MISSING | ADAPT | medium | S | ok |  |
| 07 | roles-permissions | Lockout-scenario test suite | MISSING | ADAPT | high | M | ok | WP1 (#125); WP2 (#126) |
| 07 | roles-permissions | cross-side-identity test — proving two systems never touch | NOT_APPLICABLE | SKIP | low | M | ok |  |
| 07 | roles-permissions | E2E role and officer specs | NOT_APPLICABLE | INSPIRE | low | L | ok |  |
| 07 | roles-permissions | Deploy-time seed restoration for role rows | NOT_APPLICABLE | INSPIRE | medium | S | ok |  |
| 07 | roles-permissions | Roles & Officers settings page (server) | MISSING | ADAPT | medium | M | ok |  |
| 07 | roles-permissions | Org roles page — two gates, read vs write | ALREADY_HAVE | SKIP | low | S | ok |  |
| 07 | roles-permissions | OrgPermissions / ProjectPermissions Zod schemas | MISSING | COPY | medium | S | ok |  |
| 07 | roles-permissions | Kind guards as the entire permanence policy | PARTIAL | COPY | medium | S | ok |  |
| 08 | audience-targeting | AudienceSpec discriminated union + Zod grammar | PARTIAL | ADAPT | high | M | REFUTED | WP12 #136 (a writer for non-'everyone' broadcast scopes); DEFERRED.md:73 (opt_in scope) |
| 08 | audience-targeting | resolveAudience — the pure resolver | ALREADY_HAVE | SKIP | low | S | ok |  |
| 08 | audience-targeting | AudienceContext row-set interfaces | ALREADY_HAVE | SKIP | low | S | REFUTED |  |
| 08 | audience-targeting | AudienceSelect picker component | MISSING | ADAPT | high | S | ok | WP4 #128 (no zero-audience warning); WP6 #130 (team-scoped sends silently reach zero people) |
| 08 | audience-targeting | AudienceSelect test — the zero-vs-null contract | MISSING | COPY | medium | S | REFUTED |  |
| 08 | audience-targeting | resolveAudience unit-test fixture world + 21 cases | PARTIAL | INSPIRE | medium | S | REFUTED |  |
| 08 | audience-targeting | Union-exhaustiveness + label-completeness test | MISSING | COPY | high | S | ok |  |
| 08 | audience-targeting | canAuthorAudience / canActivateAudience / canViewActivationResults | MISSING | REWRITE | medium | S | ok | WP12 #136 (team-lead 'post to your crew'); WP2 #126 (server-side authz gates) |
| 08 | audience-targeting | canManageQuestionnaireAudience — per-role audience scope | MISSING | REWRITE | high | S | ok | WP6 #130 (team assignment + zero-audience protection on sends); WP12 #136 |
| 08 | audience-targeting | buildActivationRequiredActions — audience → gate rows | PARTIAL | ADAPT | medium | S | ok | docs/questionnaire-builder.md §7 (metrics, responses & reminders — Phase E, no code); WP10 #134 |
| 08 | audience-targeting | isParticipantFacingActivation — the org-internal leak guard | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 08 | audience-targeting | resolveBulletinAudience + buildBulletinNotifications + shouldSendImmediateEmail | PARTIAL | SKIP | low | S | ok |  |
| 08 | audience-targeting | NotificationOrigin / NotificationApp / resolveNotificationLinkApp | PARTIAL | SKIP | low | S | ok |  |
| 08 | audience-targeting | buildAudienceContext — the I/O boundary | ALREADY_HAVE | INSPIRE | medium | S | REFUTED |  |
| 08 | audience-targeting | previewBulletinAudienceCount — the live-count server action | MISSING | ADAPT | high | S | ok | WP4 #128 (no zero-audience warning anywhere); WP6 #130 (team-scoped sends silently reach zero people) |
| 08 | audience-targeting | audience-options.ts — option-value ⇄ AudienceSpec round trip | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 08 | audience-targeting | BulletinComposer — live-resolve compose form | PARTIAL | INSPIRE | medium | M | ok | WP12 #136 (announcement composer hardcodes kind 'announcement' + scope 'everyone', so every non-everyone scope |
| 08 | audience-targeting | ActivationForm — the questionnaire SEND screen | PARTIAL | ADAPT | high | S | ok | WP4 #128 (questionnaire delivery); docs/questionnaire-builder.md §6.4 (Send/Activate screen, functional/undraw |
| 08 | audience-targeting | activateQuestionnaire — audience resolution at send time | PARTIAL | INSPIRE | medium | S | REFUTED | WP1 #125 (destructive-action safety); WP10 #134 |
| 08 | audience-targeting | saveBulletin / publishBulletin / fanOut / audienceKey | PARTIAL | ADAPT | high | S | ok | WP1 #125 (announcement publish has no confirm and no recall path) |
| 08 | audience-targeting | insertNotifications — chunked fan-out sink | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 08 | audience-targeting | Camp-side project audience picker (everyone / by-role, scope-aware) | MISSING | ADAPT | high | M | ok | WP6 #130 (team assignment, the keystone gap); WP12 #136 (team-lead 'post to your crew'); WP4 #128 |
| 08 | audience-targeting | resolveProjectTargets — minimal-context camp-side resolution | ALREADY_HAVE | SKIP | low | S | ok |  |
| 08 | audience-targeting | listRequiredActions — gate read filtered by audience + activation status | PARTIAL | ADAPT | high | S | ok | WP4 #128 (a non-blocking questionnaire send — the DEFAULT on the Send screen — currently reaches nobody); WP7  |
| 08 | audience-targeting | Read-side audience enforcement for bulletins | ALREADY_HAVE | SKIP | low | S | ok |  |
| 08 | audience-targeting | audienceLabel — stored spec → human string | MISSING | REWRITE | medium | S | ok |  |
| 08 | audience-targeting | Audience carried through the query string, parsed defensively | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 08 | audience-targeting | Bulletin audience e2e — the adversarial control pattern | MISSING | INSPIRE | medium | M | ok | DEFERRED.md:76 (scope-aware test-store publish — test-store.publishBroadcast only models scope='everyone'); AG |
| 08 | audience-targeting | Anti-test: assert a module does NOT reach for the broadcast machinery | MISSING | INSPIRE | low | S | ok |  |
| 08 | audience-targeting | Bulletin/questionnaire action tests — freeze, reorder-equality, double-publish, empty audience | PARTIAL | ADAPT | medium | S | REFUTED | DEFERRED.md:67 (the stated blocker — no DB test harness — is now obsolete; the PGlite harness exists) |
| 08 | audience-targeting | AudienceSpec storage columns (questionnaire_activations + bulletins) + migrations | PARTIAL | SKIP | low | M | ok |  |
| 08 | audience-targeting | Officer / project-role vocabulary feeding the audience grammar | NOT_APPLICABLE | SKIP | low | XL | ok |  |
| 08 | audience-targeting | privileges.tsx — the audience-scope editor UI | NOT_APPLICABLE | SKIP | low | L | ok |  |
| 08 | audience-targeting | BulletinComposeInput — the compose boundary schema | PARTIAL | ADAPT | high | S | ok | packages/types/src/announcement.ts:18-22 (its own comment: 'the scoped (team / drivers / individual) and sched |
| 08 | audience-targeting | builder-v2 SendRail — the third audience option list | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 09 | bulletins-announcements | readRate (pure read-rate maths) | PARTIAL | COPY | medium | S | ok |  |
| 09 | bulletins-announcements | BulletinCard | PARTIAL | ADAPT | medium | S | ok |  |
| 09 | bulletins-announcements | PinnedBulletinBanner | MISSING | ADAPT | medium | M | ok |  |
| 09 | bulletins-announcements | Tiptap MarkdownEditor | MISSING | SKIP | low | L | ok |  |
| 09 | bulletins-announcements | MarkdownView (read-only renderer) | MISSING | REWRITE | low | S | ok |  |
| 09 | bulletins-announcements | markdownExtensions (the sanitiser) | MISSING | SKIP | low | S | ok |  |
| 09 | bulletins-announcements | roundTripMarkdown (headless markdown normalise) | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 09 | bulletins-announcements | plainPreview (markdown → single-line preview) | MISSING | INSPIRE | low | S | ok |  |
| 09 | bulletins-announcements | AudienceSelect | PARTIAL | ADAPT | high | M | ok | GitHub issue WP6 #130 ('zero-audience protection on sends'); WP12 #136 ('a writer for non-everyone broadcast s |
| 09 | bulletins-announcements | NotificationItem + NOTIFICATION_KIND_ICON | ALREADY_HAVE | SKIP | low | S | ok |  |
| 09 | bulletins-announcements | NotificationBell | ALREADY_HAVE | SKIP | low | S | ok |  |
| 09 | bulletins-announcements | BulletinComposeInput (Zod) | PARTIAL | ADAPT | high | S | ok | packages/types/src/announcement.ts:18-22 (the type's own comment: 'The scoped (team / drivers / individual) an |
| 09 | bulletins-announcements | bulletins table (Drizzle) | ALREADY_HAVE | SKIP | low | S | ok |  |
| 09 | bulletins-announcements | notifications table + notificationKindEnum | ALREADY_HAVE | SKIP | low | S | ok |  |
| 09 | bulletins-announcements | saveBulletin (create/update/publish server action) | PARTIAL | INSPIRE | medium | S | ok |  |
| 09 | bulletins-announcements | PUBLISHED_FROZEN_MESSAGE + the freeze guard | PARTIAL | INSPIRE | medium | S | ok | design/spec/open-questions.md:127 (D25) and design/spec/surfaces/15-announcements.md:207 (OQ6) — 'No unpublish |
| 09 | bulletins-announcements | audienceKey (order-insensitive audience comparison) | MISSING | INSPIRE | low | S | ok |  |
| 09 | bulletins-announcements | publishBulletin (locked, re-authorised publish) | ALREADY_HAVE | SKIP | low | S | ok |  |
| 09 | bulletins-announcements | setBulletinPinned | MISSING | ADAPT | medium | S | ok |  |
| 09 | bulletins-announcements | listBulletins / getBulletin (read models with SQL read-rate tallies) | PARTIAL | ADAPT | medium | S | ok |  |
| 09 | bulletins-announcements | BulletinComposer (compose/edit form + live preview) | PARTIAL | INSPIRE | medium | M | ok |  |
| 09 | bulletins-announcements | audience-options (option value ⇄ AudienceSpec mapping) | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 09 | bulletins-announcements | previewBulletinAudienceCount (gated live count server action) | MISSING | ADAPT | high | S | ok | GitHub issue WP6 #130 ('zero-audience protection on sends') |
| 09 | bulletins-announcements | resolveAudience (pure audience resolver) | ALREADY_HAVE | SKIP | low | S | ok |  |
| 09 | bulletins-announcements | bulletinNotification + buildBulletinNotifications (fan-out projection) | PARTIAL | INSPIRE | low | S | ok |  |
| 09 | bulletins-announcements | chunked insertNotifications | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 09 | bulletins-announcements | resolveNotificationLinkApp / notificationLinkIsLocal | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 09 | bulletins-announcements | getBulletinForCurrentUser / getPinnedBulletinsForCurrentUser | MISSING | ADAPT | high | M | ok |  |
| 09 | bulletins-announcements | Participant bulletin page (/bulletins/[id]) | MISSING | ADAPT | high | M | ok |  |
| 09 | bulletins-announcements | Org bulletins list (Sent / Drafts) | PARTIAL | ADAPT | medium | S | ok | GitHub issue WP7 #131 (zero loading.tsx files across 24 force-dynamic pages; no skeleton component) |
| 09 | bulletins-announcements | bulletin-actions test suite (the contract) | MISSING | INSPIRE | high | M | ok |  |
| 09 | bulletins-announcements | markdown-editor test suite | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 09 | bulletins-announcements | bulletins e2e specs (audience reach) | PARTIAL | INSPIRE | medium | M | ok | GitHub issue WP6 #130; DEFERRED.md:76 (test-store.publishBroadcast only models scope='everyone') |
| 09 | bulletins-announcements | notification inbox plumbing (filter tabs, row, format, mark-read) | PARTIAL | ADAPT | medium | S | REFUTED | GitHub issue WP2 #126 (the notifications page skips the isApproved gate every sibling page enforces, apps/web/ |
| 10 | report-feedback-system | report.ts — the reporter's contract (schemas, caps, labels, issue assembly) | PARTIAL | ADAPT | high | M | ok | design/feature-set/25-global-feedback-dialogs.md (documents the as-built contract); WP10 #134 items (h)/(i) |
| 10 | report-feedback-system | report-sanitize.ts — PII redaction kernel with redaction reporting | PARTIAL | ADAPT | high | M | ok |  |
| 10 | report-feedback-system | report-screen.ts — deterministic injection / disclosure / third-party screen | MISSING | COPY | high | S | REFUTED |  |
| 10 | report-feedback-system | createReportHandler — the injectable POST pipeline | PARTIAL | ADAPT | high | M | ok |  |
| 10 | report-feedback-system | github.ts — issue creation with a 7-member failure taxonomy | PARTIAL | ADAPT | medium | S | ok |  |
| 10 | report-feedback-system | GITHUB_LABELS — the code-owned 35-label triage taxonomy | MISSING | ADAPT | medium | S | ok |  |
| 10 | report-feedback-system | labels-sync.ts + setup-github-labels.ts — idempotent label sync | MISSING | ADAPT | low | S | ok |  |
| 10 | report-feedback-system | structure.ts — optional Claude restructuring, fail-to-null | PARTIAL | INSPIRE | medium | S | ok |  |
| 10 | report-feedback-system | transcribe.ts — Groq Whisper dictation endpoint factory | PARTIAL | INSPIRE | medium | S | ok |  |
| 10 | report-feedback-system | client-errors.ts — the recent-errors buffer + environment collector | MISSING | COPY | high | S | ok | WP10 #134 — the reporter half of items (h)/(i); the shake-to-report spec lists diagnostics capture under 'Deli |
| 10 | report-feedback-system | ClientErrorCapture — root-layout mount | MISSING | COPY | high | S | ok |  |
| 10 | report-feedback-system | report-client.ts — submitReport / transcribeRecording / buildDiagnostics / ReportError | PARTIAL | ADAPT | medium | S | ok |  |
| 10 | report-feedback-system | useDictation — MediaRecorder lifecycle with a privacy-safe teardown | PARTIAL | INSPIRE | high | S | ok |  |
| 10 | report-feedback-system | ReportDialog — the reporter (dialog on desktop, sheet on phone) | PARTIAL | ADAPT | high | M | ok | design/feature-set/25-global-feedback-dialogs.md and design/pencil-sections/22-global-feedback-dialogs.md docu |
| 10 | report-feedback-system | ReportLauncher — the bottom-left corner pill + disclosure menu | MISSING | COPY | high | S | REFUTED | WP10 #134 item (h) — 'no manual Report-a-problem entry point (shake is the only trigger, apps/web/app/feedback |
| 10 | report-feedback-system | ReportDiagnosticsPanel — informed-consent disclosure that renders the REAL payload | MISSING | COPY | high | S | ok |  |
| 10 | report-feedback-system | ReportSettingsCard — the disclosure readable without filing anything | MISSING | ADAPT | medium | S | ok |  |
| 10 | report-feedback-system | Report route handlers + report-viewer helpers (the looser-gate pattern) | ALREADY_HAVE | SKIP | medium | S | REFUTED |  |
| 10 | report-feedback-system | consumeRateLimit + action_rate_limit — single-statement fixed-window limiter | MISSING | ADAPT | high | M | ok | docs/superpowers/specs/2026-05-31-shake-to-report-design.md — 'Possible follow-ups (not built): A shared (Upst |
| 10 | report-feedback-system | docs/triage.md — the triage contract for a Claude-routine queue | MISSING | ADAPT | medium | S | ok |  |
| 10 | report-feedback-system | Issue templates + issue-forms.test.ts (the label-drift guard) | MISSING | ADAPT | medium | S | ok |  |
| 10 | report-feedback-system | Coverage ratchet with 100% per-file floors on the privacy core | MISSING | ADAPT | medium | S | ok |  |
| 10 | report-feedback-system | Provider-degradation contract (githubConfigured / structuringConfigured / transcriptionConfigured) | ALREADY_HAVE | INSPIRE | medium | S | ok |  |
| 10 | report-feedback-system | Untrusted-content fencing + provenance line (the 'whose words are these' pattern) | PARTIAL | ADAPT | high | S | ok |  |
| 10 | report-feedback-system | report-server subpath split (server-only code kept out of client bundles) | ALREADY_HAVE | SKIP | low | S | ok |  |
| 10 | report-feedback-system | Report subsystem test suite (2,255 lines, 10 files) | PARTIAL | ADAPT | high | M | ok |  |
| 11 | account-security-surfaces | AccountAuthClient structural interface + clientErrorMessage | MISSING | ADAPT | medium | S | REFUTED |  |
| 11 | account-security-surfaces | AccountTwoFactor — full TOTP enrolment + management card | MISSING | SKIP | medium | XL | ok |  |
| 11 | account-security-surfaces | AccountTwoFactorChallenge — sign-in second-factor step | MISSING | SKIP | low | L | ok |  |
| 11 | account-security-surfaces | AccountPasskeys — WebAuthn registration + management card | MISSING | SKIP | low | XL | ok |  |
| 11 | account-security-surfaces | AccountSessions — active-session list with revocation | MISSING | COPY | high | M | ok |  |
| 11 | account-security-surfaces | AccountSecurityEvents — the security-event feed card | MISSING | ADAPT | medium | M | ok |  |
| 11 | account-security-surfaces | AccountChangePassword — one-field change-password form | MISSING | ADAPT | medium | M | ok |  |
| 11 | account-security-surfaces | AccountSignInMethods — password / Google / passkeys list with last-method rule | MISSING | ADAPT | medium | M | REFUTED |  |
| 11 | account-security-surfaces | AccountShell — the shared account chrome + section nav | PARTIAL | INSPIRE | low | S | ok |  |
| 11 | account-security-surfaces | AccountCapabilityNotice — the honest 'we cannot do this yet' block | MISSING | COPY | medium | S | ok |  |
| 11 | account-security-surfaces | AccountDeleteElsewhere — the Delete tab in an app that does not own deletion | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 11 | account-security-surfaces | assessPassword + PASSWORD_MIN_LENGTH/MAX_LENGTH (NIST SP 800-63B-4 policy) | MISSING | ADAPT | medium | S | ok |  |
| 11 | account-security-surfaces | Enumeration-safe messaging vocabulary + leak detector | MISSING | ADAPT | medium | S | REFUTED |  |
| 11 | account-security-surfaces | Deletion grace-period state machine | MISSING | ADAPT | medium | L | REFUTED | docs/superpowers/specs/2026-05-30-account-deletion-design.md (§Decisions records 'Irreversible, behind an expl |
| 11 | account-security-surfaces | assessDeletionEligibility — the three anti-lockout guards | MISSING | ADAPT | high | M | ok | WP1 (#125) — 'deleteOwnAccount does not block the sole captain, permanently stranding the camp because /setup  |
| 11 | account-security-surfaces | Email-change 48h-revocable state machine | MISSING | SKIP | low | L | ok |  |
| 11 | account-security-surfaces | buildSanitizationPlan + the erase/preserve/purge/identity table lists | PARTIAL | INSPIRE | medium | M | ok | docs/superpowers/specs/2026-05-30-account-deletion-design.md (the shipped sub-project F design) |
| 11 | account-security-surfaces | AUTH_CAPABILITIES matrix + assertCapability + capabilityVerdict | MISSING | ADAPT | high | M | ok |  |
| 11 | account-security-surfaces | describeSecurityEvent + SECURITY_EVENT_TITLES | MISSING | COPY | medium | S | ok |  |
| 11 | account-security-surfaces | Security notification + email builders (maskEmail, securityMessageLeaks) | PARTIAL | ADAPT | medium | M | ok |  |
| 11 | account-security-surfaces | packages/auth/src/account.ts — the framework-free read side | MISSING | REWRITE | high | M | REFUTED |  |
| 11 | account-security-surfaces | parseSetCookies — hand the provider's rotated session cookie back to the browser | MISSING | ADAPT | medium | S | REFUTED |  |
| 11 | account-security-surfaces | withReauth / isReauth — the AsyncLocalStorage re-authentication marker | MISSING | INSPIRE | low | S | ok |  |
| 11 | account-security-surfaces | cancelPendingDeletion — the 'just sign in and it's cancelled' promise | MISSING | ADAPT | medium | M | ok |  |
| 11 | account-security-surfaces | consumeRateLimit + rateLimitIp — a fixed-window limiter for server actions | PARTIAL | ADAPT | high | M | ok | docs/superpowers/specs/2026-05-31-shake-to-report-design.md §Possible follow-ups — 'a shared Upstash-backed ra |
| 11 | account-security-surfaces | Email-change single-use token helpers (newToken/hashToken/tokensMatch) | PARTIAL | SKIP | low | S | ok |  |
| 11 | account-security-surfaces | account-actions.ts — the ten server actions | MISSING | ADAPT | high | L | ok | DEFERRED.md — 'result-object server actions still throw raw on DB errors (only createInviteAction try/catches) |
| 11 | account-security-surfaces | sanitizeAccount + sweepDueDeletions — the erasure runner | PARTIAL | ADAPT | medium | L | ok |  |
| 11 | account-security-surfaces | buildDeletionGuardContext — tombstone-aware guard counting | MISSING | REWRITE | high | S | REFUTED | WP1 (#125) — the data half of the sole-captain deletion guard |
| 11 | account-security-surfaces | Deletion-sweep cron route | PARTIAL | ADAPT | medium | S | ok |  |
| 11 | account-security-surfaces | /account/security page — the assembly | MISSING | ADAPT | high | M | ok |  |
| 11 | account-security-surfaces | /account/delete page + DeleteAccountForm + CancelDeletionButton | PARTIAL | ADAPT | high | M | ok | WP1 (#125) sole-captain deletion guard; WP3 (#127) captain-promotion accept/decline surface (the transfer deep |
| 11 | account-security-surfaces | Forgot-password and reset-password forms | MISSING | INSPIRE | low | M | ok |  |
| 11 | account-security-surfaces | PasswordInput + passwordStrength | MISSING | COPY | medium | S | ok |  |
| 11 | account-security-surfaces | Field — label / control / help / error wrapper | PARTIAL | ADAPT | low | S | ok |  |
| 11 | account-security-surfaces | Skeleton suite (9 exports) + the account loading.tsx | MISSING | COPY | high | M | ok | WP7 (#131) — 'ZERO loading.tsx files exist across 24 force-dynamic pages' |
| 11 | account-security-surfaces | Account route error boundary + ErrorRecovery frame | MISSING | ADAPT | high | S | ok | WP7 (#131) — 'exactly one error boundary exists so any nested captain-route failure nukes the whole chrome' |
| 11 | account-security-surfaces | The account-suite test corpus | MISSING | INSPIRE | medium | M | ok |  |
| 11 | account-security-surfaces | Coverage-ratchet configuration for the erasure-critical files | MISSING | ADAPT | medium | M | ok |  |
| 11 | account-security-surfaces | The 'account routes sit outside the app gate' route-group pattern | MISSING | ADAPT | high | S | ok |  |
| 11 | account-security-surfaces | Auth email seam (sendAuthEmail / sendSingleEmail) + AuthEmailKind | MISSING | INSPIRE | low | M | ok |  |
| 11 | account-security-surfaces | AUTH_SESSION lifetime constants + resolveRateLimit | PARTIAL | INSPIRE | medium | S | REFUTED |  |
| 11 | account-security-surfaces | Provider-configuration DECISIONS worth copying (not the wiring) | NOT_APPLICABLE | INSPIRE | medium | S | ok |  |
| 11 | account-security-surfaces | E2E specs for the account suite | MISSING | INSPIRE | medium | M | ok | docs/e2e-true-auth.md (unbuilt: no playwright.auth.config.ts, no tests/e2e-auth/, no test:e2e:auth script) |
| 12 | privacy-pii-retention | decryptField + DecryptedField tri-state | MISSING | COPY | high | S | ok |  |
| 12 | privacy-pii-retention | privacy.ts — two privacy classes with a derived union | MISSING | REWRITE | medium | M | ok |  |
| 12 | privacy-pii-retention | BIO_PRIVACY_FIELDS registry + defaultPrivacyFlags/initialPrivacyFlags/resolvePrivacyFlagsUpdate | MISSING | INSPIRE | low | L | ok |  |
| 12 | privacy-pii-retention | publicBioView — the double-gated public projection | PARTIAL | INSPIRE | medium | S | ok |  |
| 12 | privacy-pii-retention | PrivacyToggles list control | MISSING | ADAPT | low | S | ok |  |
| 12 | privacy-pii-retention | Switch variant="privacy" with hardLocked | PARTIAL | ADAPT | low | S | ok |  |
| 12 | privacy-pii-retention | medical-access.ts — the safety-visible read predicate | NOT_APPLICABLE | INSPIRE | medium | M | ok | WP5 (#129) — 'Emergency contacts (safety-critical) never surfaced to captains' |
| 12 | privacy-pii-retention | resolveMedicalNotesForViewer — authorise → decrypt → after() audit | MISSING | REWRITE | medium | L | ok | WP5 (#129) |
| 12 | privacy-pii-retention | getRosterMemberDetail — authorise-before-select | PARTIAL | ADAPT | high | S | ok |  |
| 12 | privacy-pii-retention | medical unreadable UI branch (role=alert) | MISSING | ADAPT | medium | S | ok |  |
| 12 | privacy-pii-retention | medical-audit.ts — the audit-trail READER and the census argument | NOT_APPLICABLE | INSPIRE | low | M | ok |  |
| 12 | privacy-pii-retention | id-retention.ts — POPIA storage limitation as a pure rule | MISSING | ADAPT | medium | M | ok |  |
| 12 | privacy-pii-retention | account-sanitization.ts — the pure 'Lost Cat' erasure plan | PARTIAL | ADAPT | high | M | ok | docs/superpowers/specs/2026-05-30-account-deletion-design.md (built; 'Deferred' section names captain-initiate |
| 12 | privacy-pii-retention | assertNotSanitized — the resurrection guard | MISSING | INSPIRE | medium | S | ok | docs/superpowers/specs/2026-05-30-account-deletion-design.md ('Sever authUserId so the anonymised row can't be |
| 12 | privacy-pii-retention | publicMemberName — the tombstone-aware render fallback | PARTIAL | INSPIRE | low | S | ok |  |
| 12 | privacy-pii-retention | account-security.ts deletion half — 14-day grace state machine + three guards | MISSING | ADAPT | high | M | ok | WP1 (#125) — 'Block deleteOwnAccount when caller is sole captain, require hand-off first (profile/actions.ts:5 |
| 12 | privacy-pii-retention | sanitizeAccount — the transactional erasure runner | PARTIAL | INSPIRE | medium | L | ok |  |
| 12 | privacy-pii-retention | cancelPendingDeletion — the 'just sign in' promise | MISSING | INSPIRE | medium | M | ok |  |
| 12 | privacy-pii-retention | deletion-sweep route — fail-closed destructive cron | PARTIAL | ADAPT | medium | S | ok |  |
| 12 | privacy-pii-retention | encryptOrPreserve — never destroy ciphertext you merely could not read | MISSING | ADAPT | high | S | ok |  |
| 12 | privacy-pii-retention | Refuse-don't-drop + no-plaintext-lock-box guards | PARTIAL | ADAPT | medium | S | ok |  |
| 12 | privacy-pii-retention | crypto-guard.ts — isCryptoConfigured / safeEncrypt | MISSING | COPY | medium | S | ok |  |
| 12 | privacy-pii-retention | keys.ts — ECDSA P-256 keypair + human-comparable fingerprint | NOT_APPLICABLE | SKIP | low | M | ok |  |
| 12 | privacy-pii-retention | report-sanitize.ts — redaction before a public GitHub issue | PARTIAL | ADAPT | high | M | ok | docs/superpowers/specs/2026-05-31-shake-to-report-design.md (shipped; the two repos' redactors are siblings) |
| 12 | privacy-pii-retention | account/delete page — honest consequences UI | PARTIAL | ADAPT | high | M | ok | WP1 (#125) — sole-captain deletion guard |
| 12 | privacy-pii-retention | requestAccountDeletion / cancelAccountDeletion server actions | PARTIAL | REWRITE | medium | M | ok | design/spec/open-questions.md D8 — 'Profile-edit gating asymmetry … a user who became pending/rejected can sti |
| 12 | privacy-pii-retention | security-notifications deletion emails + maskEmail | MISSING | INSPIRE | low | M | ok |  |
| 12 | privacy-pii-retention | schema-invariants test — encrypted-column guard | MISSING | ADAPT | high | S | ok |  |
| 12 | privacy-pii-retention | roster-privacy source-text regression test | PARTIAL | ADAPT | medium | S | ok |  |
| 12 | privacy-pii-retention | per-file coverage ratchets on the privacy/safety core | MISSING | ADAPT | medium | M | ok |  |
| 12 | privacy-pii-retention | encryptionCheck — probe, never print the secret | MISSING | INSPIRE | low | M | ok |  |
| 12 | privacy-pii-retention | grace_ends_at / revocable_until — store the promised deadline | MISSING | COPY | medium | S | ok |  |
| 12 | privacy-pii-retention | partial unique index for 'one live X per user' | MISSING | COPY | medium | S | REFUTED |  |
| 12 | privacy-pii-retention | audit_events meta PII scrub (SQL) | NOT_APPLICABLE | INSPIRE | low | S | ok |  |
| 13 | db-layer-patterns | consumeRateLimit — single-statement fixed-window limiter | PARTIAL | ADAPT | high | S | ok | docs/superpowers/specs/2026-05-31-shake-to-report-design.md:84 ("A shared (Upstash-backed) rate limiter — toda |
| 13 | db-layer-patterns | action_rate_limit table (own table, not a Better Auth namespace) | MISSING | COPY | high | S | ok | docs/superpowers/specs/2026-05-31-shake-to-report-design.md:84 |
| 13 | db-layer-patterns | planMigration / isPoolerConnection / connectionHost | MISSING | INSPIRE | low | S | ok |  |
| 13 | db-layer-patterns | runDeployMigrations — advisory-locked deploy-time runner | MISSING | INSPIRE | low | M | ok |  |
| 13 | db-layer-patterns | configureLocalProxy — point both Neon drivers at local proxies | PARTIAL | ADAPT | medium | S | ok |  |
| 13 | db-layer-patterns | docker-compose.local.yml — Postgres 16 + TWO Neon proxies | MISSING | ADAPT | medium | S | ok | docs/e2e-true-auth.md (unbuilt — no playwright.auth.config.ts, no tests/e2e-auth/, no test:e2e:auth script); A |
| 13 | db-layer-patterns | createHttpDb / createPooledDb + the NEON_LOCAL_PROXY transport switch | PARTIAL | ADAPT | low | S | ok |  |
| 13 | db-layer-patterns | sqlLogger — opt-in greppable per-statement SQL logging | MISSING | COPY | medium | S | ok | WP7 (#131) — loading/error boundaries across 24 force-dynamic pages, including the Promise.all finding on the  |
| 13 | db-layer-patterns | createFakeDb — recording drizzle stand-in test harness | MISSING | COPY | medium | S | ok |  |
| 13 | db-layer-patterns | schema-invariants.test.ts — sweep over every exported PgTable | MISSING | ADAPT | high | S | ok |  |
| 13 | db-layer-patterns | Source-text assertion pattern (upsert targetWhere / seeded-id contract) | MISSING | INSPIRE | medium | S | REFUTED |  |
| 13 | db-layer-patterns | The seeding law + ensure* idempotency discipline | PARTIAL | INSPIRE | medium | S | ok |  |
| 13 | db-layer-patterns | crypto.ts — AES-256-GCM + the DecryptedField tri-state | PARTIAL | ADAPT | medium | S | ok | WP5 (#129) — roster data, which surfaces emergency contacts and captain-visible PII; DEFERRED.md's 'captain/ow |
| 13 | db-layer-patterns | cancelPendingDeletion — two id spaces + concurrency-guarded cancel | MISSING | REWRITE | medium | L | ok | WP1 (#125) — sole-captain deletion guard ('permanently stranding the camp because /setup latches shut after bo |
| 13 | db-layer-patterns | account_deletion_requests / email_change_requests / security_events tables | MISSING | ADAPT | low | M | ok |  |
| 13 | db-layer-patterns | Partial-index and expression-index patterns (incl. the 0028 NULLS-are-distinct trap) | PARTIAL | INSPIRE | medium | S | ok |  |
| 13 | db-layer-patterns | Append-only migration discipline + a corrective migration | ALREADY_HAVE | SKIP | low | S | ok |  |
| 13 | db-layer-patterns | vitest coverage configuration + the schema.ts exclusion rationale | MISSING | ADAPT | high | M | ok |  |
| 13 | db-layer-patterns | Test hygiene: per-file timeout + process-global snapshotting | PARTIAL | INSPIRE | medium | S | REFUTED |  |
| 13 | db-layer-patterns | apps/web/lib/db.ts — the per-app handle and the derived Tx type | PARTIAL | ADAPT | medium | S | ok |  |
| 13 | db-layer-patterns | /system panel: deriveSystemStatus (pure) + probeDatabase (impure) | MISSING | REWRITE | high | M | ok | DEFERRED.md §Operator actions (config, not code), lines 80-85 — four outstanding operator steps, including 'se |
| 13 | db-layer-patterns | deletion-sweep cron route — timing-safe dual-secret auth for a destructive job | PARTIAL | ADAPT | medium | S | REFUTED | WP10 (#134) — 'implement the reminders cron (currently a {sent:0} stub)' |
| 13 | db-layer-patterns | scripts/e2e-local.sh — the full local stack runner | MISSING | INSPIRE | low | M | ok | docs/e2e-true-auth.md (unbuilt); AGENTS.md:133 (e2e disabled pending a preview deployment) |
| 13 | db-layer-patterns | packages/db package.json scripts and export surface | PARTIAL | ADAPT | medium | S | ok |  |
| 13 | db-layer-patterns | @quagga/db barrel — what is exported and what is deliberately not | PARTIAL | INSPIRE | low | S | ok |  |
| 13 | db-layer-patterns | Questionnaire spine as re-imported from Camp 404 (with the donor's additions) | ALREADY_HAVE | SKIP | low | S | ok |  |
| 14 | ui-component-library | ResponsiveDataTable + projectColumnsToCard | PARTIAL | ADAPT | high | M | REFUTED | GitHub WP5 (#129) roster data / WP9 (#133) roster operations — column sort and CSV export both want a real col |
| 14 | ui-component-library | Table primitives | MISSING | COPY | medium | S | ok |  |
| 14 | ui-component-library | Skeleton kit (8 primitives) | MISSING | COPY | high | S | ok | GitHub WP7 (#131) — 'ZERO loading.tsx files exist across 24 force-dynamic pages' |
| 14 | ui-component-library | Route boundary pattern — 34 loading.tsx + 10 error.tsx + ErrorRecovery + dependency-free global-error | PARTIAL | ADAPT | high | M | ok | GitHub WP7 (#131) — loading.tsx across 24 force-dynamic pages, scoped route error boundaries |
| 14 | ui-component-library | AccountAuthClient — the provider-agnostic auth DI seam | MISSING | SKIP | low | S | REFUTED |  |
| 14 | ui-component-library | AccountTwoFactor — TOTP enrolment card | MISSING | SKIP | low | L | REFUTED |  |
| 14 | ui-component-library | AccountTwoFactorChallenge — sign-in second factor | MISSING | SKIP | low | M | REFUTED |  |
| 14 | ui-component-library | AccountPasskeys — WebAuthn passkey management | MISSING | SKIP | low | L | REFUTED |  |
| 14 | ui-component-library | AccountSessions — active session list + revocation | MISSING | INSPIRE | medium | M | REFUTED |  |
| 14 | ui-component-library | AccountSecurityEvents — security-event feed | MISSING | ADAPT | medium | M | REFUTED | docs/telegram-bot-proposal.md §Outstanding item 6 (audit_log entries); design/feature-set-verification-report. |
| 14 | ui-component-library | AccountChangePassword — injected-policy password form | MISSING | SKIP | low | M | REFUTED |  |
| 14 | ui-component-library | AccountSignInMethods — password/Google/passkey inventory | MISSING | SKIP | low | M | REFUTED |  |
| 14 | ui-component-library | AccountCapabilityNotice — the honest 'we can't do this yet' block | MISSING | COPY | high | S | ok | GitHub WP10 (#134) — the 8 comingSoon tiles with no reason surfaced; DEFERRED.md §Operator actions (push inert |
| 14 | ui-component-library | AccountShell — account chrome + section nav | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 14 | ui-component-library | Field — label · control · help · error wrapper with a privacyToggle slot | PARTIAL | ADAPT | high | S | REFUTED |  |
| 14 | ui-component-library | form-logic — countWords / wordCountStatus / passwordStrength | PARTIAL | ADAPT | medium | S | ok |  |
| 14 | ui-component-library | wizard (lib) — deriveWizardProgress + Wizard component | PARTIAL | ADAPT | medium | S | ok | GitHub WP8 (#132) — 'wizard steps never reset scroll/focus' |
| 14 | ui-component-library | PasswordInput — one field, show/hide, length-only strength meter | MISSING | SKIP | low | S | ok |  |
| 14 | ui-component-library | TextareaWithCount — word-counted textarea | MISSING | ADAPT | medium | S | ok |  |
| 14 | ui-component-library | AckRow — the ≥44px acknowledgement checkbox row | MISSING | ADAPT | medium | S | ok |  |
| 14 | ui-component-library | Switch privacy variant + hardLocked | MISSING | REWRITE | medium | M | ok |  |
| 14 | ui-component-library | PhoneInput — international phone entry, E.164 out | MISSING | SKIP | low | M | ok |  |
| 14 | ui-component-library | FileUpload — Vercel Blob client upload with progress + URL-paste fallback | PARTIAL | INSPIRE | medium | L | ok | GitHub WP10 (#134) item (i) — no screenshot attach on the bug dialog (board S22) |
| 14 | ui-component-library | MarkdownEditor + MarkdownView + markdownExtensions + roundTripMarkdown | MISSING | SKIP | low | L | ok |  |
| 14 | ui-component-library | ReportLauncher — the corner Report pill | MISSING | ADAPT | high | S | ok | GitHub WP10 (#134) item (h) — 'no manual Report a problem entry point (shake is the only trigger, apps/web/app |
| 14 | ui-component-library | ReportDialog — the reporter | PARTIAL | INSPIRE | medium | M | ok |  |
| 14 | ui-component-library | ReportDiagnosticsPanel — consent-before-send disclosure | MISSING | ADAPT | medium | M | REFUTED | GitHub WP10 (#134) items (h)/(i) — the reporter build-out |
| 14 | ui-component-library | ReportSettingsCard — the reporter's settings entry | MISSING | ADAPT | medium | S | ok |  |
| 14 | ui-component-library | client-errors — the recent-error buffer | MISSING | ADAPT | medium | M | ok |  |
| 14 | ui-component-library | report-client — submitReport / transcribeRecording / buildDiagnostics / ReportError | PARTIAL | INSPIRE | low | M | REFUTED |  |
| 14 | ui-component-library | useDictation — microphone capture hook | ALREADY_HAVE | INSPIRE | high | S | ok |  |
| 14 | ui-component-library | AudienceSelect — audience picker with a resolved recipient count | MISSING | ADAPT | high | M | ok | GitHub WP6 (#130) — 'zero-audience protection on sends'; WP4 (#128) questionnaire delivery |
| 14 | ui-component-library | NotificationItem + NOTIFICATION_KIND_ICON | ALREADY_HAVE | INSPIRE | low | S | ok |  |
| 14 | ui-component-library | NotificationBell | ALREADY_HAVE | INSPIRE | low | S | ok |  |
| 14 | ui-component-library | BulletinCard + readRate | MISSING | ADAPT | medium | S | ok |  |
| 14 | ui-component-library | PinnedBulletinBanner | MISSING | COPY | low | S | ok |  |
| 14 | ui-component-library | DisabledHintTile — the honest 'parked capability' tile | PARTIAL | ADAPT | high | S | ok | GitHub WP10 (#134) — the comingSoon tiles; WP11 (#135) — CaptainLock renders as a generic EmptyState instead o |
| 14 | ui-component-library | StatusBadge + REGISTRATION_STATUS_VARIANT/LABEL | PARTIAL | INSPIRE | medium | S | ok |  |
| 14 | ui-component-library | RoleBadge / RoleSwatch + the two-theme tinting technique | PARTIAL | INSPIRE | low | S | ok |  |
| 14 | ui-component-library | PaymentDetailsBlock | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 14 | ui-component-library | Accordion / Tabs / ToggleGroup — the three extra Radix wrappers | PARTIAL | ADAPT | low | S | ok |  |
| 14 | ui-component-library | QuiltBand — AfrikaBurn identity motif | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 14 | ui-component-library | AccountDeleteElsewhere | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 14 | ui-component-library | Toast store + Toaster | ALREADY_HAVE | COPY | low | S | REFUTED | design/spec/impl/build-coverage-audit.md — 25-toast has no 'Saved · Undo' action slot (restated by WP11 #135) |
| 14 | ui-component-library | vitest config with a coverage ratchet + measured timeouts, and vitest.setup jsdom stubs | PARTIAL | ADAPT | medium | M | ok |  |
| 14 | ui-component-library | globals.css base-layer behaviours (cursor restoration, date-picker invert) | PARTIAL | ADAPT | medium | S | ok | GitHub WP8 (#132) — app-wide prefers-reduced-motion strategy (the same @layer base is where it belongs) |
| 15 | forms-tables-wizard-primitives | ResponsiveDataTable + projectColumnsToCard | PARTIAL | COPY | high | M | ok | WP9 (#133) — column sort + CSV export on the roster; questionnaire-builder Phase E responses table (docs/quest |
| 15 | forms-tables-wizard-primitives | deriveWizardProgress (pure wizard state machine) | MISSING | COPY | medium | S | ok |  |
| 15 | forms-tables-wizard-primitives | Wizard (rail / strip section navigator) | PARTIAL | ADAPT | low | S | ok | WP8 (#132) — 'wizard steps never reset scroll/focus (wizard.tsx:116)' |
| 15 | forms-tables-wizard-primitives | form-logic: countWords / wordCountStatus / passwordStrength | MISSING | ADAPT | medium | S | ok |  |
| 15 | forms-tables-wizard-primitives | useDictation (microphone hook) | PARTIAL | INSPIRE | high | S | ok |  |
| 15 | forms-tables-wizard-primitives | transcribeRecording (dictation transport seam) | PARTIAL | SKIP | low | S | ok |  |
| 15 | forms-tables-wizard-primitives | FileUpload (Vercel Blob client uploads + URL-paste fallback) | MISSING | ADAPT | medium | M | ok | WP10 (#134) — 'no screenshot attach on the bug dialog (board S22)'; the documents + reimbursements domains hav |
| 15 | forms-tables-wizard-primitives | Blob client-upload token route (server boundary for FileUpload) | PARTIAL | ADAPT | medium | M | ok |  |
| 15 | forms-tables-wizard-primitives | Skeleton kit (9 loading primitives) | MISSING | COPY | high | M | ok | WP7 (#131) — 'ZERO loading.tsx files exist across 24 force-dynamic pages' |
| 15 | forms-tables-wizard-primitives | ErrorRecovery + NotFoundView (shared boundary panels) | PARTIAL | ADAPT | high | M | ok | WP7 (#131) — 'exactly one error boundary exists (apps/web/app/error.tsx) so any nested captain-route query fai |
| 15 | forms-tables-wizard-primitives | MarkdownEditor + MarkdownView + markdownExtensions + roundTripMarkdown | MISSING | SKIP | low | L | ok |  |
| 15 | forms-tables-wizard-primitives | Field (label · control · help · error wrapper) | PARTIAL | ADAPT | medium | S | ok |  |
| 15 | forms-tables-wizard-primitives | TextareaWithCount | MISSING | ADAPT | low | S | ok |  |
| 15 | forms-tables-wizard-primitives | PasswordInput (single field, show/hide, length-only strength meter) | MISSING | ADAPT | medium | S | ok |  |
| 15 | forms-tables-wizard-primitives | PhoneInput (international, E.164 out) | PARTIAL | SKIP | low | M | ok |  |
| 15 | forms-tables-wizard-primitives | ToggleGroup / ToggleGroupItem / toggleVariants | PARTIAL | SKIP | low | S | ok |  |
| 15 | forms-tables-wizard-primitives | Table primitives (shadcn new-york) | MISSING | COPY | high | S | ok | WP9 (#133) — column sort + CSV export; questionnaire-builder Phase E responses table |
| 15 | forms-tables-wizard-primitives | Tabs | MISSING | COPY | low | S | ok |  |
| 15 | forms-tables-wizard-primitives | Accordion | MISSING | COPY | low | S | REFUTED |  |
| 15 | forms-tables-wizard-primitives | AudienceSelect | PARTIAL | ADAPT | high | M | ok | WP6 (#130) — 'zero-audience protection on sends'; WP12 (#136) — a writer for non-'everyone' broadcast scopes |
| 15 | forms-tables-wizard-primitives | DisabledHintTile | PARTIAL | INSPIRE | medium | S | ok |  |
| 15 | forms-tables-wizard-primitives | EmptyState (with an `action` slot) | ALREADY_HAVE | SKIP | low | S | ok |  |
| 15 | forms-tables-wizard-primitives | StatusBadge + REGISTRATION_STATUS_VARIANT/LABEL maps | PARTIAL | INSPIRE | medium | S | ok |  |
| 15 | forms-tables-wizard-primitives | QuiltBand | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 15 | forms-tables-wizard-primitives | Toast store + Toaster | ALREADY_HAVE | SKIP | low | S | ok | WP11 (#135) — '25-toast has no "Saved · Undo" action slot' |
| 15 | forms-tables-wizard-primitives | Dialog / Popover / Select (shared, near-identical to Camp 404) | ALREADY_HAVE | SKIP | low | S | ok |  |
| 15 | forms-tables-wizard-primitives | Registration wizard autosave engine (saveNow / update / commit) | MISSING | ADAPT | high | M | ok |  |
| 15 | forms-tables-wizard-primitives | Section-completeness predicate table | ALREADY_HAVE | SKIP | low | S | ok |  |
| 15 | forms-tables-wizard-primitives | ConsoleHeadingSkeleton / ConsoleTableSkeleton (app-level skeleton vocabulary) | MISSING | ADAPT | medium | S | ok | WP7 (#131) |
| 15 | forms-tables-wizard-primitives | createTranscribeHandler (dictation server half) | PARTIAL | ADAPT | medium | S | ok |  |
| 15 | forms-tables-wizard-primitives | AccountsTable / RegistrationsTable / SuppliersTable / DocumentsTable (ResponsiveDataTable reference call sites) | NOT_APPLICABLE | INSPIRE | low | S | ok | WP9 (#133) — column sort, CSV export, bulk approve |
| 15 | forms-tables-wizard-primitives | UI test conventions + coverage ratchet config | MISSING | ADAPT | medium | M | ok |  |
| 16 | registration-state-machine | REGISTRATION_TRANSITIONS + assertRegistrationTransition | NOT_APPLICABLE | INSPIRE | medium | S | ok | WP9 (#133) — roster operations: decision reversal |
| 16 | registration-state-machine | CAMP_ACTIONS + resolveCampAction / canCampSubmit / canCampWithdraw | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 16 | registration-state-machine | SECTION_REVIEW_TRANSITIONS + canReplyToSectionReview | MISSING | INSPIRE | low | M | ok | WP9 (#133) — captain notes on a member |
| 16 | registration-state-machine | Entitlements + the two-form submit gate (isRegistered / isSubmittable / missingSections) | PARTIAL | SKIP | low | S | ok |  |
| 16 | registration-state-machine | Per-section completeness predicates (isSectionComplete / completedSectionsFor) | NOT_APPLICABLE | INSPIRE | low | M | ok |  |
| 16 | registration-state-machine | canRedeemInvite / canRedeemInviteAs / inviteRejectionMessage | PARTIAL | ADAPT | medium | S | ok |  |
| 16 | registration-state-machine | resolveInviteView — the four-state invite landing resolver | NOT_APPLICABLE | INSPIRE | low | M | ? |  |
| 16 | registration-state-machine | Pending-invite round-trip constants + token grammar (cookie name, TTL, resume path, INVITE_TOKEN_PATTERN) | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 16 | registration-state-machine | inviteExpiryLabel | MISSING | COPY | low | S | ok | WP10 (#134) — invite revoke + 'my invites' list |
| 16 | registration-state-machine | Hard-gate spine — firstBlockingAction / RequiredActionLike / BURNER_BIO_ACTION_KEY / isParticipantFacingActivation | ALREADY_HAVE | SKIP | low | S | ok |  |
| 16 | registration-state-machine | Activation → required_actions key convention + row builders (buildActivationRequiredActions, tallyActivationCompletion, resolveActivationDefinition) | PARTIAL | ADAPT | medium | M | ok | docs/questionnaire-builder.md §9 Phase E (metrics + responses table); WP10 (#134) — questionnaire response rea |
| 16 | registration-state-machine | actionRoute / ensureRequiredAction / completeRequiredAction / listRequiredActions (the gate query that RELEASES on activation close) | PARTIAL | ADAPT | high | S | REFUTED | WP4 (#128) — questionnaire delivery |
| 16 | registration-state-machine | pendingBlockingRoute / enforceGate / viewerIsGated / requireOnboardedUser | PARTIAL | ADAPT | high | M | ok | DEFERRED.md — 'Redirect-ladder consolidation'; WP2 (#126) — shared required-actions gate helper |
| 16 | registration-state-machine | ensureCampUser — first-authenticated-request provisioning with a re-animation guard | PARTIAL | ADAPT | medium | S | ok |  |
| 16 | registration-state-machine | bootstrapGod + canBootstrapGod (verified-email gate) | PARTIAL | ADAPT | high | S | REFUTED | docs/first-time-setup.md:86-87 — god-email deprecation follow-up |
| 16 | registration-state-machine | setPendingInvite / readPendingInvite / clearPendingInvite (httpOnly SameSite=Lax cookie) | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 16 | registration-state-machine | acceptInviteAction — one entry point for every viewer state | NOT_APPLICABLE | SKIP | low | M | ok |  |
| 16 | registration-state-machine | confirmInviteJoinAction + /join/continue — confirm-before-write resume | NOT_APPLICABLE | INSPIRE | low | M | ok | WP12 (#136) — audit the entire apps/web/app/api/* layer |
| 16 | registration-state-machine | completeInviteJoin — the single join completion point | ALREADY_HAVE | SKIP | low | S | ok |  |
| 16 | registration-state-machine | redeemInvite — atomic single-use claim + membership in one transaction | PARTIAL | ADAPT | medium | S | ok |  |
| 16 | registration-state-machine | createInvite / revokeInvite / listInvites / getInvitePreview / previewAsInviteLike | PARTIAL | ADAPT | high | M | REFUTED | WP10 (#134) — 'no invite revoke path or my-invites list' |
| 16 | registration-state-machine | applyCampAction — the camp-side transition writer with a TOCTOU guard | MISSING | ADAPT | high | S | ok | WP1 (#125) — decideApprovalAction has no stale/racing-decision guard |
| 16 | registration-state-machine | saveRegistrationDraft — autosave persistence with server-recomputed completeness | NOT_APPLICABLE | INSPIRE | medium | M | ok | WP6 (#130) — team_memberships production write path |
| 16 | registration-state-machine | decideRegistration — reviewer decision with atomic audit + post-commit notification | MISSING | ADAPT | high | M | ok | WP1 (#125) — approval race guard; WP9 (#133) — decision reversal + captain notes |
| 16 | registration-state-machine | REVIEW_ACTIONS / REVIEW_ACTION_TARGET / resolveReviewActionPath | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 16 | registration-state-machine | addSectionReview / setSectionReviewStatus + replyToSectionReviewAction | MISSING | INSPIRE | medium | L | ok | WP2 (#126) — server-side authz gates |
| 16 | registration-state-machine | getSectionReviews — camp-visible threads with author-label resolution | NOT_APPLICABLE | SKIP | low | M | ok |  |
| 16 | registration-state-machine | RegistrationWizard — the autosave engine (joinable loop-until-clean flush) | PARTIAL | ADAPT | medium | M | ok |  |
| 16 | registration-state-machine | Wizard UI primitive + deriveWizardProgress (rail / strip, done/current/todo/blocked) | MISSING | COPY | medium | S | ok | design/spec/impl/app/24-questionnaire-runner.md |
| 16 | registration-state-machine | field-kit — 10 controlled form primitives with onCommit-on-blur | PARTIAL | ADAPT | medium | M | REFUTED | WP8 (#132) — motion & a11y; design/spec/impl/app/20-field-renderer.md |
| 16 | registration-state-machine | withdrawConsequence + WithdrawRegistrationButton (pure consequence copy; refused controls stay visible + disabled with the reason) | MISSING | ADAPT | high | S | ? | WP1 (#125) — destructive-action safety (18 findings) |
| 16 | registration-state-machine | ReopenRegistrationButton | NOT_APPLICABLE | INSPIRE | low | S | ok |  |
| 16 | registration-state-machine | RegistrationSummary — STATUS_BANNER table + locked read-only view | MISSING | INSPIRE | low | M | ok |  |
| 16 | registration-state-machine | SectionReplyThread | NOT_APPLICABLE | SKIP | low | M | ok |  |
| 16 | registration-state-machine | CampInvites — the lead-side invite manager (mint / copy / revoke, optimistic, injected actions) | MISSING | ADAPT | high | M | ok | WP10 (#134) — 'no invite revoke path or my-invites list' |
| 16 | registration-state-machine | JoinButton (useFormStatus, server-redirect, JS-disabled-safe) | ALREADY_HAVE | SKIP | low | S | ? |  |
| 16 | registration-state-machine | MemberRefCode — copy-to-clipboard reference code, banner + inline chip | PARTIAL | ADAPT | low | S | ok |  |
| 16 | registration-state-machine | Member reference codes (MAH-M017) — derive / disambiguate / format / parse / next sequence | MISSING | ADAPT | medium | M | ? | WP10 (#134) — dues write path + Finances UI |
| 16 | registration-state-machine | nextMemberRefCode + ensureMembershipWithRefCode (savepoint retry) | NOT_APPLICABLE | INSPIRE | low | M | ok |  |
| 16 | registration-state-machine | Camp-name dedupe (normalizeName / trigramSimilarity / SIMILARITY_WARN_THRESHOLD) | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 16 | registration-state-machine | checkCampName / createCampAction — reject-exact, warn-similar, confirm-to-proceed | NOT_APPLICABLE | INSPIRE | medium | S | REFUTED | WP1 (#125) — reject breaking edits to published fields with responses |
| 16 | registration-state-machine | Username rules + publicMemberName (90-entry reserved list, one-thing-per-message errors, no third fallback) | NOT_APPLICABLE | INSPIRE | low | L | ? |  |
| 16 | registration-state-machine | checkUsernameAvailabilityAction — a hardened public availability endpoint | PARTIAL | ADAPT | medium | S | REFUTED | DEFERRED.md — 'Invite-code case handling' |
| 16 | registration-state-machine | Username lost-race handling on save (same sentence for the pre-check and the unique-violation) | MISSING | COPY | medium | S | ? |  |
| 16 | registration-state-machine | Form-2 answer → registration column mirror (FORM_2_FIELD_MAP + report what could not be placed) | NOT_APPLICABLE | INSPIRE | medium | M | ? |  |
| 16 | registration-state-machine | Project (MV / artwork) registration on the same spine, namespaced jsonb key format | NOT_APPLICABLE | INSPIRE | medium | L | ok | WP10 (#134) — build on the orphaned tasks table |
| 16 | registration-state-machine | registrationDecisionNotification | MISSING | ADAPT | high | S | ok | WP9 (#133) — roster operations |
| 16 | registration-state-machine | Zod value-schema + describeInvalidValues named-field failure messages for autosave | PARTIAL | ADAPT | medium | S | ok | DEFERRED.md — 'Server-side validation on non-final questionnaire saves' |
| 16 | registration-state-machine | requireCampAdmin — the shared per-action authz gate returning a discriminated result | PARTIAL | ADAPT | high | M | ok | WP2 (#126) — server-side authz gates (14 findings) |
| 16 | registration-state-machine | AckRow — whole-row acknowledgement checkbox (≥44px touch target) | MISSING | ADAPT | medium | S | ok | WP11 (#135) — multi_select card treatment |
| 16 | registration-state-machine | LayoutUploads — max-4 image field over a shared FileUpload primitive | MISSING | ADAPT | medium | M | ok | WP10 (#134) — screenshot attach on the bug dialog (board S22) |
| 16 | registration-state-machine | Gated upload route (403 instead of redirect) | PARTIAL | COPY | high | S | ok | WP2 (#126) — server-side authz gates; WP12 (#136) — the api layer was never audited |
| 16 | registration-state-machine | (app) layout gate-aware chrome (viewerIsGated once in the route-group layout) | MISSING | ADAPT | medium | M | ? | DEFERRED.md — 'Redirect-ladder consolidation'; WP7 (#131) — loading/error boundaries |
| 16 | registration-state-machine | Invite landing page (NotFoundCard / SpentCard / InviteCard, one form) | NOT_APPLICABLE | SKIP | low | L | ok |  |
| 16 | registration-state-machine | Onboarding gate page with invite-aware redirect | PARTIAL | SKIP | low | S | ok |  |
| 16 | registration-state-machine | TOCTOU compare-and-set as a house pattern | MISSING | COPY | high | S | REFUTED | WP1 (#125) — destructive-action safety |
| 16 | registration-state-machine | decision_reason invariant (the reason belongs to the state it was said about) | NOT_APPLICABLE | INSPIRE | medium | S | ? |  |
| 16 | registration-state-machine | Registration state-machine test suite (incl. the property test over the table) | PARTIAL | ADAPT | medium | S | ok |  |
| 16 | registration-state-machine | Invite + gate test suites (unit, DB-free, hand-rolled drizzle mocks) | PARTIAL | ADAPT | medium | M | ? | docs/db-integration-tests via the PGlite harness (memory: db-integration-tests-pglite) |
| 16 | registration-state-machine | Gate e2e specs (no DB back doors; assert PRESENT before asserting absent) | NOT_APPLICABLE | INSPIRE | medium | L | ? | docs/e2e-true-auth.md — true-auth E2E suite (not built) |
| 16 | registration-state-machine | Word count + camp description limit (countWords / wordsRemaining) | MISSING | COPY | low | S | ok |  |
| 16 | registration-state-machine | SOUND_SCALE + isNoAmplifiedSound | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 16 | registration-state-machine | getPlacementZones (per-edition-year catalogue in code with a fallback) | ALREADY_HAVE | SKIP | low | S | ? |  |
| 16 | registration-state-machine | getActiveEdition / getEditionLabel (request-cached, never-throwing display label) | NOT_APPLICABLE | SKIP | low | S | ? |  |
| 16 | registration-state-machine | createInviteAction / revokeInviteAction (rank-gated, with a stricter second check for the privilege-transferring kind) | PARTIAL | ADAPT | high | S | ok | WP2 (#126) — pending/rejected users can mint invite codes; WP10 (#134) — invite revoke |
| 17 | status-board-analytics | org-stats.ts — the pure metric-derivation module (20 exported symbols, zero I/O) | PARTIAL | REWRITE | high | M | ok |  |
| 17 | status-board-analytics | deriveBurnerStats + BurnerStats (total / complete / completePct) | PARTIAL | COPY | medium | S | REFUTED |  |
| 17 | status-board-analytics | deriveQuestionnaireCompletion + tallyActivationCompletion | MISSING | ADAPT | high | S | ok | docs/questionnaire-builder.md:384-392 (§7.1 Derivations) and :491-494 (Phase E — the only unbuilt builder phas |
| 17 | status-board-analytics | deriveRegistrationFunnel + emptyRegistrationFunnel (dense enum→count map) | MISSING | ADAPT | medium | S | ok |  |
| 17 | status-board-analytics | deriveOfficerCoverage + outstandingOfficers ('n of m covered, k slots outstanding') | MISSING | INSPIRE | medium | M | ok | WP6 #130 (team assignment — the keystone gap) |
| 17 | status-board-analytics | deriveWranglerCoverage — coverage plus a busiestLoad distribution figure | MISSING | ADAPT | medium | S | REFUTED | WP6 #130 |
| 17 | status-board-analytics | deriveSupplierOnboardingRollup — tri-bucket done/partial/never-started | NOT_APPLICABLE | INSPIRE | low | S | ? |  |
| 17 | status-board-analytics | deriveSupplierStandingRollup — dense enum rollup with a separate display order | NOT_APPLICABLE | SKIP | low | S | ? |  |
| 17 | status-board-analytics | status-board-format.ts — activity labels, tone, relative time, month bucketing | PARTIAL | ADAPT | medium | S | ok |  |
| 17 | status-board-analytics | bucketSubmissionsByMonth + hasSeries + SeriesPoint | MISSING | COPY | medium | S | ok |  |
| 17 | status-board-analytics | relativeTime — compact clamped relative timestamps | ALREADY_HAVE | SKIP | low | S | REFUTED |  |
| 17 | status-board-analytics | getRecentActivity — audit feed with PII decided at the select | MISSING | INSPIRE | medium | M | ok | WP5 #129 (member email absent from the captain profile despite owner decision OD4) |
| 17 | status-board-analytics | getSubmissionSeries — time series from a timestamp column | MISSING | ADAPT | low | S | ok |  |
| 17 | status-board-analytics | getStatusBoard — the composite read model | MISSING | REWRITE | medium | M | ok |  |
| 17 | status-board-analytics | KpiCards + KpiCard — the 4-up headline stat row | PARTIAL | SKIP | low | S | ok |  |
| 17 | status-board-analytics | RegistrationFunnelCard + RegistrationPipelineStrip (measured bars + chip strip) | MISSING | ADAPT | medium | S | ok |  |
| 17 | status-board-analytics | RegistrationsChart — dependency-free inline-SVG area/line chart | MISSING | ADAPT | medium | S | ok |  |
| 17 | status-board-analytics | Coverage rail cards (Wrangler / Officer / SupplierOnboarding / QuestionnaireCompletion) | MISSING | ADAPT | medium | M | ? | docs/questionnaire-builder.md:491-494 (Phase E — membership-page per-member completion status) |
| 17 | status-board-analytics | RecentActivity — the six-row audit feed card | MISSING | SKIP | low | S | ok |  |
| 17 | status-board-analytics | /status page — force-dynamic RSC, Promise.all reads, 3-column board | MISSING | REWRITE | medium | M | ok | WP7 #131 (Promise.all on the camp-management page, page.tsx:42) |
| 17 | status-board-analytics | /status/loading.tsx — a route boundary that mirrors the page grid | MISSING | COPY | high | S | REFUTED | WP7 #131 — 'ZERO loading.tsx files exist across 24 force-dynamic pages' |
| 17 | status-board-analytics | skeleton.tsx — the shared loading-boundary kit (8 primitives) | MISSING | COPY | high | S | ok | WP7 #131 |
| 17 | status-board-analytics | console-skeleton.tsx + page-heading.tsx (heading + its verbatim skeleton twin) | PARTIAL | ADAPT | medium | S | ok | WP7 #131; WP11 #135 (design drift) |
| 17 | status-board-analytics | FakeDb — table-keyed drizzle builder fake with real column projection | MISSING | COPY | high | M | ok | WP5 #129 / OD4 (email visible only to owner+captains) |
| 17 | status-board-analytics | org-stats.test.ts — the derivation contract (348 lines, 8 describes) | NOT_APPLICABLE | INSPIRE | medium | S | ok |  |
| 17 | status-board-analytics | status-board-format.test.ts — the time-series contract | MISSING | COPY | medium | S | REFUTED |  |
| 17 | status-board-analytics | status-board-reads.test.ts — projection + absent-query assertions | MISSING | ADAPT | medium | S | ok |  |
| 17 | status-board-analytics | getStatusBoard projection test + the officerKey near-miss post-mortem | NOT_APPLICABLE | INSPIRE | medium | S | ok |  |
| 17 | status-board-analytics | Source-text regression tests (assert on the shape of the code) | MISSING | ADAPT | high | S | ? | WP2 #126 (server-side authz gates); WP5 #129 / OD4 |
| 17 | status-board-analytics | audit_events index rationale (created_at DESC + subject) — migration 0024 | MISSING | ADAPT | low | S | ok |  |
| 17 | status-board-analytics | build-spec §Org stats dashboard + §Status board KPI row (the product law) | PARTIAL | INSPIRE | low | S | ok |  |
| 18 | system-health-ops | system-status.ts — the pure system-health deriver | MISSING | ADAPT | high | M | ok |  |
| 18 | system-health-ops | redactSecrets — two-pass credential scrubber | PARTIAL | ADAPT | high | S | ok | DEFERRED.md:80-85 (operator action: replace the guessable env INVITE_CODES bootstrap values — a panel that rep |
| 18 | system-health-ops | system-probe.ts — never-throws live database probe with timeout | MISSING | ADAPT | high | S | ok |  |
| 18 | system-health-ops | CheckRow + CheckListCard — the entire render layer | MISSING | COPY | high | S | ok | WP8 (#132) — a11y findings; the sr-only tone prefixes are the pattern that issue asks for |
| 18 | system-health-ops | The /system panel page — gate, headline banner, degrading sub-reads | MISSING | ADAPT | high | M | ok | WP12 (#136) — the audit's own honesty box, which records that the ENTIRE apps/web/app/api/* layer (6 cron work |
| 18 | system-health-ops | planMigration / connectionHost / isPoolerConnection — pure deploy verdict | MISSING | ADAPT | medium | S | ok |  |
| 18 | system-health-ops | migrate.ts — advisory-locked deploy runner with bootstrap-or-repair seeding | MISSING | INSPIRE | low | M | REFUTED | WP1 (#125) — sole-captain deletion permanently strands the camp because /setup latches shut after bootstrap; t |
| 18 | system-health-ops | security-headers.mjs — shared response security headers | PARTIAL | ADAPT | medium | S | ok |  |
| 18 | system-health-ops | config.ts + NotConfiguredBanner — the env-less-boot honest-degradation pair | MISSING | INSPIRE | low | S | ok |  |
| 18 | system-health-ops | Skeleton kit — the shared loading-boundary vocabulary | MISSING | ADAPT | medium | M | ok | WP7 (#131) — 'ZERO loading.tsx files exist across 24 force-dynamic pages'; and WP8 (#132) for the live-region  |
| 18 | system-health-ops | Three-tier error boundary set | PARTIAL | ADAPT | medium | S | REFUTED | WP7 (#131) — 'exactly one error boundary exists so any nested captain-route query failure nukes the whole chro |
| 18 | system-health-ops | client-errors.ts + ClientErrorCapture — recent-error ring buffer and device facts | MISSING | ADAPT | high | M | REFUTED | WP10 (#134) — 'no screenshot attach on the bug dialog (board S22)' and 'no manual Report-a-problem entry point |
| 18 | system-health-ops | deletion-sweep route — the destructive-cron auth + failure-status pattern | PARTIAL | INSPIRE | high | S | ok | WP12 (#136) — the entire apps/web/app/api/* layer, including all 6 cron workers, was outside every audit job's |
| 18 | system-health-ops | notifications/digest — the self-declaring stub route pattern | MISSING | COPY | medium | S | ok | WP10 (#134) — 'the reminders cron is a literal stub returning {ok:true, sent:0} after assertCron' |
| 18 | system-health-ops | docker-compose.local.yml — Postgres + two Neon proxies | MISSING | ADAPT | medium | S | ok |  |
| 18 | system-health-ops | configureLocalProxy — one shared Neon-driver redirection | PARTIAL | COPY | medium | S | REFUTED |  |
| 18 | system-health-ops | createHttpDb / sqlLogger / BUILD_PLACEHOLDER_URL — db-layer ops seams | PARTIAL | ADAPT | medium | S | REFUTED |  |
| 18 | system-health-ops | system-status.test.ts — the 'no secret is ever printed' proof harness | MISSING | ADAPT | high | S | ok |  |
| 18 | system-health-ops | migrate.test.ts — the migration-planner suite with a named regression | MISSING | ADAPT | low | S | ok |  |
| 18 | system-health-ops | system-panel.spec.ts — browser proof of the access inversion, with an honest scope note | NOT_APPLICABLE | INSPIRE | medium | S | ok |  |
| 18 | system-health-ops | e2e-local.sh — cold-start local-stack orchestration with real failure modes | NOT_APPLICABLE | INSPIRE | low | M | ok |  |
| 18 | system-health-ops | neon-pr-cleanup.yml — preview-branch quota leak fix | PARTIAL | ADAPT | medium | S | ok |  |
| 18 | system-health-ops | CI coverage matrix with per-workspace floors and a git-diff scope check | MISSING | ADAPT | medium | M | ok |  |
| 18 | system-health-ops | authConfigWarnings — the boot-time console.warn twin of the panel | MISSING | INSPIRE | medium | S | ok | DEFERRED.md:80-85 (operator actions: Firebase/VAPID env in Vercel; run camp404 backfill-id-encryption; replace |
| 18 | system-health-ops | guardConsole + GateScreen + NoRolesScreen — the two-gate boot/access wall | PARTIAL | INSPIRE | medium | M | ok | DEFERRED.md:71 (redirect-ladder consolidation — migrate ~8 gated pages onto the shared nextGate); WP2 (#126) 1 |
| 19 | e2e-harness | appAlerts — Next route-announcer-safe alert locator (e2e/lib/dom.ts:15-17) | PARTIAL | COPY | high | S | ok |  |
| 19 | e2e-harness | lib/env.ts — env resolution + capability flags + production guard | MISSING | ADAPT | high | S | ok | /home/ryan/repos/Personal/camp-404/docs/e2e-true-auth.md |
| 19 | e2e-harness | lib/identity.ts — collision-proof identity generation | MISSING | ADAPT | high | S | ok | /home/ryan/repos/Personal/camp-404/docs/e2e-true-auth.md |
| 19 | e2e-harness | lib/mail.ts — mail.tm disposable-inbox client | PARTIAL | ADAPT | high | S | ok | /home/ryan/repos/Personal/camp-404/docs/e2e-true-auth.md |
| 19 | e2e-harness | skipUnlessMail / skipUnlessGod — capability-gated honest skip (+ the mandatory counterweight) | MISSING | ADAPT | medium | S | ok |  |
| 19 | e2e-harness | makeAppPage fixture — N isolated browser contexts inheriting the project device profile | MISSING | ADAPT | high | S | ok | WP3 (#127) captain-promotion accept/decline surface |
| 19 | e2e-harness | waitForSessionCookie — the click-vs-cookie race guard | MISSING | ADAPT | high | S | ok | /home/ryan/repos/Personal/camp-404/docs/e2e-true-auth.md (open question 2: exact Better Auth sign-in endpoint/ |
| 19 | e2e-harness | personas/registry.ts — the declarative authz matrix with per-capability refusalHint | MISSING | REWRITE | high | M | ok | WP2 (#126) server-side authz gates, 14 findings |
| 19 | e2e-harness | Registry-coverage meta-test — a test that reads the spec corpus | MISSING | COPY | high | S | ok |  |
| 19 | e2e-harness | personas/factories.ts — the 12 UI-driving persona factories | PARTIAL | REWRITE | high | L | ok | /home/ryan/repos/Personal/camp-404/docs/e2e-true-auth.md; /home/ryan/repos/Personal/camp-404/DEFERRED.md:46-52 |
| 19 | e2e-harness | provisionOrgStaff / provisionEngineer — the four-step privileged-actor provisioning shape | MISSING | INSPIRE | high | M | ok | WP3 (#127) captain-promotion accept/decline surface |
| 19 | e2e-harness | Real-TOTP two-factor enrolment spec (e2e/specs/new-burner/two-factor.spec.ts) | MISSING | INSPIRE | medium | L | ok |  |
| 19 | e2e-harness | Passkey enrolment via a CDP virtual authenticator (e2e/specs/new-burner/passkeys.spec.ts) | MISSING | SKIP | low | L | ok |  |
| 19 | e2e-harness | Session-list / revoke / password-rotation / delete-with-grace spec | PARTIAL | INSPIRE | medium | L | ok | /home/ryan/repos/Personal/camp-404/DEFERRED.md:46-52 (account deletion is a hard no-op under E2E_TEST_MODE, no |
| 19 | e2e-harness | Password reset over a real inbox (e2e/specs/new-burner/password-reset.spec.ts) | MISSING | ADAPT | high | M | ok | /home/ryan/repos/Personal/camp-404/docs/e2e-true-auth.md |
| 19 | e2e-harness | DB-backed cross-request rate-limit spec (e2e/specs/new-burner/auth-rate-limit.spec.ts) | PARTIAL | INSPIRE | medium | S | ok | /home/ryan/repos/Personal/camp-404/docs/superpowers/specs/2026-05-31-shake-to-report-design.md:79-85 (shared U |
| 19 | e2e-harness | Enumeration-safe sign-in copy spec (e2e/specs/new-burner/session-lifecycle.spec.ts:54-87) | MISSING | COPY | high | S | ok |  |
| 19 | e2e-harness | Blocking-gate trap-and-release specs (two release paths: submit, and activation-close) | PARTIAL | ADAPT | high | M | REFUTED | WP4 (#128) questionnaire delivery |
| 19 | e2e-harness | Questionnaire build → activate → answer → aggregate spec | MISSING | INSPIRE | high | L | ok | /home/ryan/repos/Personal/camp-404/docs/questionnaire-builder.md §9 Phase E; WP10 (#134); WP4 (#128) |
| 19 | e2e-harness | Anon gated-surface refusal loop (e2e/specs/anon/gated-web-surfaces-refused.spec.ts) | MISSING | ADAPT | high | S | ok | WP2 (#126) server-side authz gates, 14 findings |
| 19 | e2e-harness | Onboarding-gate loop with per-route failure messages | PARTIAL | ADAPT | high | S | ok | /home/ryan/repos/Personal/camp-404/DEFERRED.md (redirect-ladder consolidation: nextGate is called only from ap |
| 19 | e2e-harness | Signed-out invite acceptance journey (factory + spec) | PARTIAL | INSPIRE | medium | M | ok | /home/ryan/repos/Personal/camp-404/DEFERRED.md:66 (invite-code case handling); WP10 (#134) invite revoke + 'my |
| 19 | e2e-harness | attemptCreateCamp — three-way outcome race helper | MISSING | COPY | medium | S | ok |  |
| 19 | e2e-harness | setHardLockedBioData — retry-the-whole-flow wizard driver | MISSING | ADAPT | medium | S | ok |  |
| 19 | e2e-harness | expectServerNotFound — assert the refusal PROPERTY, not the status line | PARTIAL | ADAPT | high | S | REFUTED |  |
| 19 | e2e-harness | playwright.config.ts — two-project, env-driven, never-boots-an-app config | PARTIAL | ADAPT | high | S | ok | /home/ryan/repos/Personal/camp-404/docs/e2e-true-auth.md (step 2: a second config, webServer runs next build & |
| 19 | e2e-harness | scripts/e2e-local.sh — cold-start orchestration with a documented incident log | MISSING | ADAPT | medium | M | ok | /home/ryan/repos/Personal/camp-404/docs/e2e-true-auth.md (implementation steps 2 and 5) |
| 19 | e2e-harness | e2e-god-bootstrap.mts — the one documented test-only write, fenced | PARTIAL | INSPIRE | high | S | ok | /home/ryan/repos/Personal/camp-404/docs/e2e-true-auth.md (step 3: add the test identity to GOD_EMAILS); /home/ |
| 19 | e2e-harness | CI persona-matrix + single aggregating required check | PARTIAL | SKIP | low | M | ok |  |
| 19 | e2e-harness | Nightly mobile-360 triage workflow (.github/workflows/mobile.yml) | MISSING | ADAPT | medium | S | ok | WP8 (#132) motion & a11y; WP11 (#135) UI polish / design drift |
| 19 | e2e-harness | e2e/README.md §Selector traps — seven DOM lessons | PARTIAL | COPY | high | S | ok |  |
| 19 | e2e-harness | e2e/package.json — the dedicated workspace and its no-back-doors contract | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 20 | ci-repo-tooling | security-headers.mjs (SECURITY_HEADERS + securityHeaders()) | MISSING | COPY | high | S | REFUTED |  |
| 20 | ci-repo-tooling | commitlint.config.mjs — Conventional Commits + workspace scope-enum | MISSING | ADAPT | medium | S | ok | /home/ryan/repos/Personal/camp-404/AGENTS.md:193-197 |
| 20 | ci-repo-tooling | .husky/commit-msg hook | MISSING | COPY | medium | S | ok |  |
| 20 | ci-repo-tooling | CI job `commitlint` — dual PR-title + commit-range enforcement | MISSING | COPY | medium | S | ok |  |
| 20 | ci-repo-tooling | ci-pass — the single aggregate required check | ALREADY_HAVE | SKIP | low | S | ok |  |
| 20 | ci-repo-tooling | Persona-sharded e2e matrix with per-shard worker tuning | NOT_APPLICABLE | INSPIRE | low | S | ok |  |
| 20 | ci-repo-tooling | Coverage matrix with a git-diff change-scope gate | MISSING | ADAPT | medium | M | ok |  |
| 20 | ci-repo-tooling | Coverage-ratchet vitest configs (8 files) | MISSING | ADAPT | high | M | ok |  |
| 20 | ci-repo-tooling | GITHUB_LABELS — the taxonomy as code | MISSING | ADAPT | high | M | REFUTED |  |
| 20 | ci-repo-tooling | syncGithubLabels + parseRepoSlug (labels-sync) | MISSING | COPY | medium | S | ok |  |
| 20 | ci-repo-tooling | scripts/setup-github-labels.ts (`pnpm labels:sync`) | MISSING | COPY | medium | S | ok |  |
| 20 | ci-repo-tooling | issue-forms.test.ts — binds .github/ISSUE_TEMPLATE to GITHUB_LABELS | MISSING | COPY | medium | S | ok |  |
| 20 | ci-repo-tooling | Issue form set (bug/feature/design/copy + config) | MISSING | ADAPT | medium | M | ok |  |
| 20 | ci-repo-tooling | pull_request_template.md | MISSING | ADAPT | high | S | ok | /home/ryan/repos/Personal/camp-404/AGENTS.md:193-203 |
| 20 | ci-repo-tooling | .github/CODEOWNERS | PARTIAL | SKIP | low | S | ok |  |
| 20 | ci-repo-tooling | .gitattributes — *.pen -merge | MISSING | COPY | high | S | ok |  |
| 20 | ci-repo-tooling | neon-pr-cleanup.yml with cursor pagination + pull_request_target | PARTIAL | ADAPT | medium | S | ok |  |
| 20 | ci-repo-tooling | mobile.yml — the nightly non-gating triage workflow | NOT_APPLICABLE | INSPIRE | low | S | ok |  |
| 20 | ci-repo-tooling | planMigration / isPoolerConnection / connectionHost | MISSING | ADAPT | medium | M | ok |  |
| 20 | ci-repo-tooling | migrate.test.ts + migrate-runner.test.ts | MISSING | COPY | medium | S | ok |  |
| 20 | ci-repo-tooling | scripts/e2e-local.sh — the shared local+CI e2e runner | NOT_APPLICABLE | INSPIRE | low | S | ok |  |
| 20 | ci-repo-tooling | docker-compose.local.yml — Postgres + two Neon proxies | NOT_APPLICABLE | SKIP | low | M | ok |  |
| 20 | ci-repo-tooling | e2e production-host refusal + Next route-announcer selector fix | PARTIAL | ADAPT | medium | S | ok |  |
| 20 | ci-repo-tooling | turbo.json build-output exclusions with the .next/dev incident record | PARTIAL | ADAPT | medium | S | ok |  |
| 20 | ci-repo-tooling | CONTRIBUTING.md — commit convention, house rule, canvas protocol | PARTIAL | ADAPT | medium | M | ok | /home/ryan/repos/Personal/camp-404/AGENTS.md:173-203 |
| 20 | ci-repo-tooling | SECURITY.md — including the Repository settings checklist | MISSING | ADAPT | high | S | REFUTED |  |
| 20 | ci-repo-tooling | AGENTS.md §Verification + the two false-passing test shapes | PARTIAL | ADAPT | high | S | ok |  |
| 20 | ci-repo-tooling | docs/triage.md — the issue-queue contract | MISSING | ADAPT | medium | M | ok |  |
| 20 | ci-repo-tooling | Workflow-level least-privilege permissions block | PARTIAL | COPY | high | S | ok |  |
| 20 | ci-repo-tooling | .prettierignore verbatim-sources protection | PARTIAL | ADAPT | medium | S | ok |  |
| 20 | ci-repo-tooling | Root package.json scripts + prepare hook | PARTIAL | ADAPT | medium | S | ok |  |
| 21 | docs-spec-discipline | Standardised 5-row doc metadata header block | PARTIAL | ADAPT | high | S | ok |  |
| 21 | docs-spec-discipline | docs/README.md — the index-as-rulebook | PARTIAL | ADAPT | high | S | ok |  |
| 21 | docs-spec-discipline | The four-level precedence chain | PARTIAL | ADAPT | high | S | ok |  |
| 21 | docs-spec-discipline | Four-glyph build-status legend with heading-vs-citation precedence | PARTIAL | COPY | medium | S | ok |  |
| 21 | docs-spec-discipline | Requirement-ID protocol + nine-step regeneration procedure | NOT_APPLICABLE | SKIP | low | L | ok |  |
| 21 | docs-spec-discipline | docs/technical-spec.md — 1:1 spec-mirror gap analysis | PARTIAL | INSPIRE | medium | M | ok |  |
| 21 | docs-spec-discipline | docs/sources/ — never-edited primary-source corpus | PARTIAL | INSPIRE | low | S | ok |  |
| 21 | docs-spec-discipline | GITHUB_LABELS — issue label taxonomy as code | PARTIAL | ADAPT | medium | S | ok |  |
| 21 | docs-spec-discipline | syncGithubLabels / parseRepoSlug + pnpm labels:sync | MISSING | ADAPT | medium | S | ok |  |
| 21 | docs-spec-discipline | issue-forms.test.ts — the doc-to-config consistency test | MISSING | COPY | high | S | ok |  |
| 21 | docs-spec-discipline | Four typed GitHub issue forms + blank-issues-disabled config | MISSING | ADAPT | high | S | ok |  |
| 21 | docs-spec-discipline | PR template with load-bearing Database and Risk sections + collapsed appendix | MISSING | COPY | high | S | ok |  |
| 21 | docs-spec-discipline | commitlint config + husky hook + CI commit-conventions job | MISSING | ADAPT | high | S | REFUTED |  |
| 21 | docs-spec-discipline | CI pass — the single required aggregate status check | ALREADY_HAVE | SKIP | low | S | ok |  |
| 21 | docs-spec-discipline | Coverage ratchet with per-file 100% floors on the privacy core | MISSING | ADAPT | high | M | ok |  |
| 21 | docs-spec-discipline | AGENTS.md Verification section — 'how to be right, not just confident' | MISSING | COPY | high | S | ok |  |
| 21 | docs-spec-discipline | AGENTS.md four operational traps with measured costs | PARTIAL | ADAPT | high | S | ok |  |
| 21 | docs-spec-discipline | CONTRIBUTING.md — the house rule | MISSING | COPY | high | S | ok |  |
| 21 | docs-spec-discipline | CODEOWNERS annotated with WHY, plus an honest caveat | MISSING | ADAPT | medium | S | ok |  |
| 21 | docs-spec-discipline | SECURITY.md repository-settings checklist | MISSING | ADAPT | high | S | ok |  |
| 21 | docs-spec-discipline | docs/triage.md — issue queue taxonomy + the triage routine | MISSING | INSPIRE | medium | M | ok |  |
| 21 | docs-spec-discipline | docs/accounts-security-spec.md — capability matrix + policy for the surfaces Camp 404 lacks | MISSING | ADAPT | medium | M | ok |  |
| 21 | docs-spec-discipline | docs/notifications-spec.md — model, schema, surfaces, four laws | PARTIAL | ADAPT | medium | S | ok |  |
| 21 | docs-spec-discipline | docs/questionnaire-spec.md Builder v2 — Google Forms parity target set | MISSING | ADAPT | high | M | ok | /home/ryan/repos/Personal/camp-404/docs/questionnaire-builder.md (§9 phases A–F; Phase E is the unbuilt one) — |
| 21 | docs-spec-discipline | docs/flows.md — journeys that name their enforcing code | PARTIAL | INSPIRE | medium | S | ok |  |
| 21 | docs-spec-discipline | docs/architecture.md — system, package graph, request path, ER, constraints | PARTIAL | ADAPT | medium | M | ok |  |
| 21 | docs-spec-discipline | docs/build-spec.md — the engineering contract shape | PARTIAL | INSPIRE | medium | M | ok |  |
| 21 | docs-spec-discipline | docs/deploy.md — runbook that doubles as a diagnosis guide | MISSING | ADAPT | high | M | ok |  |
| 21 | docs-spec-discipline | docs/auth-platform-spec.md §8-§11 — runbooks, kill-switch, threat matrix, open decisions | MISSING | ADAPT | high | M | ok |  |
| 21 | docs-spec-discipline | docs/roadmap.md — the roadmap template | PARTIAL | ADAPT | medium | M | ok |  |
| 21 | docs-spec-discipline | docs/component-spec.md — usage-ranked component tiers + route-to-frame index | PARTIAL | ADAPT | medium | M | ok |  |
| 21 | docs-spec-discipline | design/qa/REVIEW.md + audit.py — measurement-first design review | MISSING | ADAPT | medium | L | ok |  |
| 21 | docs-spec-discipline | design/pen-lessons.md — the accumulating tool-lessons file | PARTIAL | ADAPT | medium | S | ok |  |
| 21 | docs-spec-discipline | e2e/README.md — harness contract + Selector traps catalogue | PARTIAL | ADAPT | high | S | ok |  |
| 21 | docs-spec-discipline | docs/simplification-audit.md — auditor -> refuter finding format | PARTIAL | COPY | medium | S | ok |  |
| 21 | docs-spec-discipline | Seeding law — stated identically in four places | PARTIAL | COPY | medium | S | ok |  |
| 21 | docs-spec-discipline | The 'cast' for realistic copy, fenced away from seeds | PARTIAL | INSPIRE | low | S | ok |  |
| 21 | docs-spec-discipline | turbo.json incident comment — knowledge stored in config | MISSING | COPY | high | S | ok |  |
| 21 | docs-spec-discipline | UNRESOLVED inline markers for internal contradictions | MISSING | COPY | high | S | ok |  |
| 21 | docs-spec-discipline | Deliberate section-numbering gaps with the removed text's commit named | MISSING | COPY | low | S | ok |  |
| 21 | docs-spec-discipline | Inline dated correction blocks that keep the original text | MISSING | COPY | high | S | ok |  |
| 21 | docs-spec-discipline | CONTRIBUTING.md — the human on-ramp with a designer-concurrency protocol | MISSING | ADAPT | high | S | ok |  |
| 22 | directory-profile-public | privacy.ts — the two never-public field classes (HARD_LOCKED_PRIVATE_FIELDS / SAFETY_VISIBLE_FIELDS / ALWAYS_PRIVATE_FIELDS + isHardLockedPrivate, isSafetyVisibleField, isAlwaysPrivate, canBePublic, enforcePrivacyFlags, privacyViolations) | MISSING | ADAPT | high | S | ? | No doc; GitHub issue WP5 #129 (roster data / emergency contacts) is the closest planned work |
| 22 | directory-profile-public | publicBioView — the third-party projection gate (show = canBePublic(key) && privacyFlags[key] === true; missing flag ⇒ private; takes the FULL bio so callers cannot bypass) | PARTIAL | ADAPT | high | M | ? |  |
| 22 | directory-profile-public | BIO_PRIVACY_FIELDS — the 19-row privacy registry whose `locked` is derived from the law via a trailing .map | MISSING | ADAPT | medium | M | ok |  |
| 22 | directory-profile-public | resolvePrivacyFlagsUpdate — an omitted flag map returns an EMPTY patch; an explicit empty map is still a write. initialPrivacyFlags() insert-path sibling. | MISSING | COPY | medium | S | ? |  |
| 22 | directory-profile-public | username.ts — handle format rules, ~100-entry reserved list, case-insensitive normalisation, publicMemberName fallback ladder | PARTIAL | ADAPT | medium | M | ok | design/spec/impl/app/14-roster.md:323 (OQ#2 — "@handle source/fallback … Reuse users.telegramHandle; confirm f |
| 22 | directory-profile-public | checkUsernameAvailabilityAction — Zod-bounded, authorised, single-indexed-lookup availability probe that names no holder | MISSING | ADAPT | low | S | ? |  |
| 22 | directory-profile-public | useUsernameAvailability — 400ms-debounced probe, client-side format validation first, silent on network failure | MISSING | COPY | low | S | ok |  |
| 22 | directory-profile-public | getPublicBurnerProfile — the public profile query where the SELECT is the privacy boundary (13 non-sensitive columns only; hard-locked fields hard-coded to null) | PARTIAL | REWRITE | high | M | ? |  |
| 22 | directory-profile-public | saveBio — refuse-don't-drop + never-destroy-unreadable-ciphertext (encryptOrPreserve, carriesSensitive throw, 23505 lost-race → 'taken') | PARTIAL | ADAPT | high | M | ok | DEFERRED.md:53-58 (result-object server actions still throw raw on DB errors) |
| 22 | directory-profile-public | crypto.ts — AES-256-GCM with a three-state decryptField (empty / ok / unreadable) | PARTIAL | ADAPT | high | S | ok |  |
| 22 | directory-profile-public | canViewMedicalNotes / medicalAccessBasis — pure fail-closed safety-visible predicate (self / org safety tier / lead∩subject camp intersection) | MISSING | ADAPT | high | S | ? | GitHub issue WP5 #129 (safety-critical: users.emergency_contacts exists and MCP exposes it to captains but the |
| 22 | directory-profile-public | resolveMedicalNotesForViewer — authorise, decrypt only after a yes, distinguish unreadable, write an audit row via after() (fail-open, error swallowed) | MISSING | ADAPT | high | M | ok | GitHub issue WP5 #129; audit_log is listed as an orphaned table in design/feature-set-verification-report.md |
| 22 | directory-profile-public | medical roster refusal + source-level regression test (readFileSync the module, assert the projection never mentions the field, assert authorise-before-fetch by comparing indexOf positions) | PARTIAL | INSPIRE | medium | S | ? |  |
| 22 | directory-profile-public | getRosterMemberDetail — authorisation passed in as a parameter (options: { includeMedicalNotes: boolean }) so a refused caller's row never contains the ciphertext | MISSING | INSPIRE | high | M | ? |  |
| 22 | directory-profile-public | medical-audit.ts — withhold the whole panel rather than redact, because the existence of a row is itself the disclosure | MISSING | SKIP | low | M | ? |  |
| 22 | directory-profile-public | skeleton.tsx — eight composable server-safe skeleton primitives (Skeleton, SkeletonRegion, SkeletonText, SkeletonHeading, SkeletonCard, SkeletonRow, SkeletonCardGrid, SkeletonField, SkeletonForm) | MISSING | COPY | high | S | ? | GitHub issue WP7 #131 (zero loading.tsx across 24 force-dynamic pages) |
| 22 | directory-profile-public | Switch variant="privacy" + hardLocked — native <button role="switch"> with ON · PUBLIC / OFF · PRIVATE caps and an ALWAYS PRIVATE + Lock state | MISSING | ADAPT | medium | S | ? |  |
| 22 | directory-profile-public | Field with a privacyToggle label-row slot — label · control · help · error wrapper with a right-aligned slot and derived aria-describedby ids | PARTIAL | ADAPT | medium | S | ? |  |
| 22 | directory-profile-public | PrivacyToggles — the consolidated per-field privacy review list (locked rows show the lock reason + an inert 'Locked private' pill; unlocked rows a role=switch with an explanatory sub-line) | MISSING | COPY | medium | S | ? |  |
| 22 | directory-profile-public | Public burner profile page (/burners/[id]) — uuid-validated route, session-gated, all privacy delegated to the server projection, sections render only when their public field survived | PARTIAL | ADAPT | medium | M | ? |  |
| 22 | directory-profile-public | profile-public component set (ProfileHero / ProfileSection / ProfileCamps / PrivacyNote) | MISSING | ADAPT | medium | S | ok |  |
| 22 | directory-profile-public | /profile — own-profile page with a Public / Private / Always private badge on every row | PARTIAL | ADAPT | medium | M | ok | design/spec/impl/app/07-profile-view.md (the shipped surface brief — a privacy-badge column would extend it) |
| 22 | directory-profile-public | BioFlow — the 5-step onboarding / 3-step edit flow with inline per-field privacy switches and a locked 'Held privately' card | ALREADY_HAVE | SKIP | low | L | ? |  |
| 22 | directory-profile-public | BurnsAndVolunteeringStep — soft word counter, repeatable camp-history editor with type-ahead, volunteering multi-select with 'other' | PARTIAL | SKIP | low | M | ok |  |
| 22 | directory-profile-public | attended-years domain vocabulary + validator (ATTENDED_YEAR_MIN 2007, MAX 2026, NO_BURN_YEARS [2020,2021], disabled options, lenient parse) | PARTIAL | INSPIRE | low | S | ? |  |
| 22 | directory-profile-public | word-count.ts — one definition of 'a word' shared by the live UI counter and server-side validation | MISSING | COPY | low | S | ? |  |
| 22 | directory-profile-public | name-dedupe.ts — normalizeName + a JS reimplementation of pg_trgm similarity (SIMILARITY_WARN_THRESHOLD 0.55) | MISSING | INSPIRE | low | S | ? |  |
| 22 | directory-profile-public | camp-categories.ts — 8 canonical categories with emoji, label normalisation, usage counting, and the pure directory filter predicate | NOT_APPLICABLE | SKIP | low | S | ? |  |
| 22 | directory-profile-public | member-ref-code.ts — deterministic {PREFIX}-M{NNN} member reference codes for off-platform EFT reconciliation | MISSING | ADAPT | medium | S | ok | GitHub issue WP10 #134 (dues write path + Finances UI — users.duesPaid is read but written by nothing; reimbur |
| 22 | directory-profile-public | id-retention.ts — POPIA storage-limitation rule (ID_RETENTION_GRACE_DAYS 30, buildIdPurgePatch, never purge on NaN) | MISSING | ADAPT | medium | M | ? | Not planned anywhere — docs/superpowers/specs/2026-05-30-pii-at-rest-encryption-design.md covers encryption at |
| 22 | directory-profile-public | account-sanitization.ts — the erasure plan plus uncoveredHardLockedFields, the guard that fails when a new always-private field has no erasure path | PARTIAL | ADAPT | medium | S | ? | docs/superpowers/specs/2026-05-30-account-deletion-design.md (BUILT — the erasure plan itself is shipped) |
| 22 | directory-profile-public | searchAccounts — a search field whose PREDICATE narrows with the caller's rank (and looksLikeId /^[0-9a-f-]{8,}$/i) | PARTIAL | INSPIRE | medium | S | ok | GitHub issue WP5 #129 (member email absent from the captain profile despite owner decision OD4; roster search  |
| 22 | directory-profile-public | loading.tsx boundaries that mirror the destination page's own container classes | MISSING | ADAPT | high | M | ok | GitHub issue WP7 #131 (zero loading.tsx across 24 force-dynamic pages) |
| 22 | directory-profile-public | scoped route error boundary + shared ErrorRecovery body with a frame variant | PARTIAL | ADAPT | high | S | ok | GitHub issue WP7 #131 (exactly one error boundary exists, so any nested captain-route query failure nukes the  |
| 22 | directory-profile-public | MEDICAL_AUDIENCE_NOTE — consent at the point of entry, one exported string reused by the question, the field help, the lock reason and the privacy review | MISSING | ADAPT | medium | S | ? |  |
| 22 | directory-profile-public | privacy-projection E2E — assert on page.content() with unique per-run sentinels, paired with a positive control | MISSING | INSPIRE | medium | M | ok | docs/e2e-true-auth.md (NOT BUILT — no playwright.auth.config.ts, no tests/e2e-auth/, no test:e2e:auth script) |
| 22 | directory-profile-public | bio-store-projection + bio-ciphertext-preservation unit tests (30 `it`s pinning the exact save/read contracts against a mocked drizzle) | PARTIAL | INSPIRE | medium | S | ok | DEFERRED.md (DB integration tests) — the packages/db PGlite harness + __setDbOverride DI seam now exists, obso |
| 22 | directory-profile-public | account surface structure — one writer per field (username read-only with a link), deletion consequences from the real sanitization plan, AccountShell sections | PARTIAL | ADAPT | medium | M | ok | GitHub issue WP1 #125 (deleteOwnAccount does not block the sole captain, permanently stranding the camp becaus |
| 23 | media-uploads-blob | FileUpload (the one attachment primitive) | MISSING | ADAPT | high | M | REFUTED |  |
| 23 | media-uploads-blob | Client-upload token endpoint (participant) with per-kind policy map | MISSING | ADAPT | high | S | REFUTED |  |
| 23 | media-uploads-blob | Client-upload token endpoint (org) — every kind carries its own authorisation domain | NOT_APPLICABLE | INSPIRE | medium | S | ok |  |
| 23 | media-uploads-blob | Legacy multipart upload endpoint + isBlobConfigured() | PARTIAL | INSPIRE | medium | S | REFUTED |  |
| 23 | media-uploads-blob | FileUpload contract test suite | MISSING | COPY | high | S | ok |  |
| 23 | media-uploads-blob | Supplier-documents domain module (acknowledgement-catalog engine) | MISSING | REWRITE | medium | L | ok |  |
| 23 | media-uploads-blob | Supplier-documents core test suite | MISSING | REWRITE | medium | M | ok |  |
| 23 | media-uploads-blob | Org document CRUD server actions | MISSING | REWRITE | medium | L | REFUTED |  |
| 23 | media-uploads-blob | Whole-scope step reconciler (transaction-bound) | MISSING | INSPIRE | low | M | ok |  |
| 23 | media-uploads-blob | Supplier-side acknowledgement action (idempotent, tx-scoped, locked) | MISSING | INSPIRE | medium | M | ok |  |
| 23 | media-uploads-blob | Supplier-side document read model (never throws) | MISSING | INSPIRE | medium | S | ok | WP7 (#131) — loading/error boundaries; 14 findings + 2 gaps |
| 23 | media-uploads-blob | DocumentsPanel (member-facing acknowledgement card) + downloadHref | MISSING | ADAPT | medium | M | ok |  |
| 23 | media-uploads-blob | DocumentForm (source toggle + uploader + binding rule mirrored in the UI) | MISSING | ADAPT | medium | M | ok |  |
| 23 | media-uploads-blob | DocumentsTable (responsive CRUD table with accessible reorder + consequence-naming delete) | MISSING | REWRITE | medium | L | REFUTED | WP8 (#132) — dnd DragOverlay + keyboard sensor (40 findings) |
| 23 | media-uploads-blob | BINDABLE_STEPS / UNBOUND_VALUE / asStepKey / stepLabel | PARTIAL | INSPIRE | medium | S | ok | WP2 (#126) — server-side authz gates; UI filtering is never the boundary |
| 23 | media-uploads-blob | BlobConfigProvider / useBlobConfigured (context for deeply-nested uploaders) | MISSING | COPY | medium | S | ok |  |
| 23 | media-uploads-blob | LayoutUploads (thin domain wrapper over FileUpload) | NOT_APPLICABLE | INSPIRE | low | S | ok |  |
| 23 | media-uploads-blob | file_link questionnaire field render | MISSING | ADAPT | high | M | ok |  |
| 23 | media-uploads-blob | Questionnaire image-block and choice-option image uploaders | PARTIAL | ADAPT | high | S | ok |  |
| 23 | media-uploads-blob | blobCheck() — the /system presence probe | MISSING | INSPIRE | low | M | ok |  |
| 23 | media-uploads-blob | layout-uploads e2e spec (and its scope-honesty header) | MISSING | ADAPT | medium | S | ok |  |
| 23 | media-uploads-blob | ImageGrid / PhotoGrid — the hand-rolled duplicate uploader (anti-asset) | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 23 | media-uploads-blob | MAX_LAYOUT_UPLOADS + the layout-URL storage/render chain | NOT_APPLICABLE | INSPIRE | low | S | ok |  |
| 23 | media-uploads-blob | id-retention (PII purge rule — adjacent, pure, unscheduled) | MISSING | REWRITE | medium | M | ok |  |
| 23 | media-uploads-blob | file_link / ImageBlock / QuestionOption.imageUrl schemas | PARTIAL | ADAPT | medium | M | ok | WP11 (#135) — multi_select lacks the tappable card treatment single_select got (question.tsx:228) |
| 23 | media-uploads-blob | The 'honest degradation' upload convention (env-less boot rule applied to files) | PARTIAL | ADAPT | high | S | ok |  |
| 24 | sweeper-misc | securityHeaders / SECURITY_HEADERS (config/security-headers.mjs) | PARTIAL | ADAPT | high | S | ok |  |
| 24 | sweeper-misc | navigateOnwards (deferred push/refresh after a server action) | MISSING | ADAPT | high | S | ok | /home/ryan/repos/Personal/camp-404/DEFERRED.md (WP4 #128 — 'no S27 completion screen after final submit') |
| 24 | sweeper-misc | ErrorRecovery (frame: standalone/inline error boundary UI) | PARTIAL | ADAPT | high | S | ok | WP7 (#131) — 'exactly one error boundary exists (apps/web/app/error.tsx) so any nested captain-route query fai |
| 24 | sweeper-misc | NotFoundView (shared branded 404, frame prop) | PARTIAL | ADAPT | medium | S | ok | WP7 (#131) |
| 24 | sweeper-misc | PageSkeleton / PortalPageSkeleton / HeadingSkeleton | MISSING | ADAPT | high | M | ok | WP7 (#131) — 'ZERO loading.tsx files exist across 24 force-dynamic pages' |
| 24 | sweeper-misc | NavLink (useLinkStatus pending affordance) | MISSING | ADAPT | medium | S | ok | WP7 (#131) — 'per-control pending states' |
| 24 | sweeper-misc | AppShell (awaited-not-streamed chrome in the route-group layout) | PARTIAL | INSPIRE | medium | M | ok |  |
| 24 | sweeper-misc | sendEmail (Resend, one recipient per message) | NOT_APPLICABLE | INSPIRE | low | M | ok |  |
| 24 | sweeper-misc | generatePaymentReference / deriveSubjectCode (QP-2027-MAH-001) | MISSING | INSPIRE | low | S | ok | WP10 (#134) — 'users.duesPaid is read but written by NOTHING; the Finances tile has no UI' |
| 24 | sweeper-misc | Member ref codes (deriveCampPrefix / formatMemberRefCode / nextMemberSequence) | MISSING | ADAPT | high | S | ok | WP10 (#134) — dues write path + Finances UI |
| 24 | sweeper-misc | Supplier code issuance (formatSupplierCode / nextSupplierSequence / issueSupplierCode) | NOT_APPLICABLE | INSPIRE | medium | S | ok |  |
| 24 | sweeper-misc | contactNamesAddress (whole-token email match in free-text prose) | NOT_APPLICABLE | INSPIRE | medium | S | ok |  |
| 24 | sweeper-misc | Supplier onboarding checklist engine (catalogue + 3 flows + transition validator) | MISSING | REWRITE | high | L | ok | WP10 (#134) — 'the tasks table is COMPLETELY ORPHANED, yet three comingSoon:true tiles (camp-tasks, crew-tasks |
| 24 | sweeper-misc | Supplier document ↔ step reconciliation (validateDocumentBinding / applyDocumentAcksToSteps) | NOT_APPLICABLE | INSPIRE | medium | M | ok |  |
| 24 | sweeper-misc | reconcileEditionSupplierSteps (whole-scope reconciliation sweep, same-tx) | NOT_APPLICABLE | INSPIRE | low | M | ok |  |
| 24 | sweeper-misc | Supplier standing vocabulary + picker eligibility (6 values, tone map, tag-never-hide) | NOT_APPLICABLE | INSPIRE | low | S | ok | WP9 (#133) — 'captain notes on a member' |
| 24 | sweeper-misc | buildStepCardModel / stepEyebrow / supplierCodeChipValue (pure checklist view-model) | PARTIAL | INSPIRE | medium | S | ok |  |
| 24 | sweeper-misc | Supplier CSV import parser (parseCsv / parseSuppliersCsv + 4 mappers) | MISSING | INSPIRE | medium | M | ok | WP9 (#133) — 'no roster CSV export'; questionnaire builder Phase E — 'Responses table + CSV export' (docs/ques |
| 24 | sweeper-misc | Camp categories (canonical set + dedupe + validation + usage counts + filter) | NOT_APPLICABLE | INSPIRE | medium | S | ok | docs/configurable-teams-plan.md Phase 4 (enum growth) |
| 24 | sweeper-misc | name-dedupe (normalizeName + pg_trgm-faithful trigramSimilarity) | MISSING | COPY | medium | S | ok |  |
| 24 | sweeper-misc | word-count (countWords / isWithinWordLimit / wordsRemaining) | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 24 | sweeper-misc | SOUND_SCALE / isNoAmplifiedSound | NOT_APPLICABLE | INSPIRE | low | S | ok |  |
| 24 | sweeper-misc | getPlacementZones (per-edition config owned by code, keyed on year) | ALREADY_HAVE | SKIP | low | S | ok |  |
| 24 | sweeper-misc | generateProfileKeypair / fingerprintPublicKey (ECDSA P-256, no npm dep) | NOT_APPLICABLE | SKIP | low | M | ok |  |
| 24 | sweeper-misc | getActiveEdition / getEditionLabel (react.cache + never-throw + static fallback) | NOT_APPLICABLE | INSPIRE | low | S | ok |  |
| 24 | sweeper-misc | missingConfig / isFullyConfigured + NotConfiguredBanner + PreviewNotice | PARTIAL | INSPIRE | medium | S | ok | DEFERRED.md operator actions (Firebase/VAPID env unset ⇒ the whole push pipeline is inert) |
| 24 | sweeper-misc | guardPortal / guardConsole (a guard that returns a renderable node) | PARTIAL | ADAPT | high | M | ok | WP2 (#126) — 'shared required-actions gate helper for /tools, /tools/invite, /family-tree'; DEFERRED.md 'Redir |
| 24 | sweeper-misc | runAction / ActionResult | PARTIAL | COPY | high | S | ok | DEFERRED.md — 'Result-object actions still throw raw on DB errors — only createInviteAction try/catches its DB |
| 24 | sweeper-misc | org-logic review state machine (REVIEW_ACTIONS / resolveReviewActionPath / availableReviewActions) | PARTIAL | INSPIRE | medium | M | ok | WP1 (#125) — 'decideApprovalAction has no stale/racing-decision guard'; WP9 (#133) — 'no decision reversal' |
| 24 | sweeper-misc | classifySoundLevel + SOUND_LEVEL_LABELS / SOUND_LEVEL_SHORT | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 24 | sweeper-misc | formatMoney / formatDate / formatDateTime + label maps | PARTIAL | ADAPT | medium | S | ok | WP10 (#134) — Finances UI; WP11 (#135) — UI polish / design drift |
| 24 | sweeper-misc | slugify / checkCampName / prepareCampCreate + createCampWrites | NOT_APPLICABLE | INSPIRE | medium | M | ok |  |
| 24 | sweeper-misc | LeaveCampButton (inline two-state destructive confirm) | MISSING | ADAPT | high | S | ok | WP1 (#125) — 'builder block/page deletes use bare window.confirm or nothing (builder-canvas.tsx:185, page-sett |
| 24 | sweeper-misc | MemberRefCode (copy-to-clipboard identifier, prominent + inline variants) | PARTIAL | ADAPT | medium | S | ok | WP10 (#134) — Finances UI |
| 24 | sweeper-misc | JoinButton (server-action form that survives sign-up, useFormStatus) | MISSING | INSPIRE | low | S | ok |  |
| 24 | sweeper-misc | NotificationFilterTabs / notificationsHref (URL-as-filter-state) | MISSING | ADAPT | medium | M | ok |  |
| 24 | sweeper-misc | DocumentsPanel (Blob download-vs-inline hostname check) | NOT_APPLICABLE | INSPIRE | low | M | ok |  |
| 24 | sweeper-misc | OnboardingChecklist (729-line checklist card UI, tone system) | MISSING | INSPIRE | medium | L | ok | WP10 (#134) — build on the orphaned tasks table |
| 24 | sweeper-misc | Artwork + Vehicle registration forms (Section chrome, Callout, PhotoGrid, blobConfigured fallback) | NOT_APPLICABLE | INSPIRE | low | XL | ok |  |
| 24 | sweeper-misc | commitlint config + husky commit-msg hook | MISSING | ADAPT | medium | S | ok |  |
| 24 | sweeper-misc | Neon PR-branch cleanup workflow | PARTIAL | ADAPT | high | S | ok |  |
| 24 | sweeper-misc | Non-gating nightly persona matrix (mobile.yml) | NOT_APPLICABLE | INSPIRE | low | M | ok |  |
| 24 | sweeper-misc | docker-compose.local.yml (Postgres + two Neon proxies) | MISSING | COPY | high | S | ok |  |
| 24 | sweeper-misc | design/qa measurement-first design QA harness (audit.py + REVIEW.md) | MISSING | INSPIRE | medium | L | ok |  |
| 24 | sweeper-misc | .gitattributes *.pen -merge rule | MISSING | COPY | medium | S | ok |  |
| 24 | sweeper-misc | setup-github-labels.ts (pnpm labels:sync) | MISSING | ADAPT | low | S | REFUTED |  |
| 24 | sweeper-misc | GitHub issue-form templates + their contract test | MISSING | ADAPT | medium | S | ok |  |
| 24 | sweeper-misc | @quagga/types groups / payments / categories vocabularies | NOT_APPLICABLE | SKIP | low | S | ok |  |
| 24 | sweeper-misc | @quagga/types accounts vocabularies (deletion grace, email change, capability matrix, security events) | PARTIAL | INSPIRE | medium | M | ok | DEFERRED.md — 'captain-initiated account erasure'; operator action 'delete the upstream Neon Auth identity man |
