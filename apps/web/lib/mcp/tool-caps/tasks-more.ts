import { GATES, type ToolCapability } from "../gates";

// The task board's edit, over the connector (lib/mcp/tools/tasks-more.ts).
// Any member may ask, as on the Tasks page (editTaskAction's door is
// camp_member); whether THIS person may edit THIS task (whoever added it, a
// lead of its team, a captain) is the write's own check.

export const TASKS_MORE_CAPABILITIES: Readonly<Record<string, ToolCapability>> =
  {
    get_task: {
      kind: "read",
      area: "Tasks",
      gate: GATES.member,
      does: "One task in full, with the version an edit needs and whether you may edit it.",
      page: "/tasks",
    },
    edit_task: {
      kind: "write",
      area: "Tasks",
      gate: GATES.member,
      does: "Change a task's title, details, team, person or deadline, on the version you read (whoever added it, a lead of its team, a captain).",
      page: "/tasks",
    },
  };
