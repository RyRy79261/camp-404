import "server-only";

import {
  addTask as dbAddTask,
  listAssignableMembers as dbListAssignableMembers,
  listBoardTasks as dbListBoardTasks,
  moveTask as dbMoveTask,
  removeTask as dbRemoveTask,
  type AssignableMember,
  type BoardTask,
  type TaskWriteResult,
} from "@camp404/db/tasks";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";

// The shared task board's data, from the database or, under E2E, the test
// store. The rules live in @camp404/db/tasks; the store repeats them.

export type { AssignableMember, BoardTask, TaskWriteResult };

export async function listBoardTasks(now: Date): Promise<BoardTask[]> {
  return usesTestStore()
    ? testStore.listBoardTasks(now)
    : dbListBoardTasks(now);
}

export async function listAssignableMembers(): Promise<AssignableMember[]> {
  return usesTestStore()
    ? testStore.listAssignableMembers()
    : dbListAssignableMembers();
}

export async function addTask(
  input: Parameters<typeof dbAddTask>[0],
): Promise<TaskWriteResult<{ id: string }>> {
  return usesTestStore() ? testStore.addTask(input) : dbAddTask(input);
}

export async function moveTask(
  input: Parameters<typeof dbMoveTask>[0],
): Promise<TaskWriteResult> {
  return usesTestStore() ? testStore.moveTask(input) : dbMoveTask(input);
}

export async function removeTask(
  input: Parameters<typeof dbRemoveTask>[0],
): Promise<TaskWriteResult> {
  return usesTestStore() ? testStore.removeTask(input) : dbRemoveTask(input);
}
