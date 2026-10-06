import { WEBSITE_ONLY } from "../mcp/capabilities";
import type { McpScope } from "../mcp/scope";
import { usesTestStore } from "../test-mode";
import type { LoopOutcome, Proposed, ReadRecord } from "./command";
import { MAX_ACTIONS, MAX_ANSWERS } from "./command";
import { lookAlikes, wordsSingleOut } from "./names";
import { PREVIEWS, type Preview } from "./previews";
import type { RosterPerson } from "./reads";
import { sealProposal, type SealedAction } from "./seal";
import { parseArgs, type VoiceTool } from "./tools";

// The server's half of a command (#356, "no mistakes" defences 2 to 5): what
// Claude proposed is checked against the camp before the captain sees it.
//
//  - Every action must be a write tool this captain may use, with arguments
//    its own schema accepts, and every id in them must have come back from a
//    read in this command (provenance). Anything else refuses the whole
//    command: a list with one thing quietly dropped is a list the captain
//    did not ask for.
//  - A person the captain named who has a look-alike on the roster, or a
//    claim that is one of several waiting from the same person, becomes the
//    two-choice question, whatever Claude chose. More than two fits: refused.
//  - Each action's sentence comes from its preview (lib/voice/previews.ts),
//    and the server, never Claude, decides which action waits for which.
//  - The list is sealed to the captain and their session (lib/voice/seal.ts).

export interface VoiceRow {
  tool: string;
  sentence: string;
  facts: string;
  path: string | null;
  /** Runs only if this earlier row (its index) worked. */
  dependsOn: number | null;
  /** It cannot be done as things stand. */
  blocked: string | null;
}

export interface VoiceAnswer {
  text: string;
  path: string | null;
}

export interface SealedList {
  rows: VoiceRow[];
  token: string;
  expiresAt: number;
}

export type VoiceOutcome =
  | ({
      kind: "list";
      answers: VoiceAnswer[];
      /** "That was more than five things…" */
      note: string | null;
    } & SealedList)
  | {
      kind: "ask";
      answers: VoiceAnswer[];
      question: string;
      options: (SealedList & { choice: VoiceRow })[];
      /** The other actions, shown with the question before anything runs. */
      waiting: VoiceRow[];
    }
  | { kind: "answers"; answers: VoiceAnswer[] }
  | {
      kind: "refused";
      answers: VoiceAnswer[];
      message: string;
      path: string | null;
    };

export const SAY_AGAIN =
  "I couldn't match everything you said to the camp, so nothing is listed. Say it again, naming each thing.";
export const TOO_MANY =
  "That was more than five things. Say the rest after these.";

const ERRORS: Record<Extract<LoopOutcome, { kind: "error" }>["code"], string> =
  {
    no_reply: "I couldn't work out what to do. Say it again.",
    refusal: "I can't do that by voice. Do it on its page.",
    timeout: "That took too long. Nothing changed: say it again.",
    claude_down:
      "Voice can't reach Claude right now. Nothing changed: try again in a minute.",
    too_long: "That was too much at once. Nothing changed: say it in parts.",
  };

/** The person each write tool acts on, by argument. */
const PERSON_ARGS: Readonly<Record<string, readonly string[]>> = {
  assign_team_membership: ["userId"],
  remove_team_membership: ["userId"],
  set_team_lead: ["userId"],
  add_task: ["assigneeId"],
  add_car_rider: ["memberUserId", "driverUserId"],
  remove_car_rider: ["memberUserId", "driverUserId"],
  request_lift: ["driverUserId"],
  add_inventory_item: ["custodianUserId"],
  propose_inventory_change: ["custodianUserId"],
};

/** Arguments that name a row by something other than a uuid. */
const NAMED_ARGS: Readonly<Record<string, readonly string[]>> = {
  revoke_invite_code: ["code"],
  update_document: ["slug"],
  publish_document: ["slug"],
  update_questionnaire_draft: ["key"],
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every string a read returned in this command. */
export function readStrings(reads: readonly ReadRecord[]): Set<string> {
  const seen = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "string") seen.add(v.toLowerCase());
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  reads.forEach((r) => walk(r.data));
  return seen;
}

/** Whether every id in `args` came back from a read (provenance). */
export function hasProvenance(
  tool: string,
  args: Record<string, unknown>,
  seen: ReadonlySet<string>,
  self: string,
): boolean {
  const ids: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string" && UUID.test(v)) ids.push(v.toLowerCase());
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(args);
  for (const key of NAMED_ARGS[tool] ?? []) {
    const value = args[key];
    if (typeof value === "string") ids.push(value.toLowerCase());
  }
  return ids.every((id) => id === self.toLowerCase() || seen.has(id));
}

export interface WaitingClaim {
  id: string;
  submitterId: string | null;
  submitterName: string | null;
  description: string;
  amountCents: number;
  teamLabel: string | null;
}

