// The fixed key of the camp's "Coming this year?" questionnaire. A plain
// module, not a "use server" file: those may export only async functions, and
// a const there breaks the page under `next dev`.
//
// The same questionnaire is sent every year. It is created once, fresh (no
// answer carries over a rollover), by a captain's one click on the
// questionnaire hub (createAttendanceCheckAction). Its answers set each
// member's camp_participations row through the participation_intent role.
export const ATTENDANCE_CHECK_KEY = "coming-this-year";
