// The invite-code availability state machine, shared by the form and the
// availability-hint leaf (and their tests). `checking` is the debounced
// in-flight GET; `invalid` carries the rules hint to show inline.
export type Availability =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available" }
  | { state: "taken" }
  | { state: "invalid"; hint: string };
