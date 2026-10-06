import type { VoiceOutcome } from "../resolve";
import { openProposal } from "../seal";
import type { ArgMatch, EvalCase, Expect, ExpectedAction } from "./cases";

// How an eval case is scored (#356):
//  - exact: what the captain is shown is what the case expects;
//  - wrong: a write that would run is not what the captain meant (an action
//    that matches nothing expected, or a guess where a question was due).
//    The merge bar is zero of these, in every run;
//  - needless: a question or a refusal where a plain list was right (at
//    most 10%);
//  - short: not wrong and not needless, but not exact either (a list missing
//    an action, a refusal where a question was due).

//  - error: Claude could not be reached (a rate limit, an outage). Says
//    nothing about the model; a run with any is run again, never passed.
export type Grade = "exact" | "wrong" | "needless" | "short" | "error";

export interface ProposedAction {
  tool: string;
  args: Record<string, unknown>;
}

/** What one outcome would do, read back from its sealed lists. */
export function actionsOf(
  outcome: VoiceOutcome,
  key: string,
  who: { userId: string; sessionId: string },
): {
  list: ProposedAction[] | null;
  ask: { options: ProposedAction[]; waiting: ProposedAction[] } | null;
} {
  const open = (token: string) => {
    const opened = openProposal(token, key, who, 0);
    if (!opened.ok)
      throw new Error(`eval: cannot open a list (${opened.reason})`);
    return opened.body.actions.map((a) => ({ tool: a.tool, args: a.args }));
  };
  if (outcome.kind === "list") return { list: open(outcome.token), ask: null };
  if (outcome.kind === "ask") {
    const lists = outcome.options.map((o) => open(o.token));
    const at = outcome.options[0]!.rows.indexOf(outcome.options[0]!.choice);
    const index = at >= 0 ? at : 0;
    return {
      list: null,
      ask: {
        options: lists.map((l) => l[index]!),
        waiting: lists[0]!.filter((_, i) => i !== index),
      },
    };
  }
  return { list: null, ask: null };
}

function argMatches(expected: ArgMatch, actual: unknown): boolean {
  if (expected && typeof expected === "object" && "has" in expected) {
    return (
      typeof actual === "string" &&
      actual
        .toLowerCase()
        .includes(String((expected as { has: string }).has).toLowerCase())
    );
  }
  return JSON.stringify(expected) === JSON.stringify(actual);
}

export function matches(
  expected: ExpectedAction,
  actual: ProposedAction,
): boolean {
  if (expected.tool !== actual.tool) return false;
  return Object.entries(expected.args).every(([k, v]) =>
    argMatches(v, actual.args[k]),
  );
}

/** Whether `actual` is exactly `expected`, as multisets. */
function sameSet(
  expected: readonly ExpectedAction[],
  actual: readonly ProposedAction[],
): boolean {
  if (expected.length !== actual.length) return false;
  const left = [...actual];
  for (const e of expected) {
    const i = left.findIndex((a) => matches(e, a));
    if (i < 0) return false;
    left.splice(i, 1);
  }
  return true;
}

/** Every action proposed is one expected (none is a stranger). */
function allExpected(
  expected: readonly ExpectedAction[],
  actual: readonly ProposedAction[],
): boolean {
  return actual.every((a) => expected.some((e) => matches(e, a)));
}

export function gradeAgainst(
  expect: Expect,
  outcome: VoiceOutcome,
  actions: ReturnType<typeof actionsOf>,
): Grade {
  switch (expect.kind) {
    case "either": {
      const grades = expect.of.map((e) => gradeAgainst(e, outcome, actions));
      for (const g of ["exact", "short", "needless", "wrong"] as const) {
        if (grades.includes(g)) return g;
      }
      return "wrong";
    }
    case "list": {
      if (actions.list) {
        if (!allExpected(expect.actions, actions.list)) return "wrong";
        return sameSet(expect.actions, actions.list) ? "exact" : "short";
      }
      if (actions.ask) {
        // The waiting actions would run once an option is picked.
        const pool = [...actions.ask.waiting];
        if (!allExpected(expect.actions, pool)) return "wrong";
        return "needless";
      }
      return "needless";
    }
    case "ask": {
      const expectedAll = [...expect.options, ...(expect.waiting ?? [])];
      if (actions.list) {
        // A guess where a question was due: wrong if it picked an option.
        return "wrong";
      }
      if (actions.ask) {
        if (!allExpected(expectedAll, [...actions.ask.waiting])) return "wrong";
        const optionsRight = sameSet(expect.options, actions.ask.options);
        const waitingRight = sameSet(expect.waiting ?? [], actions.ask.waiting);
        if (!allExpected(expect.options, actions.ask.options)) return "short";
        return optionsRight && waitingRight ? "exact" : "short";
      }
      return "short";
    }
    case "answers": {
      if (actions.list || actions.ask) return "wrong";
      return outcome.kind === "answers" ? "exact" : "needless";
    }
    case "refused": {
      if (actions.list) return "wrong";
      if (actions.ask) return "short";
      return outcome.kind === "refused" ? "exact" : "short";
    }
  }
}

export function gradeCase(
  c: EvalCase,
  outcome: VoiceOutcome,
  key: string,
  who: { userId: string; sessionId: string },
): Grade {
  return gradeAgainst(c.expect, outcome, actionsOf(outcome, key, who));
}

export interface Tally {
  total: number;
  exact: number;
  wrong: number;
  needless: number;
  short: number;
  error: number;
}

export function tally(grades: readonly Grade[]): Tally {
  return {
    total: grades.length,
    exact: grades.filter((g) => g === "exact").length,
    wrong: grades.filter((g) => g === "wrong").length,
    needless: grades.filter((g) => g === "needless").length,
    short: grades.filter((g) => g === "short").length,
    error: grades.filter((g) => g === "error").length,
  };
}

/** The merge bar: no wrong action, 90% exact, at most 10% needless. */
export function meetsBar(t: Tally): boolean {
  return (
    t.error === 0 &&
    t.wrong === 0 &&
    t.exact / t.total >= 0.9 &&
    t.needless / t.total <= 0.1
  );
}
