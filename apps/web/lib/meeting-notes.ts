import "server-only";

import {
  createMeetingNote as dbCreateMeetingNote,
  editMeetingNote as dbEditMeetingNote,
  getMeetingNote as dbGetMeetingNote,
  listMeetingNotes as dbListMeetingNotes,
  turnActionItemIntoTask as dbTurnActionItemIntoTask,
  type MeetingNote,
  type MeetingNoteActionItem,
  type MeetingNoteSummary,
  type MeetingNoteWriteResult,
} from "@camp404/db/meeting-notes";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";

// Meeting notes' data (#268), from the database or, under E2E, the test
// store. The rules live in @camp404/db/meeting-notes; the store repeats them.

export type {
  MeetingNote,
  MeetingNoteActionItem,
  MeetingNoteSummary,
  MeetingNoteWriteResult,
};

export async function listMeetingNotes(
  input: Parameters<typeof dbListMeetingNotes>[0] = {},
): Promise<MeetingNoteSummary[]> {
  return usesTestStore()
    ? testStore.listMeetingNotes(input)
    : dbListMeetingNotes(input);
}

export async function getMeetingNote(
  noteId: string,
): Promise<MeetingNote | null> {
  return usesTestStore()
    ? testStore.getMeetingNote(noteId)
    : dbGetMeetingNote(noteId);
}

export async function createMeetingNote(
  input: Parameters<typeof dbCreateMeetingNote>[0],
): Promise<MeetingNoteWriteResult<{ id: string }>> {
  return usesTestStore()
    ? testStore.createMeetingNote(input)
    : dbCreateMeetingNote(input);
}

export async function editMeetingNote(
  input: Parameters<typeof dbEditMeetingNote>[0],
): Promise<MeetingNoteWriteResult> {
  return usesTestStore()
    ? testStore.editMeetingNote(input)
    : dbEditMeetingNote(input);
}

export async function turnActionItemIntoTask(
  input: Parameters<typeof dbTurnActionItemIntoTask>[0],
): Promise<MeetingNoteWriteResult<{ taskId: string; noteId: string }>> {
  return usesTestStore()
    ? testStore.turnActionItemIntoTask(input)
    : dbTurnActionItemIntoTask(input);
}
