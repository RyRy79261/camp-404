import { LOGISTICS_PHASE_LABELS, type LogisticsPhase } from "@camp404/types";
import { listLogisticsPhases } from "../logistics";
import { LOGISTICS_PATH } from "../logistics-copy";
import { blocked, dayRange, shown, str, type PreviewFn } from "./preview-kit";

// Clearing a phase's days: the preview reads the phase, says what goes (the
// days, the place and the note, and its calendar event) and fills in the
// version it read.

export const LOGISTICS_MORE_PREVIEWS: Readonly<Record<string, PreviewFn>> = {
  async clear_logistics_days(args) {
    const phase = str(args.phase) as LogisticsPhase;
    const label = LOGISTICS_PHASE_LABELS[phase] ?? phase;
    const row = (await listLogisticsPhases()).find((p) => p.phase === phase);
    const sentence = `Clear ${label}'s days`;
    if (!row?.startDate) {
      return blocked(
        sentence,
        `${label} has no days set.`,
        args,
        LOGISTICS_PATH,
      );
    }
    return {
      sentence: `${sentence} (${dayRange(row.startDate, row.endDate)})`,
      facts:
        "Logistics · it comes off the camp calendar · if it sets Day 1, the meal plan's prep moves or it is refused",
      change: [
        `Place: ${shown(row.place)} → (empty)`,
        `Note: ${shown(row.note)} → (empty)`,
      ],
      path: LOGISTICS_PATH,
      args: { ...args, expectedVersion: row.version },
      keys: [`days:${phase}`],
    };
  },
};
