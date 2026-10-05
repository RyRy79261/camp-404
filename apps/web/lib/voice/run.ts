import { doneDetail } from "./previews";
import { OPEN_REFUSALS, openProposal, type ProposalBody } from "./seal";
import type { ToolCallResult } from "./tools";

// Do (#356): the ticked actions of a sealed list run in the listed order, one
// by one, each through its own connector tool (fresh scope, its gate, its own
// lock and compare-and-set, its own audit row), and each gets its own result.
// Not one transaction: the tools own theirs, and a failure in one must never
// hide another (design, section 4). An action that needs an earlier one is
// skipped when that one did not work. The list is spent before anything
// runs, so pressing Do twice cannot run anything twice.

export type RowStatus = "done" | "not_done" | "skipped" | "unticked";

export interface RowResult {
  index: number;
  status: RowStatus;
  sentence: string;
  /** Why it did not run, or what the tool said it did. */
  detail: string | null;
  path: string | null;
}

export type RunResult =
  | { ok: true; results: RowResult[] }
  | { ok: false; message: string };

export interface RunDeps {
  key: string;
  who: { userId: string; sessionId: string };
  /** Whether the person is still a captain, read now. */
  stillCaptain: () => Promise<boolean>;
  /** Claims the list's id once; false when it was already spent (or cannot be counted). */
  spend: (proposalId: string) => Promise<boolean>;
  /** One tool as the signed-in person (lib/voice/tools callTool). */
  call: (tool: string, args: unknown, userId: string) => Promise<ToolCallResult>;
  now?: number;
}

/** Past-tense sentence for a done row, from the row's own sentence. */
function doneSentence(sentence: string): string {
  return sentence
    .replace(/^Sign you up for /, "You are on ")
    .replace(/^Take you off /, "You are off ")
    .replace(/^Say you can help on /, "You can help on ")
    .replace(/^Say you might help on /, "You might help on ")
    .replace(/^Say you can't help on /, "You can't help on ");
}

export async function runSealedList(
  token: string,
  ticked: readonly number[],
  deps: RunDeps,
): Promise<RunResult> {
  const opened = openProposal(token, deps.key, deps.who, deps.now);
  if (!opened.ok) return { ok: false, message: OPEN_REFUSALS[opened.reason] };
  const body: ProposalBody = opened.body;
  if (!(await deps.stillCaptain())) {
    return { ok: false, message: "Voice is for captains. Nothing ran." };
  }
  if (!(await deps.spend(body.id))) {
    return { ok: false, message: OPEN_REFUSALS.spent };
  }
  const chosen = new Set(ticked);
  const results: RowResult[] = [];
  for (const [index, action] of body.actions.entries()) {
    const base = { index, sentence: action.sentence, path: action.path };
    if (!chosen.has(index)) {
      results.push({ ...base, status: "unticked", detail: "Not ticked. Nothing changed." });
      continue;
    }
    if (action.blocked) {
      results.push({ ...base, status: "not_done", detail: `${action.blocked} Nothing changed.` });
      continue;
    }
    if (action.dependsOn !== null) {
      const before = results[action.dependsOn];
      if (!before || before.status !== "done") {
        results.push({
          ...base,
          status: "skipped",
          detail: `Skipped: ${action.dependsOn + 1} didn't work. Nothing changed.`,
        });
        continue;
      }
    }
    let result: ToolCallResult;
    try {
      result = await deps.call(action.tool, action.args, body.userId);
    } catch {
      result = { ok: false, error: "Something went wrong. Nothing changed." };
    }
    results.push(
      result.ok
        ? {
            ...base,
            status: "done",
            sentence: `${doneSentence(action.sentence)}.`,
            detail: doneDetail(action.tool, result.data),
          }
        : {
            ...base,
            status: "not_done",
            detail: /nothing changed/i.test(result.error)
              ? result.error
              : `${result.error} Nothing changed.`,
          },
    );
  }
  return { ok: true, results };
}
