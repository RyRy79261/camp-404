import { GATES, type ToolCapability } from "../gates";

// A meeting's minutes over the connector (lib/mcp/tools/meetings-more.ts), at
// the minutes editor's door (saveMinutesAction: any member asks); who may
// write THIS meeting's minutes (its team's members this year, and captains)
// is the write's own check (canWorkInTeam).

export const MEETINGS_MORE_CAPABILITIES: Readonly<
  Record<string, ToolCapability>
> = {
  get_meeting_minutes: {
    kind: "read",
    area: "Meetings",
    gate: GATES.member,
    does: "A meeting's minutes as the editor opens them: who was there, decisions and action items with their ids, and the version a save needs.",
    page: "/calendar",
  },
  save_meeting_minutes: {
    kind: "write",
    area: "Meetings",
    gate: GATES.member,
    does: "Write a meeting's first minutes or change them, tick who was there, and add or change action items (each goes on the task board), on the version you read (its team's members this year, and captains).",
    page: "/calendar",
  },
};
