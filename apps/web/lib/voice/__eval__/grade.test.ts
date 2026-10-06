import { describe, expect, it } from "vitest";
import type { VoiceOutcome } from "../resolve";
import type { Expect } from "./cases";
import { gradeAgainst, meetsBar, tally, type ProposedAction } from "./grade";

// The eval's scoring (#356): a guess where a question was due is a wrong
// action; a question where a list was right is needless, not wrong.

const A: ProposedAction = { tool: "approve_reimbursement", args: { id: "a" } };
const B: ProposedAction = { tool: "approve_reimbursement", args: { id: "b" } };
const list = (...actions: ProposedAction[]) => ({ list: actions, ask: null });
const ask = (options: ProposedAction[], waiting: ProposedAction[] = []) => ({ list: null, ask: { options, waiting } });
const none = { list: null, ask: null };
const outcome: VoiceOutcome = { kind: "refused", answers: [], message: "", path: null };

describe("grading a case", () => {
  const wantA: Expect = { kind: "list", actions: [{ tool: A.tool, args: { id: "a" } }] };
  const wantAsk: Expect = { kind: "ask", options: [{ tool: A.tool, args: { id: "a" } }, { tool: B.tool, args: { id: "b" } }] };

  it("scores the right list exact, a stranger in it wrong, and a missing one short", () => {
    expect(gradeAgainst(wantA, outcome, list(A))).toBe("exact");
    expect(gradeAgainst(wantA, outcome, list(B))).toBe("wrong");
    expect(gradeAgainst(wantA, outcome, list(A, B))).toBe("wrong");
    expect(gradeAgainst({ kind: "list", actions: [wantA.actions[0]!, { tool: B.tool, args: { id: "b" } }] }, outcome, list(A))).toBe("short");
  });

  it("scores a question or a refusal where a list was right as needless", () => {
    expect(gradeAgainst(wantA, outcome, ask([A, B]))).toBe("needless");
    expect(gradeAgainst(wantA, outcome, none)).toBe("needless");
  });

  it("scores a guess where a question was due as wrong", () => {
    expect(gradeAgainst(wantAsk, outcome, list(A))).toBe("wrong");
    expect(gradeAgainst(wantAsk, outcome, ask([B, A]))).toBe("exact");
    expect(gradeAgainst(wantAsk, outcome, none)).toBe("short");
  });

  it("scores any action where only a refusal was right as wrong", () => {
    expect(gradeAgainst({ kind: "refused" }, outcome, list(A))).toBe("wrong");
    expect(gradeAgainst({ kind: "refused" }, outcome, none)).toBe("exact");
  });

  it("holds the bar: no wrong action, 90% exact, at most 10% needless", () => {
    expect(meetsBar(tally(["exact", "exact", "exact", "exact", "exact", "exact", "exact", "exact", "exact", "needless"]))).toBe(true);
    expect(meetsBar(tally(["exact", "exact", "exact", "exact", "exact", "exact", "exact", "exact", "exact", "wrong"]))).toBe(false);
    expect(meetsBar(tally(["exact", "exact", "exact", "exact", "exact", "exact", "exact", "exact", "short", "short"]))).toBe(false);
  });
});
