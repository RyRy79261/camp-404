import { describe, expect, it, vi } from "vitest";
import { runSealedList, type RunDeps } from "../run";
import { sealKey, sealProposal, type SealedAction } from "../seal";

// Do (#356): ticked actions in order, one by one, each with its own result; a
// dependent action skipped when the one it needs did not work; the list spent
// before anything runs.

const KEY = sealKey({
  BETTER_AUTH_SECRET: "run-test-secret",
} as unknown as NodeJS.ProcessEnv);
const ME = { userId: "11111111-1111-4111-8111-111111111111", sessionId: "s-1" };

const action = (
  tool: string,
  dependsOn: number | null = null,
  blocked?: string,
): SealedAction => ({
  tool,
  args: { n: tool },
  sentence: `Do ${tool}`,
  facts: "",
  path: "/x",
  dependsOn,
  ...(blocked ? { blocked } : {}),
});

function deps(
  over: Partial<RunDeps> = {},
): RunDeps & { call: ReturnType<typeof vi.fn> } {
  const call = vi.fn(async (tool: string) =>
    tool === "fails"
      ? { ok: false as const, error: "Someone moved it first." }
      : { ok: true as const, data: {} },
  );
  return {
    key: KEY,
    who: ME,
    stillCaptain: async () => true,
    spend: async () => true,
    call,
    ...over,
  } as RunDeps & { call: ReturnType<typeof vi.fn> };
}

describe("running a sealed list", () => {
  it("runs the ticked actions in order, and one failing hides none of the others", async () => {
    const { token } = sealProposal(
      { ...ME, actions: [action("a"), action("fails"), action("c")] },
      KEY,
    );
    const d = deps();
    const run = await runSealedList(token, [0, 1, 2], d);
    expect(d.call.mock.calls.map((c) => c[0])).toEqual(["a", "fails", "c"]);
    // Always as the captain the list was sealed for.
    expect(d.call.mock.calls.every((c) => c[2] === ME.userId)).toBe(true);
    expect(run.ok && run.results.map((r) => r.status)).toEqual([
      "done",
      "not_done",
      "done",
    ]);
    expect(run.ok && run.results[1]!.detail).toBe(
      "Someone moved it first. Nothing changed.",
    );
  });

  it("skips an action whose earlier one did not work, or was unticked", async () => {
    const { token } = sealProposal(
      {
        ...ME,
        actions: [action("fails"), action("b", 0), action("c"), action("d", 2)],
      },
      KEY,
    );
    const d = deps();
    const run = await runSealedList(token, [0, 1, 3], d);
    expect(d.call.mock.calls.map((c) => c[0])).toEqual(["fails"]);
    expect(run.ok && run.results.map((r) => r.status)).toEqual([
      "not_done",
      "skipped",
      "unticked",
      "skipped",
    ]);
    expect(run.ok && run.results[1]!.detail).toBe(
      "Skipped: 1 didn't work. Nothing changed.",
    );
  });

  it("never runs a row the preview found could not be done", async () => {
    const { token } = sealProposal(
      { ...ME, actions: [action("a", null, "You are already on it.")] },
      KEY,
    );
    const d = deps();
    const run = await runSealedList(token, [0], d);
    expect(d.call).not.toHaveBeenCalled();
    expect(run.ok && run.results[0]).toMatchObject({
      status: "not_done",
      detail: "You are already on it. Nothing changed.",
    });
  });

  it("runs a list once: the second press runs nothing", async () => {
    const spent = new Set<string>();
    const spend = async (id: string) =>
      spent.has(id) ? false : (spent.add(id), true);
    const { token } = sealProposal({ ...ME, actions: [action("a")] }, KEY);
    const d = deps({ spend });
    expect((await runSealedList(token, [0], d)).ok).toBe(true);
    expect(await runSealedList(token, [0], d)).toEqual({
      ok: false,
      message: "That list has already run. Nothing ran twice.",
    });
    expect(d.call).toHaveBeenCalledTimes(1);
  });

  it("runs nothing for another person, or for someone who is no longer a captain", async () => {
    const { token } = sealProposal({ ...ME, actions: [action("a")] }, KEY);
    const other = deps({
      who: { userId: "99999999-9999-4999-8999-999999999999", sessionId: "s-9" },
    });
    expect((await runSealedList(token, [0], other)).ok).toBe(false);
    expect(other.call).not.toHaveBeenCalled();

    const spend = vi.fn(async () => true);
    const demoted = deps({ stillCaptain: async () => false, spend });
    expect(await runSealedList(token, [0], demoted)).toEqual({
      ok: false,
      message: "Voice is for captains. Nothing ran.",
    });
    expect(demoted.call).not.toHaveBeenCalled();
    // A refused run does not spend the list.
    expect(spend).not.toHaveBeenCalled();
  });
});
