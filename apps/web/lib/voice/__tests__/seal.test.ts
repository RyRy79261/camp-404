import { describe, expect, it } from "vitest";
import {
  PROPOSAL_TTL_MS,
  openProposal,
  sealKey,
  sealProposal,
  type SealedAction,
} from "../seal";

// The sealed list (#356, defence 7): bound to one captain and one sign-in,
// five minutes, and any change to a byte refuses it.

const KEY = sealKey({ BETTER_AUTH_SECRET: "a-test-secret-of-some-length" } as unknown as NodeJS.ProcessEnv);
const ME = { userId: "11111111-1111-4111-8111-111111111111", sessionId: "s-1" };
const ACTION: SealedAction = {
  tool: "move_task",
  args: { taskId: "22222222-2222-4222-8222-222222222222", from: "open", to: "done" },
  sentence: "Move “Paint the dome” from To do to Done",
  facts: "Tasks",
  path: "/tasks",
  dependsOn: null,
};

describe("the sealed list", () => {
  it("opens for the captain and sign-in it was made for, inside five minutes", () => {
    const now = 1_000_000;
    const { token, body } = sealProposal({ ...ME, actions: [ACTION] }, KEY, now);
    expect(body.exp).toBe(now + PROPOSAL_TTL_MS);
    const opened = openProposal(token, KEY, ME, now + PROPOSAL_TTL_MS - 1);
    expect(opened).toEqual({ ok: true, body });
  });

  it("refuses another user, another sign-in of the same user, and an expired list", () => {
    const now = 1_000_000;
    const { token } = sealProposal({ ...ME, actions: [ACTION] }, KEY, now);
    expect(openProposal(token, KEY, { ...ME, userId: "33333333-3333-4333-8333-333333333333" }, now)).toEqual({
      ok: false,
      reason: "not_yours",
    });
    expect(openProposal(token, KEY, { ...ME, sessionId: "s-2" }, now)).toEqual({
      ok: false,
      reason: "not_yours",
    });
    expect(openProposal(token, KEY, ME, now + PROPOSAL_TTL_MS)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("refuses a list changed after it was made, or sealed with another key", () => {
    const { token } = sealProposal({ ...ME, actions: [ACTION] }, KEY);
    const [payload, sig] = token.split(".");
    const body = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8"));
    body.actions[0].args.to = "open";
    const edited = `${Buffer.from(JSON.stringify(body)).toString("base64url")}.${sig}`;
    expect(openProposal(edited, KEY, ME)).toEqual({ ok: false, reason: "tampered" });
    // The same edit, re-signed with any other key, is still refused.
    const other = sealKey({ BETTER_AUTH_SECRET: "another-secret" } as unknown as NodeJS.ProcessEnv);
    const forged = sealProposal({ ...ME, actions: [ACTION] }, other).token;
    expect(openProposal(forged, KEY, ME)).toEqual({ ok: false, reason: "tampered" });
    expect(openProposal("not-a-token", KEY, ME)).toEqual({ ok: false, reason: "tampered" });
    expect(openProposal(`${token}.extra`, KEY, ME)).toEqual({ ok: false, reason: "tampered" });
  });

  it("gives each list its own id, so spending one never spends another", () => {
    const a = sealProposal({ ...ME, actions: [ACTION] }, KEY).body.id;
    const b = sealProposal({ ...ME, actions: [ACTION] }, KEY).body.id;
    expect(a).not.toBe(b);
  });
});
