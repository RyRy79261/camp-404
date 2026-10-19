// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CANNOT_EDIT,
  CANNOT_MOVE,
  CANNOT_REMOVE,
  NOT_A_MEMBER,
  NOT_A_TASK_AUTHOR,
  NOT_YOUR_TEAM,
  NOT_YOUR_TEAM_TO_MOVE,
  PICK_YOUR_TEAM,
  TASK_GONE,
  TASK_MOVED,
  TEAM_NOT_ACTIVE,
  type TaskBoardStatus,
} from "@camp404/db/tasks";
import { TASK_EDITED, Team } from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { bothWays } from "./_agreement";

// The shared task board, through lib/tasks.ts, on the database and on the E2E
// store: the same people, the same writes, the same answers and refusal
// sentences. Who may add, move, edit and remove a task lives once in
// @camp404/core (taskAddProblem, taskMoveProblem, taskEditProblem,
// taskRemoveProblem); this holds the rest equal. A Kitchen lead is the lead of
// the task's team; the Finance lead is a lead of ANOTHER team. See
// _agreement.ts.
//
// The board lists the soonest deadline first and then the order added, and
// keeps a done task for DONE_VISIBLE_DAYS: each case pins the clock (Date
// only) and moves it between writes, so no two tasks tie.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import {
  addTask,
  editTask,
  listAssignableMembers,
  listBoardTasks,
  listMyOpenTasks,
  moveTask,
  removeTask,
} from "../tasks";

const START = new Date("2027-03-01T10:00:00Z");
const KITCHEN = Team.enum.kitchen;
const FINANCE = Team.enum.finance;
const ACTIVE = [KITCHEN, FINANCE];
const [OPEN, DOING, DONE] = [
  "open",
  "in_progress",
  "done",
] as const satisfies readonly TaskBoardStatus[];

let at = START.getTime();
const tick = () => {
  at += 60_000;
  vi.setSystemTime(new Date(at));
};

const task = (
  creatorId: string,
  team: Team | null,
  title: string,
  assigneeId: string | null = null,
  dueAt: Date | null = null,
) => ({ creatorId, title, description: null, team, assigneeId, dueAt });

/** The id a write answered with, or a throw: the case needs it. */
function added(saved: { ok: boolean; id?: string }): string {
  if (!saved.ok || !saved.id) throw new Error(JSON.stringify(saved));
  return saved.id;
}

