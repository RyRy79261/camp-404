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
//   - access/clearance: rankLevel, hasClearance, deriveViewerRank,
//     hasCampAccess, isApproved, nextGate (./access)
//   - family tree: buildTree, computeMatchIds, subtreeHasMatch,
//     descendantCountLabel (./family-tree) — all cycle-guarded (OD9)
// Still to come: invites, the questionnaire catalogue + validateIdNumber,
// promotion guards/state-machine, mcp helpers, and platform utils.

export * from "./access";
export * from "./family-tree";
