import type {
  ChoiceAggregate,
  NumericAggregate,
  OrphanAggregate,
  QuestionAggregate,
} from "@camp404/core";
import { Badge } from "@camp404/ui/components/badge";
import { ProgressBar } from "@camp404/ui/components/progress-bar";

// One question's summary. Presentational and server-rendered — every number it
// draws was computed by `aggregateQuestions` in @camp404/core, which is the
// same engine the CSV export and the response viewer read through. There is no
// aggregation and no option-label lookup in this file, on purpose: a second
// copy of either is how a results screen and its export come to disagree about
// what the camp said.
//
// The answered/skipped line is NOT optional decoration. Percentages inside a
// question are taken over the people who ANSWERED it, so a question two of
// thirty people ever saw shows a row reading 100%. Property 1 (honest skips)
// only holds if the denominator is on screen beside it — which is what `Skips`
// is for, and why it renders above every breakdown rather than under a fold.

const NUMBER = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

function Skips({ result }: { result: QuestionAggregate }) {
  return (
    <p className="mt-0.5 text-xs text-muted-foreground">
      {result.answered} of {result.respondents} answered
      {result.skipped > 0 && ` · ${result.skipped} skipped`}
      {result.shape === "choice" &&
        result.multi &&
        " · more than one answer allowed"}
    </p>
  );
}

/** One labelled bar. Shared by the choice rows and the numeric buckets. */
function Bar({
  label,
  count,
  percent,
  denominator,
  flag,
}: {
  label: string;
  count: number;
  percent: number;
  denominator: number;
  flag?: string;
}) {
  return (
    <li>
      {/*
        The label sits ABOVE its bar and on its own line from the count: an
        option label is author-written and can run to a sentence, so a
        side-by-side layout would either truncate it or shove the count off the
        row. `min-w-0` + `break-words` lets it wrap; the count is `shrink-0`, so
        the two can never overlap.
      */}
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 flex-1 break-words text-sm">
          {label}
          {flag && (
            <Badge variant="outline" className="ml-2 align-middle">
              {flag}
            </Badge>
          )}
        </span>
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
          {count}
          {denominator > 0 && ` · ${percent}%`}
        </span>
      </div>
      <ProgressBar
        value={percent}
        label={`${label}: ${count} of ${denominator}`}
        className="mt-1.5"
      />
    </li>
  );
}

function ChoiceBars({ result }: { result: ChoiceAggregate }) {
  if (result.rows.length === 0) {
    return (
      <p className="mt-3 text-sm text-muted-foreground">No answers yet.</p>
    );
  }
  return (
    <ul className="mt-3 flex flex-col gap-3">
      {result.rows.map((row) => (
        <Bar
          key={row.value}
          label={row.label}
          count={row.count}
          percent={row.pct}
          denominator={result.answered}
          // Property 3: a value the definition no longer declares keeps its
          // row, labelled by what is actually stored, and says it is unlisted
          // rather than passing itself off as a current option.
          flag={row.known ? undefined : "unlisted"}
        />
      ))}
    </ul>
  );
}

function NumericSummary({ result }: { result: NumericAggregate }) {
  if (result.samples === 0) {
    // "No answers yet" is only true when nobody answered. If people DID answer
    // but nothing parsed as a number, saying that contradicts the Skips line
    // directly above it, which is already printing "N of M answered" — and it
    // hides the thing the captain needs to know, which is that the answers
    // exist and are unusable.
    if (result.unparsed > 0) {
      return (
        <p className="mt-3 text-sm text-muted-foreground">
          {result.unparsed} {result.unparsed === 1 ? "answer" : "answers"}, none
          of them a number. Nothing to average.
        </p>
      );
    }
    return (
      <p className="mt-3 text-sm text-muted-foreground">No answers yet.</p>
    );
  }
  const stats: [string, number | null][] = [
    ["Lowest", result.min],
    ["Average", result.mean],
    ["Median", result.median],
    ["Highest", result.max],
  ];
  return (
    <>
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-card/40 px-3 py-2">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              {label}
            </dt>
            <dd className="text-lg font-semibold tabular-nums">
              {value === null ? "—" : NUMBER.format(value)}
            </dd>
          </div>
        ))}
      </dl>
      {result.buckets.length > 0 && (
        <ul className="mt-3 flex flex-col gap-3">
          {result.buckets.map((bucket) => (
            <Bar
              key={bucket.value}
              label={NUMBER.format(bucket.value)}
              count={bucket.count}
              percent={bucket.pct}
              denominator={result.samples}
              // Property 4: a value outside the declared range keeps its own
              // bucket rather than being clamped onto its neighbour, and is
              // marked so nobody reads it as a legal cell.
              flag={bucket.inRange ? undefined : "out of range"}
            />
          ))}
        </ul>
      )}
      {result.unparsed > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {result.unparsed}{" "}
          {result.unparsed === 1 ? "answer isn't" : "answers aren't"} a number
          and {result.unparsed === 1 ? "isn't" : "aren't"} counted above. They
          are on the Answers tab.
        </p>
      )}
    </>
  );
}

export function MetricCard({ result }: { result: QuestionAggregate }) {
  return (
    <section className="rounded-xl border bg-card/40 p-4">
      <h3 className="break-words text-sm font-semibold">{result.prompt}</h3>
      <Skips result={result} />

      {result.shape === "choice" && <ChoiceBars result={result} />}
      {result.shape === "numeric" && <NumericSummary result={result} />}
      {result.shape === "count" && (
        // §7.2: free-text, email, phone, date and image answers get a count and
        // nothing more. A word cloud of everyone's dietary notes is PII on a
        // dashboard. The engine enforces this — a `count` aggregate has no
        // field holding a value — so there is nothing here to render even by
        // mistake.
        <p className="mt-3 text-sm text-muted-foreground">
          Individual answers are on the Answers tab.
        </p>
      )}
    </section>
  );
}

/**
 * Answers left behind by a question that has been removed (property 2).
 *
 * Counted, never broken down. The definition is gone, so the kind is gone with
 * it — and an orphaned answer is as likely to be a paragraph of free text as an
 * option slug, which is why `OrphanAggregate` carries no value for this card to
 * print. The answers stay readable per-respondent on /responses, where names
 * are the point and the captain gate is the same.
 */
export function OrphanCard({ orphan }: { orphan: OrphanAggregate }) {
  return (
    <section className="rounded-xl border bg-card/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 flex-1 break-words text-sm font-semibold">
          {orphan.questionId}
        </h3>
        <Badge variant="warning" className="shrink-0">
          removed
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {orphan.answered} of {orphan.respondents} answered this before it was
        removed. Their answers are still on the Answers tab.
      </p>
    </section>
  );
}
