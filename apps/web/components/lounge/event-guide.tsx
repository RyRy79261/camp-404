import { cn } from "@camp404/ui/lib/utils";
import { guideText, type GuideEntry } from "@/lib/lounge-view";
import { CopyGuideButton } from "./lounge-controls";
import { LoungeCard, LoungeCardHeader, TABLE, TD, TH } from "./lounge-parts";

// The list for the AfrikaBurn event guide (redesign option A, owner
// 2026-10-01): only for the people who run the lounge, since sending it in is
// the Ministry's job (audit, 2026-10-01). The accepted offers whose hosts
// ticked "event guide", when they are on and who hosts them, and one Copy
// that puts the list (with the dates) on the clipboard. A table in a wide
// window, rows on a phone. Server-rendered.

export function EventGuide({ entries }: { entries: readonly GuideEntry[] }) {
  return (
    <LoungeCard
      className="@container/guide"
      labelledBy="lounge-guide-title"
      testId="event-guide"
    >
      <LoungeCardHeader
        id="lounge-guide-title"
        title="For the AfrikaBurn event guide"
        note={
          entries.length > 0
            ? `${entries.length} ${entries.length === 1 ? "host" : "hosts"} asked for it`
            : undefined
        }
        aside={
          entries.length > 0 ? (
            <CopyGuideButton text={guideText(entries)} />
          ) : undefined
        }
      />
      {entries.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">
          Nothing yet. Accepted offers whose hosts ticked &ldquo;event
          guide&rdquo; are listed here, ready to send in.
        </p>
      ) : (
        <>
          <table className={cn(TABLE, "hidden @min-[40rem]/guide:table")}>
            <caption className="sr-only">
              For the AfrikaBurn event guide
            </caption>
            <colgroup>
              <col />
              <col className="w-56" />
              <col className="w-52" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className={TH}>
                  Offer
                </th>
                <th scope="col" className={TH}>
                  When
                </th>
                <th scope="col" className={TH}>
                  Host
                </th>
              </tr>
            </thead>
            <tbody className="[&>tr:first-child>td]:border-t-0">
              {entries.map((e) => (
                <tr key={e.offerId} data-testid="guide-entry">
                  <td className={cn(TD, "font-semibold")}>{e.title}</td>
                  <td className={cn(TD, "tabular-nums")}>
                    {e.when || (
                      <span className="text-muted-foreground">
                        Not placed yet
                      </span>
                    )}
                  </td>
                  <td className={cn(TD, "truncate")} title={e.hostName}>
                    {e.hostName}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="@min-[40rem]/guide:hidden">
            {entries.map((e) => (
              <li
                key={e.offerId}
                data-testid="guide-entry"
                className="flex flex-col gap-1 border-t border-border px-4 py-3 text-sm leading-5 first:border-t-0"
              >
                <span className="font-semibold">{e.title}</span>
                <span className="text-xs leading-4 text-muted-foreground tabular-nums">
                  {e.when || "Not placed yet"} · {e.hostName}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </LoungeCard>
  );
}
