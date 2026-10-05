import type { JoinData } from "@/lib/join-data";
import { joinJsonLd, joinSummary, jsonLdScript } from "@/lib/seo";

// The server-rendered words a crawler (or a screen reader, before the desktop
// boots) reads: the same README, dates and teams the windows show, hidden from
// sight, plus the JSON-LD. lib/seo.ts builds both from the page's data.
export function SeoSummary({ data }: { data: JoinData }) {
  const summary = joinSummary(data);
  return (
    <>
      <section aria-label="About Camp 404" className="sr-only">
        <h2>{summary.heading}</h2>
        {summary.intro && <p>{summary.intro}</p>}
        {summary.dates && <p>{summary.dates}</p>}
        {summary.teams.length > 0 && <p>Teams: {summary.teams.join(", ")}.</p>}
        <p>How to join: {summary.steps.join(" ")}</p>
      </section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(joinJsonLd(data)) }}
      />
    </>
  );
}
