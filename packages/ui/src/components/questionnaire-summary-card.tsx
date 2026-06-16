import * as React from "react"
import { ListChecks, Timer } from "lucide-react"

import { cn } from "../lib/utils"

// The "what's ahead" summary for a required questionnaire — shown on the gate
// interstitial (S23) and the blocking overlay (S25). A small presentational card:
// a title plus two meta chips (question count + time estimate). Server-safe leaf.
// (Distinct from `qcard.tsx`, which is a form-FIELD wrapper despite the spec's
// shared "QCard" name.)
export interface QuestionnaireSummaryCardProps
  extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  questionCount: number
  estimatedMinutes: number
}

function QuestionnaireSummaryCard({
  title,
  questionCount,
  estimatedMinutes,
  className,
  ...props
}: QuestionnaireSummaryCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-xl border bg-card/40 p-4 text-left",
        className,
      )}
      {...props}
    >
      <span className="text-subtitle font-semibold text-foreground">
        {title}
      </span>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-label text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <ListChecks aria-hidden className="size-4 shrink-0" />
          {questionCount} {questionCount === 1 ? "question" : "questions"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Timer aria-hidden className="size-4 shrink-0" />
          about {estimatedMinutes} min
        </span>
      </div>
    </div>
  )
}

export { QuestionnaireSummaryCard }
