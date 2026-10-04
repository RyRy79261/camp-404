import type { CSSProperties } from "react";
import { TriangleAlert } from "lucide-react";
import type { PrintableDutyCard } from "@camp404/core";
import { teamSheetStyle } from "../lib/team-style";
import { MarkdownBody } from "./markdown-body";

// One Survival Guide duty card on A4 portrait (#250; the owner approved
// design/print-duty-card.html), to laminate and pin up on site. Big type, so
// it reads from a step away: the team's colour strip and icon (the daily site
// sheet's, components/print/team-style.ts), the card's title, the shifts that
// use it, who to ask (a role, never a number), who does what, the steps, the
// hard rules in a heavy box, the shift lead's end-of-shift checklist with tick
// boxes, and the card's "Good to know" text. A section with nothing in it is
// not drawn. It names no member.
//
// A long card flows onto the next sheet and nothing is clipped. On paper (and
// in the PDF) the footer is drawn in the page's bottom margin, so it is on
// every sheet the card takes: each card is its own named page
// (`page: duty-card-N`) with its own footer words. On screen the footer sits
// at the foot of the card instead.
//
// It lives in @camp404/ui so the app's print (apps/web, with its shell and
// Download PDF) and the public guide site (apps/guide, Print only) put the
// very same card on paper. The page around it sets --paper-height and
// --paper-margin.

export interface DutyCardPrint {
  key: string;
  title: string;
  /** The team key, or null for a whole-camp card. */
  team: string | null;
  /** "Kitchen", "Whole camp". */
  teamLabel: string;
  /** A writer's saved draft rather than the published card. */
  draft: boolean;
  card: PrintableDutyCard;
  /** The card's "Good to know" Markdown. */
  markdown: string;
  /** The shifts that use it this year; the public site leaves them out. */
  usedBy: { id: string; name: string; timeText: string }[];
  /** "Survival Guide · version 4 · updated 12 Apr 2027". */
  footer: string;
}

/** The footer's words as a CSS string: only numbers, dates and our words. */
function cssString(text: string): string {
  return `"${text.replace(/["\\\n\r]/g, " ")}"`;
}

const FOOTER_BOX =
  "font-family: var(--font-sans, sans-serif); font-size: 8pt; color: #555; vertical-align: middle;";

/**
 * The @page rules that put each card's footer on every sheet it takes. The
 * page count is the PDF's own: "page 3 of 7" in a print of every card.
 */
export function dutyCardPageStyles(
  cards: readonly Pick<DutyCardPrint, "footer">[],
  printed: string,
  /**
   * An element printed before the first card (the app's screen-reader
   * title) that should take the first card's page, so the first sheet is
   * that card's too.
   */
  leading?: string,
): string {
  const first =
    cards.length > 0 && leading ? `${leading} { page: duty-card-0; }\n` : "";
  return (
    first +
    cards
      .map(
        (c, i) =>
          `@page duty-card-${i} { margin-left: 6mm; @bottom-left { content: ${cssString(c.footer)}; ${FOOTER_BOX} } @bottom-right { content: ${cssString(`Printed ${printed} · page `)} counter(page) " of " counter(pages); ${FOOTER_BOX} } }`,
      )
      .join("\n")
  );
}

function SectionHeading({ children }: { children: string }) {
  return (
    <h3 className="mt-[16px] mb-[6px] break-after-avoid border-b-[1.5px] border-neutral-900 pb-[3px] text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-800">
      {children}
    </h3>
  );
}

