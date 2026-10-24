"use client";

import * as React from "react";
import { Users } from "lucide-react";
import type { ResponseAggregate, SharedAnswer } from "@camp404/core";
import type { Question } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { QuestionSummary } from "./results-view";

// What the members who answered read back, like a Telegram poll: every
// question's counts first. When the questionnaire shows names, "See who
// answered what" opens each question's answers with names under its counts;
// when it is anonymous, each written answer is listed with no name. Nothing is
// cut here: the server sent only what this member may read
// (`sharedResults` in @camp404/core).

export function MemberResults({
  questions,
  aggregate,
  answers,
  anonymous,
}: {
  questions: readonly Question[];
  aggregate: ResponseAggregate;
  answers: Readonly<Record<string, readonly SharedAnswer[]>>;
  anonymous: boolean;
}) {
  const [showNames, setShowNames] = React.useState(false);
  const listsId = React.useId();
  const hasNames = !anonymous && Object.values(answers).some((a) => a.length);

  return (
    <div className="flex flex-col gap-4">
      {hasNames ? (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          aria-expanded={showNames}
          aria-controls={listsId}
          onClick={() => setShowNames((v) => !v)}
        >
          <Users aria-hidden />
          {showNames ? "Hide who answered what" : "See who answered what"}
        </Button>
      ) : null}
      <div id={listsId} className="flex flex-col gap-4">
        {aggregate.questions.map((summary) => {
          const list = answers[summary.questionId] ?? [];
          const open = anonymous || showNames;
          return (
            <QuestionSummary
              key={summary.questionId}
              aggregate={summary}
              question={questions.find((q) => q.id === summary.questionId)}
            >
              {open && list.length > 0 ? <AnswerList answers={list} /> : null}
            </QuestionSummary>
          );
        })}
      </div>
    </div>
  );
}

function AnswerList({ answers }: { answers: readonly SharedAnswer[] }) {
  return (
    <ul className="flex flex-col gap-1.5 border-t border-border pt-3 text-sm">
      {answers.map((answer, i) => (
        <li key={i} className="break-words">
          {answer.name ? (
            <span className="font-medium">{answer.name}: </span>
          ) : null}
          <span className="text-muted-foreground">{answer.text}</span>
        </li>
      ))}
    </ul>
  );
}