export interface ResolveDeps {
  scope: McpScope;
  tools: readonly VoiceTool[];
  words: string;
  sessionId: string;
  sealKey: string;
  now: Date;
  readRoster: () => Promise<RosterPerson[]>;
  /** Claims waiting for a decision that this captain may see (none in the test store). */
  readWaitingClaims: () => Promise<WaitingClaim[]>;
  preview?: (tool: string, args: Record<string, unknown>) => Promise<Preview>;
}

type Checked = { tool: string; args: Record<string, unknown> };

function check(
  p: Proposed,
  byName: ReadonlyMap<string, VoiceTool>,
  seen: ReadonlySet<string>,
  self: string,
): Checked | null {
  const tool = byName.get(p.tool);
  if (!tool || tool.kind !== "write") return null;
  const parsed = parseArgs(tool, p.args);
  if (!parsed.ok) return null;
  if (!hasProvenance(p.tool, parsed.args, seen, self)) return null;
  return { tool: p.tool, args: parsed.args };
}

function refused(
  answers: VoiceAnswer[],
  message: string,
  path: string | null = null,
): VoiceOutcome {
  return { kind: "refused", answers, message, path };
}

function cleanAnswers(raw: readonly VoiceAnswer[]): VoiceAnswer[] {
  return raw.slice(0, MAX_ANSWERS).map((a) => ({
    text: a.text.trim(),
    path: a.path && /^\/[a-z0-9/_?=&.-]{0,120}$/i.test(a.path) ? a.path : null,
  }));
}

/**
 * Where the server finds a second row the captain could have meant, the
 * action with that row instead (the question's other option); null when none.
 * Returns "many" when more than one other could fit.
 */
async function secondChoice(
  action: Checked,
  deps: ResolveDeps,
  roster: RosterPerson[] | null,
  claims: WaitingClaim[] | null,
  targeted: ReadonlySet<string>,
): Promise<{ other: Checked; question: string } | "many" | null> {
  for (const key of PERSON_ARGS[action.tool] ?? []) {
    const id = action.args[key];
    if (typeof id !== "string" || id === deps.scope.campUserId || !roster)
      continue;
    const target = roster.find((p) => p.id === id);
    if (!target) continue;
    const alikes = lookAlikes(target, roster, deps.words);
    if (alikes.length > 1) return "many";
    if (alikes.length === 1) {
      const other = alikes[0]!;
      return {
        other: { tool: action.tool, args: { ...action.args, [key]: other.id } },
        question: `Did you mean ${target.name} or ${other.name}?`,
      };
    }
  }
  if (
    (action.tool === "approve_reimbursement" ||
      action.tool === "reject_reimbursement") &&
    claims
  ) {
    const claim = claims.find((c) => c.id === action.args.id);
    if (claim) {
      const name = claim.submitterName ?? "";
      // What a claim is "called": what it was for, and its team.
      const said = (c: WaitingClaim) => ({
        description: `${c.description} ${c.teamLabel ?? ""}`,
        amountCents: c.amountCents,
      });
      const unclear = claims.filter((c) => {
        if (c.id === claim.id || targeted.has(c.id)) return false;
        const samePerson = c.submitterId === claim.submitterId;
        const alike =
          samePerson ||
          lookAlikes(
            { id: claim.submitterId ?? "", name },
            [{ id: c.submitterId ?? "?", name: c.submitterName ?? "" }],
            deps.words,
          ).length > 0;
        return alike && !wordsSingleOut(deps.words, said(claim), [said(c)]);
      });
      if (unclear.length > 1) return "many";
      if (unclear.length === 1) {
        return {
          other: {
            tool: action.tool,
            args: { ...action.args, id: unclear[0]!.id },
          },
          question: `Which claim did you mean?`,
        };
      }
    }
  }
  return null;
}

/** Index of the nearest earlier row sharing a key this one needs. */
function dependencies(previews: readonly Preview[]): (number | null)[] {
  return previews.map((p, i) => {
    const needs = p.needs ?? p.keys;
    for (let j = i - 1; j >= 0; j -= 1) {
      if (previews[j]!.keys.some((k) => needs.includes(k))) return j;
    }
    return null;
  });
}

