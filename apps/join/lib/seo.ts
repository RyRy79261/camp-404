import { burnDatesLabel } from "@camp404/core";
import { parseInline } from "@camp404/types";
import type { JoinData } from "./join-data";

// What a search engine or a link preview reads from join.camp-404.com. The
// desktop draws its words only once a window opens, so the server HTML also
// carries a short summary of the same words (the README, the Burn's dates and
// the teams) and JSON-LD for the camp and its Burn. The title and description
// stay the owner's short ones (2026-09-25; kept 2026-10-05).

export const JOIN_URL = "https://join.camp-404.com";
const APP_URL = "https://camp-404.com";

/** A captain's paragraph without its **bold** and *italic* marks. */
export function plainText(text: string): string {
  return parseInline(text)
    .map((run) => run.text)
    .join("");
}

/** The summary's words, in the order the page lists them. */
export function joinSummary(data: JoinData): {
  heading: string;
  intro: string;
  dates: string | null;
  teams: string[];
  steps: string[];
} {
  const { readme } = data.content;
  const dates = data.burn ? burnDatesLabel(data.burn) : null;
  return {
    heading: plainText(readme.heading),
    intro: plainText(readme.paragraphs[0] ?? ""),
    dates: dates ? `AfrikaBurn ${data.year}: ${dates}, Tankwa Town.` : null,
    teams: data.teams.map((t) => t.label),
    steps: readme.steps.map(plainText),
  };
}

/** The camp as an Organization and, with dates set, its Burn as an Event. */
export function joinJsonLd(data: JoinData): Record<string, unknown> {
  const summary = joinSummary(data);
  const organization = {
    "@type": "Organization",
    "@id": `${JOIN_URL}/#camp`,
    name: "Camp 404",
    url: JOIN_URL,
    description: summary.intro || summary.heading,
    sameAs: [APP_URL],
  };
  const graph: Record<string, unknown>[] = [organization];
  if (data.burn && burnDatesLabel(data.burn)) {
    graph.push({
      "@type": "Event",
      name: `Camp 404 at AfrikaBurn ${data.year}`,
      startDate: data.burn.start,
      endDate: data.burn.end,
      eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      location: {
        "@type": "Place",
        name: "Tankwa Town",
        address: {
          "@type": "PostalAddress",
          addressRegion: "Northern Cape",
          addressCountry: "ZA",
        },
      },
      organizer: { "@id": `${JOIN_URL}/#camp` },
      url: JOIN_URL,
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}

/** JSON-LD safe inside a <script>: no "<" can close the tag early. */
export function jsonLdScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
