import { GATES, type ToolCapability } from "../gates";

// The questionnaire builder's other saves over the connector
// (lib/mcp/tools/questionnaires-more.ts), at the builder actions' own doors:
// a team lead or a captain authors (gateAuthor), the questionnaire's author
// or a captain sets "Anonymous results" (gateEditor, then canEditQuestionnaire),
// and the year policy is a captain's (gateCaptain). Publishing and sending
// stay on the website.

export const QUESTIONNAIRES_MORE_CAPABILITIES: Readonly<
  Record<string, ToolCapability>
> = {
  get_questionnaire_settings: {
    kind: "read",
    area: "Questionnaires",
    gate: GATES.teamLead,
    does: "Whether a questionnaire's results are anonymous, and (captains) whether it asks again each year.",
    page: "/captains/questionnaires",
  },
  duplicate_questionnaire: {
    kind: "write",
    area: "Questionnaires",
    gate: GATES.teamLead,
    does: "Copy a questionnaire you may see into a new draft of your own.",
    page: "/captains/questionnaires",
  },
  create_questionnaire_from_template: {
    kind: "write",
    area: "Questionnaires",
    gate: GATES.teamLead,
    does: "Start a draft from a ready-made template (the post-burn survey).",
    page: "/captains/questionnaires",
  },
  set_questionnaire_anonymous_results: {
    kind: "write",
    area: "Questionnaires",
    gate: GATES.teamLead,
    does: "Hide or show names on a questionnaire's shared results (its author or a captain).",
    page: "/captains/questionnaires",
  },
  set_questionnaire_carry_over: {
    kind: "write",
    area: "Questionnaires",
    gate: GATES.captain,
    does: "Say whether a questionnaire's answers carry over to the next year or everyone answers it again.",
    page: "/captains/questionnaires",
  },
};