async function buildList(
  actions: readonly Checked[],
  deps: ResolveDeps,
): Promise<{ list: SealedList; previews: Preview[] }> {
  const preview =
    deps.preview ??
    ((tool: string, args: Record<string, unknown>) =>
      PREVIEWS[tool]!(args, { scope: deps.scope, now: deps.now }));
  const previews: Preview[] = [];
  for (const a of actions) previews.push(await preview(a.tool, a.args));
  const dependsOn = dependencies(previews);
  const sealed: SealedAction[] = actions.map((a, i) => ({
    tool: a.tool,
    args: previews[i]!.args,
    sentence: previews[i]!.sentence,
    facts: previews[i]!.facts,
    path: previews[i]!.path,
    dependsOn: dependsOn[i]!,
    ...(previews[i]!.blocked ? { blocked: previews[i]!.blocked } : {}),
  }));
  const { token, body } = sealProposal(
    {
      userId: deps.scope.campUserId,
      sessionId: deps.sessionId,
      actions: sealed,
    },
    deps.sealKey,
    deps.now.getTime(),
  );
  return {
    previews,
    list: {
      token,
      expiresAt: body.exp,
      rows: sealed.map((s) => ({
        tool: s.tool,
        sentence: s.sentence,
        facts: s.facts,
        path: s.path,
        dependsOn: s.dependsOn,
        blocked: s.blocked ?? null,
      })),
    },
  };
}

/** What the captain is shown for a command. */
export async function resolveOutcome(
  outcome: LoopOutcome,
  deps: ResolveDeps,
): Promise<VoiceOutcome> {
  if (outcome.kind === "error") return refused([], ERRORS[outcome.code]);
  const answers = cleanAnswers(outcome.answers);

  if (outcome.unknown.length > 0) return refused(answers, SAY_AGAIN);
  if (outcome.cannot) {
    const place = WEBSITE_ONLY.find((w) => w.path === outcome.cannot!.path);
    return refused(
      answers,
      place
        ? `${outcome.cannot.what || place.what}: that is done on its page, not by voice. ${place.why}`
        : `${outcome.cannot.what}: that is done on its page, not by voice.`,
      place?.path ?? null,
    );
  }
  if (outcome.unsure) return refused(answers, outcome.unsure);

  const byName = new Map(deps.tools.map((t) => [t.name, t]));
  const seen = readStrings(outcome.reads);
  const self = deps.scope.campUserId;

  let writes = outcome.writes;
  let askAt = outcome.ask?.index ?? null;
  const total = writes.length + (outcome.ask ? 1 : 0);
  let note: string | null = null;
  if (total > MAX_ACTIONS) {
    note = TOO_MANY;
    const keep =
      MAX_ACTIONS -
      (outcome.ask && askAt !== null && askAt < MAX_ACTIONS ? 1 : 0);
    writes = writes.slice(0, keep);
    if (askAt !== null && askAt >= MAX_ACTIONS) askAt = null;
  }
  if (writes.length === 0 && askAt === null) {
    return answers.length > 0
      ? { kind: "answers", answers }
      : refused(answers, SAY_AGAIN);
  }

  const checked: Checked[] = [];
  for (const w of writes) {
    const c = check(w, byName, seen, self);
    if (!c) return refused(answers, SAY_AGAIN);
    checked.push(c);
  }
  let ask: {
    question: string;
    options: [Checked, Checked];
    index: number;
  } | null = null;
  if (outcome.ask && askAt !== null) {
    const opts = outcome.ask.options.map((o) => check(o, byName, seen, self));
    if (opts.length !== 2 || opts.some((o) => o === null))
      return refused(answers, SAY_AGAIN);
    ask = {
      question: outcome.ask.question.trim() || "Which did you mean?",
      options: [opts[0]!, opts[1]!],
      index: Math.min(askAt, checked.length),
    };
  }

  // The server's own look for a second fit, on every action Claude did not
  // already ask about.
  const needsRoster = checked.some(
    (c) => PERSON_ARGS[c.tool] || c.tool.endsWith("_reimbursement"),
  );
  const roster = needsRoster ? await deps.readRoster() : null;
  const needsClaims = checked.some((c) => c.tool.endsWith("_reimbursement"));
  const claims =
    needsClaims && !usesTestStore() ? await deps.readWaitingClaims() : null;
  const targeted = new Set(
    checked
      .filter((c) => c.tool.endsWith("_reimbursement"))
      .map((c) => String(c.args.id)),
  );
  for (let i = 0; i < checked.length; i += 1) {
    const second = await secondChoice(
      checked[i]!,
      deps,
      roster,
      claims,
      targeted,
    );
    if (!second) continue;
    if (second === "many" || ask) {
      return refused(
        answers,
        "More than one person or claim could fit what you said. Say it again with their full name, or do it on its page.",
      );
    }
    const [chosen] = checked.splice(i, 1);
    ask = {
      question: second.question,
      options: [chosen!, second.other],
      index: i,
    };
    i -= 1;
  }

  if (!ask) {
    const { list } = await buildList(checked, deps);
    return { kind: "list", answers, note, ...list };
  }

  const options: (SealedList & { choice: VoiceRow })[] = [];
  for (const option of ask.options) {
    const actions = [...checked];
    actions.splice(ask.index, 0, option);
    const { list } = await buildList(actions, deps);
    options.push({ ...list, choice: list.rows[ask.index]! });
  }
  const waiting = options[0]!.rows.filter((_, i) => i !== ask!.index);
  return { kind: "ask", answers, question: ask.question, options, waiting };
}
