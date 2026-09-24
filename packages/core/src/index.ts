// @camp404/core — pure, framework-agnostic business logic + validation.
//
// Dependency rule (see design/spec/impl/architecture.md §layering):
//   types ← core ← ui ← apps
// This package depends ONLY on @camp404/types. It MUST NOT import
// @camp404/db, next/*, server-only, React, read process.env, or perform any
// I/O. That is what keeps it testable without a DB or route harness and
// reusable by apps/web, apps/admin-cli, apps/mobile, packages/ui, and tests.
//
// Phase-3 extractions land here progressively (see architecture.md
// §hybrid-extraction). Landed so far:
//   - access/clearance: rankLevel, hasClearance, requireClearance,
//     deriveViewerRank, hasCampAccess, isApproved, canViewBuilderDefinition
//     (./access)
//   - approval review: availableReviewActions, reviewRefusal,
//     isReviewTransition — which vetting decisions exist (./approval-review)
//   - family tree: buildTree, computeLiteralMatchIds, computeMatchIds,
//     subtreeHasMatch, descendantCountLabel, referralRosterForViewer
//     (./family-tree) — all
//     cycle-guarded (OD9)
//   - invites: generateInviteCode, isSyntacticallyValidCode, CODE_RULES_HINT
//     (./invites)
//   - text utils: initialsFrom, slugify, humanizeKey, defaultTeamLabel
//     (./text-utils)
//   - markdown → plain text: plainPreview — the strip every plain-text
//     boundary shares (push, email, Telegram, clipped rows) (./markdown-text)
//   - text redaction: redactPii, sanitizeReportText (both return a
//     RedactionResult: the text and the RedactionKind[] found),
//     describeRedactions, redactSecrets + SECRET_ENV_KEYS (./text-redaction)
//   - GitHub labels: GITHUB_LABELS, the issue label taxonomy, and
//     reportLabels for the in-app reporter (./github-labels)
//   - shake detector: createShakeDetector + ShakeSample/ShakeDetectorConfig
//     (./shake); the React hook + DOM permission helpers stay in apps/web
//   - id validation: validateIdNumber, validateBirthDate, IdValidationResult
//     (./id-validation)
//   - promotion: canSendPromotion, canDecidePromotion, nextPromotionStatus,
//     promotionStepState, canLeaveCamp — the captain-handshake guards +
//     state machine, and the sole-captain erasure guard
//     (./promotion)
//   - field privacy: ALWAYS_PRIVATE, SAFETY_VISIBLE, isFieldLocked,
//     isSafetyVisible; who reads each member field (MEMBER_FIELD_READERS,
//     PROFILE_ANSWER_READERS, canReadMemberField, canReadProfileAnswer); and
//     the safety read rule safetyReadBasis + MEDICAL_AUDIENCE_NOTE; and the
//     erasure provers uncoveredPrivateUserColumns, patchLeaksAny (./privacy)
//   - audience authz: canSendToAudience + AudienceScope/AudienceActor/
//     AudienceSpec — who may send to which audience (./audience-authz)
//   - member export: MEMBER_EXPORT_COLUMNS, memberExportColumnsFor — the
//     roster CSV's columns by rank, from the field list (./member-export)
//   - payment references: formatMemberRefCode, paymentReference,
//     PAYMENT_STATUSES, paymentSettlesDues (./payment-references)
//   - money: CURRENCIES, DEFAULT_CURRENCY, isCurrency, UnknownCurrencyError,
//     formatMoney, parseMoneyToMinor, decimalToMinor, sumMinor — money is in
//     rands (ZAR) only, with one formatter; formatForeignEquivalent and
//     FOREIGN_CURRENCIES label a rand amount in USD or EUR at a rate a captain
//     typed, and store nothing (./money)
//   - CSV: escapeCsvCell, toCsv/toCsvFile, CSV_BOM/CSV_EOL/CSV_MIME,
//     neutraliseFormula, csvFilenamePart (./csv) — the ONE spreadsheet
//     serialiser; the questionnaire export and WP9's roster export share it
//   - questionnaire CSV: EMPTY_ANSWER, buildQuestionnaireCsv(Rows|Export),
//     questionnaireCsvFilename, displayOrphanedAnswer, collectOrphanFieldIds,
//     ORPHAN_LABEL/ORPHAN_COLUMN_SUFFIX
//     (./questionnaire-csv)
//   - questionnaire results: aggregateResponses / aggregateQuestions /
//     aggregateQuestion + tallyActivationCompletion, with KIND_SHAPE and the
//     Choice/Numeric/Count/Timeline/Grid aggregate shapes — the per-question
//     read-back engine and the activation completion figure
//     (./questionnaire-results)
//   - questionnaire definition validation (the unified model, ported from
//     AB): validateQuestionnaireDefinition, isValidQuestionnaireDefinition,
//     definitionLimitErrors (./questionnaire-definition)
//   - questionnaire runtime (the unified model, ported from AB): goTo/next
//     routing and visibleIf visibility (nextPageId, firstPageId, resolvePath,
//     visibleQuestions, isPageVisible, isBlockVisible, visibleBlocks),
//     progress (deriveProgress), branch-aware submit validation
//     (validateSubmission) and seeded shuffles (presentationBlocks,
//     presentationOptions) (./questionnaire-runtime)
//   - questionnaire versioning: classifyChange — whether a re-publish is
//     cosmetic or breaking, over unified definitions (./questionnaire-versioning)
//   - questionnaire submission: boundDraftResponses (a draft's key allow-list
//     and size cap) and questionnaireRoleMirror (the answers a submit copies
//     into the app's own tables) (./questionnaire-submission)
//   - questionnaire copy: regenerateQuestionnaireIds — fresh ids for a
//     duplicate, references remapped (./questionnaire-copy)
//   - notification links: notificationLink, NOTIFICATION_FALLBACK_LINK — where
//     tapping an inbox row or a push opens (./notification-links)
//   - time zone: CAMP_TIME_ZONE, the zone every human-read date is formatted
//     in (./time-zone)
//   - questionnaire status: memberQuestionnaireStatuses — where each
//     questionnaire stands for one member (./questionnaire-status)
//   - participation: participationAfterIntent, isParticipationDecision,
//     PARTICIPATION_LABEL, NOT_ANSWERED_LABEL — who is coming this year, how a
//     member's answer moves it and which moves a captain may make
//     (./participation)
//   - power: canEditPower (a captain or a Power & Lighting lead), the load
//     maths (loadWatts, energyPerDay, hourlyBuckets, peakLoad,
//     surgeHeadroomWatts, amps at MAINS_VOLTS, generatorLoadPct, loadBand,
//     powerTotals, dayLabel)
//     and the fuel maths (fuelLine, fuelPerHour, fuelForPlan,
//     jerryCansNeeded, legacyFuelEstimate) (./power)
//   - recipes: canApproveRecipe and canRunProofread (a captain or a Kitchen
//     lead), RECIPE_TRANSITIONS/canMoveRecipe, groupLinesByCategory +
//     groupStepsByPhase for the recipe page, defaultPlates, and the meal
//     plan's canEditMealPlan, mealPlanPlateCounts, mealPlanPeaks and
//     mealPlanDayLabel (./recipes)
//   - recipe sources: sourceText (the Markdown-like text Claude reads),
//     sourceFromText (pasted text into sections), emptySourceSections,
//     sameSections and sameSource (./recipe-source)
// Deliberately NOT here: isAuthorizedCron (needs node:crypto/Buffer — core has
// no @types/node by design so it stays runtime-neutral for ui/mobile) and
// rateLimit (module-level mutable state).
// Still to come: the questionnaire catalogue, and the mcp consent helpers
// (blocked on deciding McpScope's type home).

export * from "./access";
export * from "./approval-review";
export * from "./family-tree";
export * from "./invites";
export * from "./text-utils";
export * from "./markdown-text";
export * from "./text-redaction";
export * from "./report-screen";
export * from "./github-labels";
export * from "./shake";
export * from "./id-validation";
export * from "./promotion";
export * from "./privacy";
export * from "./member-export";
export * from "./payment-references";
export * from "./money";
export * from "./audience-authz";
export * from "./pinned-order";
export * from "./csv";
export * from "./questionnaire-csv";
export * from "./questionnaire-results";
export * from "./questionnaire-definition";
export * from "./questionnaire-runtime";
export * from "./questionnaire-versioning";
export * from "./questionnaire-submission";
export * from "./questionnaire-copy";
export * from "./notification-links";
export * from "./notifications";
export * from "./read-rate";
export * from "./duration";
export * from "./audit-actions";
export * from "./notification-days";
export * from "./notification-email";
export * from "./time-zone";
export * from "./questionnaire-status";
export * from "./password";
export * from "./participation";
export * from "./power";
export * from "./recipes";
export * from "./recipe-source";
