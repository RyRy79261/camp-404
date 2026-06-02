// Re-export shim: the implementation now lives in @camp404/core so it can be
// shared across apps. Existing call sites importing from "@/lib/id-validation"
// stay unchanged.
export { validateIdNumber } from "@camp404/core";
export type { IdValidationResult } from "@camp404/core";
