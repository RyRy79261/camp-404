import "server-only";

import * as db from "@camp404/db/tasks";
import type {
  AssignableMember,
  BoardTask,
  MyOpenTask,
  TaskWriteResult,
} from "@camp404/db/tasks";
import { testStore } from "./test-store";
import { twin } from "./twin";

// The shared task board's data, from the database or, under E2E, the test
// store. Who may add, move, edit and remove a task lives once in
// @camp404/core (taskAddProblem, taskMoveProblem, taskEditProblem,
// taskRemoveProblem); lib/__tests__/tasks-agreement.test.ts holds the rest
// equal.

export type { AssignableMember, BoardTask, MyOpenTask, TaskWriteResult };

const board = twin(db, testStore, [
  "listBoardTasks",
  "listMyOpenTasks",
  "listAssignableMembers",
  "addTask",
  "editTask",
  "moveTask",
  "removeTask",
]);

export const listBoardTasks = board.listBoardTasks;
/** The member's own unfinished tasks for Home: at most `limit`, and the total. */
export const listMyOpenTasks = board.listMyOpenTasks;
export const listAssignableMembers = board.listAssignableMembers;
export const addTask = board.addTask;
export const editTask = board.editTask;
export const moveTask = board.moveTask;
export const removeTask = board.removeTask;
