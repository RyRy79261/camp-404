import "server-only";

import * as db from "@camp404/db/meeting-notes";
import type {
  MeetingNote,
  MeetingNoteActionItem,
  MeetingNoteSummary,
  MeetingNoteWriteResult,
} from "@camp404/db/meeting-notes";
import { testStore } from "./test-store";
import { twin } from "./twin";

// Meeting notes' data (#268), from the database or, under E2E, the test
// store, picked once (twin). Who may write a team's notes is
// meetingNoteRefusal (canWorkInTeam, @camp404/core), which both sides call;
// lib/__tests__/meeting-notes-agreement.test.ts holds the rest equal.

export type {
  MeetingNote,
  MeetingNoteActionItem,
  MeetingNoteSummary,
  MeetingNoteWriteResult,
};

const notes = twin(db, testStore, [
  "listMeetingNotes",
  "getMeetingNote",
  "getMeetingNoteByEvent",
  "createMeetingNote",
  "editMeetingNote",
]);

export const listMeetingNotes = notes.listMeetingNotes;
export const getMeetingNote = notes.getMeetingNote;

/** The note of the meeting whose calendar event is `calendarEventId`. */
export const getMeetingNoteByEvent = notes.getMeetingNoteByEvent;

export const createMeetingNote = notes.createMeetingNote;
export const editMeetingNote = notes.editMeetingNote;
