import {
  displayResponseValue,
  flattenQuestions,
  isOtherAnswer,
  type Question,
  type Questionnaire,
  type QuestionnaireResponses,
  type ViewerRank,
} from "@camp404/types";
import { hasClearance } from "./access";
import type { AudienceSpec } from "./audience-authz";
import {
  aggregateQuestions,
  type ResponseAggregate,
} from "./questionnaire-results";
import { questionnaireForViewer } from "./questionnaire-viewer";

// Who sends a builder questionnaire, and what the camp reads back from it
// (owner, 2026-10-23: "Publish means send", "a team lead should be able to send
// questionnaires to the whole camp", and results "a bit like when you do a poll
// on Telegram").
//
// SENDING. A team lead sends to any audience a captain may address, blocking
// included. This is the questionnaire's own rule, not `canSendToAudience`:
// announcements, tasks and calendar events keep "a lead reaches only a team
// they lead". The send action asks this, and `sendActivation` asks it again on
// the sender's rank read under lock in its own transaction.
//
// READING RESULTS. A member reads a questionnaire's results for a year once
// they have answered it that year; its author and every captain read them
// anyway. What a member reads is cut here, on the server, before it reaches a
// page: only questions that ask for an opinion (`isSharedResultQuestion`) and
// that the viewer could see on the form (no leads-only part for a plain
// member), counts first, and names only when the questionnaire is not anonymous.
// Captains keep their own full results page.

/** Every scope a questionnaire send may name. */
const SEND_SCOPES: ReadonlySet<string> = new Set([
  "everyone",
  "team",
  "team_leads",
  "individual",
  "opt_in",
]);

/**
 * Whether `actor` may send a questionnaire to `audience`: a team lead or a
 * captain, to any questionnaire scope. A team scope must name its team; an
 * unknown scope is refused (fail closed).
 */
export function canSendQuestionnaireTo(
  actor: { rank: ViewerRank },
  audience: AudienceSpec,
): boolean {
  if (!hasClearance(actor.rank, "team_lead")) return false;
  if (!SEND_SCOPES.has(audience.scope)) return false;
  if (audience.scope === "team") return !!audience.team;
  return true;
}

/**
 * Whether a viewer reads a questionnaire's member results: a captain, its
 * author, or anyone who finished it in the year being read.
 */
export function canReadQuestionnaireResults(viewer: {
  rank: ViewerRank;
  isAuthor: boolean;
  answered: boolean;
}): boolean {
  return viewer.rank === "captain" || viewer.isAuthor || viewer.answered;
}

/**
 * Kinds whose answer is a member's own contact detail or file, never an
 * opinion: they are not shown to other members.
 */
const PRIVATE_KINDS: ReadonlySet<Question["kind"]> = new Set([
  "email",
  "phone",
  "file_link",
  "image",
]);

/**
 * Whether a question's answers are shown to the members who answered.
 *
 * A question with a role fills a member's profile (photo, bio, Telegram,
 * emergency contact, allergies, driving, arrival, "Coming this year?"), and
 * each of those has its own readers, never the whole camp. Contact details
 * and uploads are private too. Everything else asks for an opinion.
 */
export function isSharedResultQuestion(question: Question): boolean {
  if ("role" in question && question.role) return false;
  return !PRIVATE_KINDS.has(question.kind);
}

/** One member's finished answers, as the shared results read them. */
export interface SharedRespondent {
  name: string;
  responses: QuestionnaireResponses;
}

/** One answer under a question: who gave it (null when anonymous) and what. */
export interface SharedAnswer {
  name: string | null;
  text: string;
}

export interface SharedResults {
  /** The questions shown, in document order. */
  questions: Question[];
  /** Counts over the shown questions only. */
  aggregate: ResponseAggregate;
  /**
   * The answers under each shown question. Named, when the questionnaire is
   * not anonymous: every answer, with its member's name. Anonymous: only the
   * written answers, with no name, in alphabetical order (so the order says
   * nothing about who answered when).
   */
  answers: Record<string, SharedAnswer[]>;
}

const TEXT_KINDS: ReadonlySet<Question["kind"]> = new Set([
  "short_text",
  "long_text",
]);

/**
 * One answer as other members read it. A typed "Other…" answer reads "Other":
 * the words are free text the member typed into a choice question, where they
 * did not expect to be quoted (results never quote them to captains either).
 */
function sharedText(question: Question, value: unknown): string {
  if (isOtherAnswer(value)) return "Other";
  if (question.kind === "multi_select" && Array.isArray(value)) {
    return value
      .map((v) =>
        isOtherAnswer(v)
          ? "Other"
          : (question.options.find((o) => o.value === v)?.label ?? String(v)),
      )
      .join(", ");
  }
  return displayResponseValue(
    question,
    value as Parameters<typeof displayResponseValue>[1],
  );
}

function hasAnswer(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * What the members who answered read back. A viewer below team lead gets no
 * leads-only page or question (`questionnaireForViewer`, as on the form).
 * Answers to questions that are not shown, and to questions since removed,
 * are dropped before anything is counted, so not even their count leaves the
 * server.
 */
export function sharedResults(input: {
  definition: Questionnaire;
  seesLeadsOnly: boolean;
  respondents: readonly SharedRespondent[];
  anonymous: boolean;
}): SharedResults {
  const questions = flattenQuestions(
    questionnaireForViewer(input.definition, {
      seesLeadsOnly: input.seesLeadsOnly,
    }),
  ).filter(isSharedResultQuestion);
  const shown = new Set(questions.map((q) => q.id));
  const cut = input.respondents.map((r) => ({
    name: r.name,
    responses: Object.fromEntries(
      Object.entries(r.responses).filter(([id]) => shown.has(id)),
    ) as QuestionnaireResponses,
  }));

  const answers: Record<string, SharedAnswer[]> = {};
  for (const question of questions) {
    if (input.anonymous && !TEXT_KINDS.has(question.kind)) {
      answers[question.id] = [];
      continue;
    }
    const list = cut
      .filter((r) => hasAnswer(r.responses[question.id]))
      .map((r) => ({
        name: input.anonymous ? null : r.name,
        text: sharedText(question, r.responses[question.id]),
      }));
    if (input.anonymous) list.sort((a, b) => a.text.localeCompare(b.text));
    answers[question.id] = list;
  }

  return {
    questions,
    aggregate: aggregateQuestions(
      questions,
      cut.map((r) => r.responses),
    ),
    answers,
  };
}
