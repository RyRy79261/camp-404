import { GATES, type ToolCapability } from "../gates";

// The guide editor's "Still right for this year" over the connector
// (lib/mcp/tools/guide-more.ts), at the guide actions' door (captains and team
// leads); whether THIS writer may mark THIS chapter (a captain, or a lead of
// its team) is the write's own check. Taking a chapter off the guide is
// publish_document's `published: false`.

export const GUIDE_MORE_CAPABILITIES: Readonly<Record<string, ToolCapability>> =
  {
    mark_document_reviewed: {
      kind: "write",
      area: "Survival Guide",
      gate: GATES.teamLead,
      does: "Mark a published chapter still right for this year, without changing it (captains: any; team leads: their teams').",
      page: "/guide",
    },
  };