describe("the task board: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
    vi.useFakeTimers({ toFake: ["Date"] });
    at = START.getTime();
    vi.setSystemTime(START);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("lets a captain add a task for any team or none and a lead only for a team they lead", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      at = START.getTime();
      vi.setSystemTime(START);
      const pending = await seed.user("Late", { approval: "pending" });
      const camp = await addTask(task(p.captain, null, "Fix the gate"));
      tick();
      const finance = await addTask(
        task(p.captain, FINANCE, "Count the float", p.financeLead),
      );
      tick();
      const kitchen = await addTask(
        task(
          p.kitchenLead,
          KITCHEN,
          "Buy onions",
          p.member,
          new Date("2027-04-20T10:00:00Z"),
        ),
      );
      const leadNoTeam = await addTask(task(p.kitchenLead, null, "Anything"));
      const leadOtherTeam = await addTask(
        task(p.kitchenLead, FINANCE, "Not mine"),
      );
      const member = await addTask(task(p.member, KITCHEN, "Mine?"));
      const toPending = await addTask(
        task(p.captain, KITCHEN, "For someone new", pending),
      );
      const toNobody = await addTask(
        task(p.captain, KITCHEN, "For a stranger", "not-a-member"),
      );
      return {
        camp,
        finance,
        kitchen,
        leadNoTeam,
        leadOtherTeam,
        member,
        toPending,
        toNobody,
        board: await listBoardTasks(new Date(at)),
        assignable: await listAssignableMembers(),
      };
    });
    const refused = (error: string) => ({ ok: false, error });
    expect(db).toMatchObject({
      camp: { ok: true },
      finance: { ok: true },
      kitchen: { ok: true },
      leadNoTeam: refused(PICK_YOUR_TEAM),
      leadOtherTeam: refused(NOT_YOUR_TEAM),
      member: refused(NOT_A_TASK_AUTHOR),
      toPending: refused(NOT_A_MEMBER),
      toNobody: refused(NOT_A_MEMBER),
      board: [
        {
          title: "Buy onions",
          team: KITCHEN,
          status: OPEN,
          assigneeId: "@member",
          assigneeName: "Nova",
          createdById: "@kitchenLead",
          createdByName: "Cook",
          completedAt: null,
          version: 1,
        },
        { title: "Fix the gate", team: null, assigneeId: null },
        { title: "Count the float", assigneeName: "Fin" },
      ],
      assignable: [
        { displayName: "Cap", rank: "captain" },
        { displayName: "Cook", rank: "member" },
        { displayName: "Fin" },
        { displayName: "Nova" },
        { displayName: "Zed" },
      ],
    });
    expect(store).toEqual(db);
  });

  it("lets the person responsible, whoever added it, its lead or a captain move it, compare-and-set on the column", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      at = START.getTime();
      vi.setSystemTime(START);
      const id = added(
        await addTask(task(p.kitchenLead, KITCHEN, "Buy onions", p.member)),
      );
      tick();
      const others = added(
        await addTask(task(p.captain, KITCHEN, "Wash pots", p.other)),
      );
      tick();
      const move = (
        actorId: string,
        from: TaskBoardStatus,
        to: TaskBoardStatus,
      ) => moveTask({ taskId: id, actorId, from, to });
      const stranger = await move(p.other, OPEN, DOING);
      const otherLead = await move(p.financeLead, OPEN, DOING);
      const responsible = await move(p.member, OPEN, DOING);
      const stale = await move(p.kitchenLead, OPEN, DONE);
      const staleSame = await move(p.kitchenLead, OPEN, OPEN);
      const same = await move(p.kitchenLead, DOING, DOING);
      const mineBefore = await listMyOpenTasks(p.member);
      tick();
      const done = await move(p.captain, DOING, DONE);
      const creatorBack = await moveTask({
        taskId: others,
        actorId: p.captain,
        from: OPEN,
        to: DOING,
      });
      const gone = await moveTask({
        taskId: "not-a-task",
        actorId: p.captain,
        from: OPEN,
        to: DOING,
      });
      return {
        stranger,
        otherLead,
        responsible,
        stale,
        staleSame,
        same,
        mineBefore,
        done,
        creatorBack,
        gone,
        mine: await listMyOpenTasks(p.member),
        othersOwn: await listMyOpenTasks(p.other, 1),
        board: await listBoardTasks(new Date(at)),
        // A done task leaves the board DONE_VISIBLE_DAYS after it is done.
        later: await listBoardTasks(new Date(at + 31 * 86_400_000)),
      };
    });
    const refused = (error: string) => ({ ok: false, error });
    expect(db).toMatchObject({
      stranger: refused(CANNOT_MOVE),
      otherLead: refused(CANNOT_MOVE),
      responsible: { ok: true },
      stale: refused(TASK_MOVED),
      staleSame: refused(TASK_MOVED),
      same: { ok: true },
      mineBefore: {
        items: [{ title: "Buy onions", status: DOING, team: KITCHEN }],
        total: 1,
      },
      done: { ok: true },
      creatorBack: { ok: true },
      gone: refused(TASK_GONE),
      mine: { items: [], total: 0 },
      othersOwn: { items: [{ title: "Wash pots", status: DOING }], total: 1 },
      board: [
        { title: "Buy onions", status: DONE, completedAt: "<date>" },
        { title: "Wash pots", status: DOING, completedAt: null },
      ],
      later: [{ title: "Wash pots" }],
    });
    expect(store).toEqual(db);
  });

  it("lets whoever added it, its lead or a captain edit and remove it, compare-and-set on the version", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      at = START.getTime();
      vi.setSystemTime(START);
      const pending = await seed.user("Late", { approval: "pending" });
      const id = added(
        await addTask(task(p.kitchenLead, KITCHEN, "Buy onions", p.member)),
      );
      const edit = (
        actorId: string,
        version: number,
        fields: {
          team?: Team | null;
          title?: string;
          assigneeId?: string | null;
          activeTeams?: readonly Team[];
        } = {},
      ) =>
        editTask({
          taskId: id,
          actorId,
          version,
          title: fields.title ?? "Buy onions",
          description: null,
          team: fields.team === undefined ? KITCHEN : fields.team,
          assigneeId:
            fields.assigneeId === undefined ? p.member : fields.assigneeId,
          dueAt: null,
          activeTeams: fields.activeTeams ?? ACTIVE,
        });
      const responsible = await edit(p.member, 1, { title: "Mine now" });
      const otherLead = await edit(p.financeLead, 1);
      const leadMovesAway = await edit(p.kitchenLead, 1, { team: FINANCE });
      const leadToCamp = await edit(p.kitchenLead, 1, { team: null });
      const offTeam = await edit(p.captain, 1, {
        team: FINANCE,
        activeTeams: [KITCHEN],
      });
      const toPending = await edit(p.captain, 1, { assigneeId: pending });
      const edited = await edit(p.kitchenLead, 1, {
        title: "Buy red onions",
        assigneeId: p.other,
      });
      const stale = await edit(p.captain, 1, { title: "Too late" });
      const captainMoves = await edit(p.captain, 2, {
        team: null,
        assigneeId: p.other,
      });
      // A switched-off team is kept by an edit that does not move the task.
      const keepsOff = await edit(p.captain, 3, {
        team: null,
        assigneeId: p.other,
        title: "Buy red onions, 2 kg",
        activeTeams: [],
      });
      const responsibleRemoves = await removeTask({
        taskId: id,
        actorId: p.other,
      });
      const leadRemoves = await removeTask({
        taskId: id,
        actorId: p.kitchenLead,
      });
      const removed = await removeTask({ taskId: id, actorId: p.captain });
      const removedAgain = await removeTask({ taskId: id, actorId: p.captain });
      const editRemoved = await edit(p.captain, 4);
      return {
        responsible,
        otherLead,
        leadMovesAway,
        leadToCamp,
        offTeam,
        toPending,
        edited,
        stale,
        captainMoves,
        keepsOff,
        responsibleRemoves,
        leadRemoves,
        removed,
        removedAgain,
        editRemoved,
        board: await listBoardTasks(new Date(at)),
      };
    });
    const refused = (error: string) => ({ ok: false, error });
    expect(db).toMatchObject({
      responsible: refused(CANNOT_EDIT),
      otherLead: refused(CANNOT_EDIT),
      leadMovesAway: refused(NOT_YOUR_TEAM_TO_MOVE),
      leadToCamp: refused(PICK_YOUR_TEAM),
      offTeam: refused(TEAM_NOT_ACTIVE),
      toPending: refused(NOT_A_MEMBER),
      edited: { ok: true },
      stale: refused(TASK_EDITED),
      captainMoves: { ok: true },
      keepsOff: { ok: true },
      responsibleRemoves: refused(CANNOT_REMOVE),
      // The task is the whole camp's now: the Kitchen lead removes it as
      // whoever added it, not as a lead.
      leadRemoves: { ok: true },
      removed: refused(TASK_GONE),
      removedAgain: refused(TASK_GONE),
      editRemoved: refused(TASK_GONE),
      board: [],
    });
    expect(store).toEqual(db);
  });
});
