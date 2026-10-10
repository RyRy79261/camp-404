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
  /**
   * Claims the list's id once: true when this run claimed it, false when it
   * was already spent, null when it could not be counted (nothing runs then).
   */
  spend: (proposalId: string) => Promise<boolean | null>;
  /** One tool as the signed-in person (lib/voice/tools callTool). */
  call: (
    tool: string,
    args: unknown,
    userId: string,
  ) => Promise<ToolCallResult>;
  now?: number;
}

/**
 * A save that moves a version on, and the later actions on the same thing
 * that were given the version read before it (#356, audit 2 voice-mcp-1).
 * "Change the chapter, then publish it" in one list: the publish was sealed
 * with the version the captain read, and the change just before it moved
 * that version on by one, so the publish would always refuse as "someone
 * else saved". When the save worked, the later action runs on the version
 * the save returned instead: the captain's own change, seen on this list,
 * and still a compare-and-set, so a third person's save in between is
 * refused as before.
 */
const CARRIES_VERSION: Readonly<Record<string, readonly string[]>> = {
  update_document: ["update_document", "publish_document"],
  update_meeting_notes: ["update_meeting_notes"],
  update_team_description: ["update_team_description"],
};

/** The version a done save returned, when it is one later rows carry. */
function savedVersion(tool: string, data: unknown): number | null {
  if (!CARRIES_VERSION[tool]) return null;
  const version = (data as { version?: unknown } | null)?.version;
  return typeof version === "number" && Number.isInteger(version)
    ? version
    : null;
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
  const spent = await deps.spend(body.id);
  if (spent === null) {
    return {
      ok: false,
      message:
        "Voice could not check that list just now. Nothing ran: press Do again.",
    };
  }
  if (!spent) return { ok: false, message: OPEN_REFUSALS.spent };
  const chosen = new Set(ticked);
  const results: RowResult[] = [];
  const versions = new Map<number, number>();
  for (const [index, action] of body.actions.entries()) {
    const base = { index, sentence: action.sentence, path: action.path };
    if (!chosen.has(index)) {
      results.push({
        ...base,
        status: "unticked",
        detail: "Not ticked. Nothing changed.",
      });
      continue;
    }
    if (action.blocked) {
      results.push({
        ...base,
        status: "not_done",
        detail: `${action.blocked} Nothing changed.`,
      });
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
    let args = action.args;
    if (action.dependsOn !== null && "expectedVersion" in args) {
      const before = body.actions[action.dependsOn]!;
      const version = versions.get(action.dependsOn);
      if (
        version !== undefined &&
        CARRIES_VERSION[before.tool]?.includes(action.tool)
      ) {
        args = { ...args, expectedVersion: version };
      }
    }
    let result: ToolCallResult;
    try {
      result = await deps.call(action.tool, args, body.userId);
    } catch {
      result = { ok: false, error: "Something went wrong. Nothing changed." };
    }
    if (result.ok) {
      const version = savedVersion(action.tool, result.data);
      if (version !== null) versions.set(index, version);
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
