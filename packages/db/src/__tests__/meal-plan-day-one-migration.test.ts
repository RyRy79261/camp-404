import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { campDayStart, prepTaskDetails } from "@camp404/core";
import { useTestDb } from "./_harness";

// 0095 (the owner, 2026-10-03): the meal plan stops keeping a Day 1 of its
// own and takes it from Logistics (the first Build day, else the first Burn
// day). Where Logistics gives a different Day 1 than the plan kept, each prep
// step moves by the same days, its task's due date with it, and the task's
// line of detail when nobody edited it, written as the app writes it
// (prepTaskDetails, "Sept" included). A cancelled task, a year with no Build
// or Burn days and a year whose days agree are left alone. The harness has run
// every migration, 0096 (which drops first_day) too, so the test puts the
// column back, stores rows and runs the SQL, twice.

/** A due date as the app stores it: the camp day's start, in UTC. */
const stored = (day: string) =>
  campDayStart(day).toISOString().replace("T", " ").replace(".000Z", "");

const SQL = readFileSync(
  new URL(
    "../../migrations/0095_meal_plan_day_one_from_logistics.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("0095_meal_plan_day_one_from_logistics", () => {
  const h = useTestDb();

  async function one<T>(text: string, params: unknown[] = []): Promise<T> {
    const { rows } = await h.client().query<T>(text, params);
    return rows[0]!;
  }

  async function recipe(): Promise<string> {
    return (
      await one<{ id: string }>(
        `INSERT INTO recipes (source, title, status) VALUES ('text', 'Oats', 'accepted') RETURNING id`,
      )
    ).id;
  }

  /** A year: the plan's own Day 1, and its Build and Burn starts. */
  async function year(
    cycle: number,
    firstDay: string,
    build: string | null,
    burn: string | null,
  ) {
    await h
      .client()
      .query(
        `INSERT INTO kitchen_meal_plans (cycle, first_day) VALUES ($1, $2)`,
        [cycle, firstDay],
      );
    for (const [phase, start] of [
      ["build", build],
      ["burn", burn],
    ] as const) {
      if (start === null) continue;
      await h
        .client()
        .query(
          `INSERT INTO logistics_phases (cycle, phase, start_date, end_date) VALUES ($1, $2, $3, $3)`,
          [cycle, phase, start],
        );
    }
  }

  /** A prep step on Day `day` breakfast, due `due`, with its task. */
  async function step(input: {
    cycle: number;
    recipeId: string;
    day: number;
    due: string;
    firstDay: string;
    description?: string;
    status?: string;
    withTask?: boolean;
  }): Promise<{ stepId: string; taskId: string | null }> {
    const item = await one<{ id: string }>(
      `INSERT INTO kitchen_menu_items (cycle, day, meal, recipe_id, position)
       VALUES ($1, $2, 'breakfast', $3, (SELECT count(*) FROM kitchen_menu_items)) RETURNING id`,
      [input.cycle, input.day, input.recipeId],
    );
    let taskId: string | null = null;
    if (input.withTask !== false) {
      taskId = (
        await one<{ id: string }>(
          `INSERT INTO tasks (title, description, team, due_at, status)
           VALUES ('Oats ×60: toast', $1, 'kitchen', $2, $3) RETURNING id`,
          [
            input.description ??
              prepTaskDetails(input.day, "breakfast", input.firstDay),
            stored(input.due),
            input.status ?? "open",
          ],
        )
      ).id;
    }
    const stepId = (
      await one<{ id: string }>(
        `INSERT INTO kitchen_prep_steps (menu_item_id, cycle, what, timing, due_date, task_id)
         VALUES ($1, $2, 'Toast', 'before_leaving', $3, $4) RETURNING id`,
        [item.id, input.cycle, input.due, taskId],
      )
    ).id;
    return { stepId, taskId };
  }

  const stepDue = async (id: string) =>
    (
      await one<{ due: string }>(
        `SELECT due_date::text AS due FROM kitchen_prep_steps WHERE id = $1`,
        [id],
      )
    ).due;

  const task = (id: string) =>
    one<{
      due_at: string;
      description: string;
      version: number;
    }>(
      `SELECT due_at::text AS due_at, description, version FROM tasks WHERE id = $1`,
      [id],
    );

  const firstDays = async () =>
    (
      await h.client().query<{
        cycle: number;
        first_day: string;
      }>(`SELECT cycle, first_day::text AS first_day FROM kitchen_meal_plans ORDER BY cycle`)
    ).rows.map((r) => [r.cycle, r.first_day]);

  it("moves the prep steps and their tasks to the Day 1 Logistics gives, once", async () => {
    await h
      .client()
      .exec(`ALTER TABLE kitchen_meal_plans ADD COLUMN first_day date`);
    const recipeId = await recipe();

    // 2027: Build starts two days after the plan's own Day 1.
    await year(2027, "2027-04-22", "2027-04-24", "2027-04-27");
    const moved = await step({
      cycle: 2027,
      recipeId,
      day: 2,
      due: "2027-04-19",
      firstDay: "2027-04-22",
    });
    const edited = await step({
      cycle: 2027,
      recipeId,
      day: 3,
      due: "2027-04-20",
      firstDay: "2027-04-22",
      description: "Ask Thandi which milk",
    });
    const cancelled = await step({
      cycle: 2027,
      recipeId,
      day: 1,
      due: "2027-04-18",
      firstDay: "2027-04-22",
      status: "cancelled",
    });
    const onSite = await step({
      cycle: 2027,
      recipeId,
      day: 4,
      due: "2027-04-25",
      firstDay: "2027-04-22",
      withTask: false,
    });

    // 2028: no Build days; the Burn starts a day before the plan's Day 1,
    // in September (Intl writes "Sept").
    await year(2028, "2028-09-02", null, "2028-09-01");
    const september = await step({
      cycle: 2028,
      recipeId,
      day: 1,
      due: "2028-08-30",
      firstDay: "2028-09-02",
    });

    // 2029: no Build or Burn days. 2030: the days already agree.
    await year(2029, "2029-04-20", null, null);
    const noDays = await step({
      cycle: 2029,
      recipeId,
      day: 1,
      due: "2029-04-18",
      firstDay: "2029-04-20",
    });
    await year(2030, "2030-04-20", "2030-04-20", null);

    await h.client().exec(SQL);

    expect(await stepDue(moved.stepId)).toBe("2027-04-21");
    expect(await task(moved.taskId!)).toMatchObject({
      due_at: stored("2027-04-21"),
      description: prepTaskDetails(2, "breakfast", "2027-04-24"),
      version: 2,
    });
    expect(prepTaskDetails(2, "breakfast", "2027-04-24")).toBe(
      "For Day 2 breakfast, Sun 25 Apr",
    );
    expect(await stepDue(edited.stepId)).toBe("2027-04-22");
    expect(await task(edited.taskId!)).toMatchObject({
      due_at: stored("2027-04-22"),
      description: "Ask Thandi which milk",
    });
    // A cancelled task stays as it was; its step still moves.
    expect(await stepDue(cancelled.stepId)).toBe("2027-04-20");
    expect(await task(cancelled.taskId!)).toMatchObject({
      due_at: stored("2027-04-18"),
      version: 1,
    });
    expect(await stepDue(onSite.stepId)).toBe("2027-04-27");

    expect(await stepDue(september.stepId)).toBe("2028-08-29");
    expect((await task(september.taskId!)).description).toBe(
      prepTaskDetails(1, "breakfast", "2028-09-01"),
    );
    expect(prepTaskDetails(1, "breakfast", "2028-09-01")).toBe(
      "For Day 1 breakfast, Fri 1 Sept",
    );

    expect(await stepDue(noDays.stepId)).toBe("2029-04-18");
    expect(await task(noDays.taskId!)).toMatchObject({ version: 1 });
    expect(await firstDays()).toEqual([
      [2027, "2027-04-24"],
      [2028, "2028-09-01"],
      [2029, "2029-04-20"],
      [2030, "2030-04-20"],
    ]);

    // A second run finds nothing to move.
    await h.client().exec(SQL);
    expect(await stepDue(moved.stepId)).toBe("2027-04-21");
    expect(await task(moved.taskId!)).toMatchObject({ version: 2 });
    expect(await stepDue(september.stepId)).toBe("2028-08-29");
  });
});