export function DutyCardPage({
  print,
  index,
  printed,
  screenPage,
}: {
  print: DutyCardPrint;
  /** Its place in the print, for its named page. */
  index: number;
  printed: string;
  /** On screen only: "page 1 of 1" (paper counts its own sheets). */
  screenPage: string;
}) {
  const style = teamSheetStyle(print.team ?? "");
  const { Icon } = style;
  const { card } = print;
  const kicker = `Camp 404 · Duty card${print.draft ? " (draft)" : ""} · ${print.teamLabel}`;
  return (
    <section
      aria-label={print.title}
      data-testid="duty-card"
      style={
        {
          "--edge": style.edge,
          "--tint": style.tint,
          page: `duty-card-${index}`,
        } as CSSProperties
      }
      className="flex min-h-[var(--paper-height)] w-full flex-col bg-white py-[var(--paper-margin)] pr-[var(--paper-margin)] pl-[6mm] text-neutral-900 shadow-md break-after-page print:min-h-0 print:p-0 print:shadow-none print:last:break-after-auto"
    >
      {/* The strip is this box's left border, cloned onto each sheet a long
          card takes, so it runs down every page. Its width matches paper's:
          the page's left margin is 6 mm (dutyCardPageStyles). */}
      <div className="flex flex-1 flex-col border-l-[14px] border-[var(--edge)] pl-[44px] [box-decoration-break:clone] print:min-h-[calc(var(--paper-height)_-_2*var(--paper-margin)_-_2mm)]">
        <div data-card-words>
          <header className="flex items-center gap-3">
            <Icon
              aria-hidden
              className="h-[34px] w-[34px] flex-none text-[var(--edge)]"
              strokeWidth={2}
            />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                {kicker}
              </p>
              <h2 className="m-0 text-[30px] font-bold normal-case leading-tight tracking-normal">
                {print.title}
              </h2>
            </div>
          </header>

          {print.usedBy.length > 0 && (
            <p data-testid="duty-card-used-by" className="mt-1.5 text-[12.5px]">
              Used by:{" "}
              {print.usedBy.map((s, i) => (
                <span key={s.id}>
                  {i > 0 && " · "}
                  <b className="font-semibold">{s.name}</b>{" "}
                  <span className="tabular-nums">{s.timeText}</span>
                </span>
              ))}
            </p>
          )}

          {card.ask && (
            <p className="mt-2 w-fit border border-[var(--edge)] bg-[var(--tint)] px-2.5 py-[5px] text-[13px]">
              Stuck? Ask {card.ask.article} <b>{card.ask.role}</b>.
            </p>
          )}

          {card.subRoles.length > 0 && (
            <>
              <SectionHeading>Who does what</SectionHeading>
              <ul
                aria-label="Who does what"
                className="grid grid-cols-2 gap-x-6 gap-y-1 text-[14px]"
              >
                {card.subRoles.map((r, i) => (
                  <li
                    key={i}
                    className="flex justify-between gap-3 border-b border-[#ddd] py-1 break-inside-avoid"
                  >
                    {r.name}
                    <span className="text-neutral-700 tabular-nums whitespace-nowrap">
                      {r.headcount}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {card.steps.length > 0 && (
            <>
              <SectionHeading>Steps</SectionHeading>
              <ol
                aria-label="Steps"
                className="m-0 list-decimal pl-6 text-[14px] leading-[1.45]"
              >
                {card.steps.map((s, i) => (
                  <li key={i} className="pt-0.5 pb-[3px] break-inside-avoid">
                    {s}
                  </li>
                ))}
              </ol>
            </>
          )}

          {card.hardRules.length > 0 && (
            <>
              <SectionHeading>Hard rules</SectionHeading>
              <div className="mt-1 border-[2.5px] border-neutral-900 px-3 py-2 break-inside-avoid">
                <p className="mb-1 flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.1em]">
                  <TriangleAlert
                    aria-hidden
                    className="h-[15px] w-[15px] flex-none"
                    strokeWidth={2.2}
                  />
                  Never skip these
                </p>
                <ul
                  aria-label="Hard rules"
                  className="m-0 list-disc pl-5 text-[14px] font-semibold leading-[1.45]"
                >
                  {card.hardRules.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {card.checklist.length > 0 && (
            <>
              <SectionHeading>
                Before you leave · shift lead ticks
              </SectionHeading>
              <ul aria-label="Before you leave" className="text-[14px]">
                {card.checklist.map((c, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 border-b border-[#ddd] py-[5px] break-inside-avoid"
                  >
                    <span
                      aria-hidden
                      className="mt-px h-[15px] w-[15px] flex-none border-[1.5px] border-neutral-900"
                    />
                    {c}
                  </li>
                ))}
              </ul>
            </>
          )}

          {print.markdown.trim() !== "" && (
            <>
              <SectionHeading>Good to know</SectionHeading>
              <MarkdownBody className="text-[14px] leading-[1.45] [&_a]:text-neutral-900 [&_p]:my-1.5">
                {print.markdown}
              </MarkdownBody>
            </>
          )}
        </div>
        {/* On screen only; paper draws it in the page margin (above). */}
        <div className="mt-auto pt-8 print:hidden">
          <footer
            aria-hidden
            className="flex justify-between gap-4 border-t border-neutral-300 pt-1.5 text-[10.5px] tracking-[0.02em] text-neutral-600"
          >
            <span>{print.footer}</span>
            <span>
              Printed {printed} · <span data-screen-page>{screenPage}</span>
            </span>
          </footer>
        </div>
      </div>
    </section>
  );
}
