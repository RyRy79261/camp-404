import type { JoinScheduleEntry as ScheduleEntry } from "@camp404/types";
import { burnDatesLabel } from "@/lib/countdown";
import { useJoinData } from "../join-data";
import { AllHands, Eyebrow, WinBody } from "./ui";

function Block({
  id,
  title,
  entries,
}: {
  id: string;
  title: string;
  entries: readonly ScheduleEntry[];
}) {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <Eyebrow id={id}>{title}</Eyebrow>
      <dl className="divide-y divide-os-line/60 border-y border-os-line/60">
        {entries.map((e) => (
          <div
            key={e.when}
            className="grid grid-cols-[7.5rem_1fr] gap-3 py-1.5"
          >
            <dt className="font-mono text-[11px] uppercase text-os-primary">
              {e.when}
            </dt>
            <dd>
              {e.what}
              {e.allHands && <AllHands />}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function ScheduleWindow() {
  const { year, burn, content } = useJoinData();
  const schedule = content.schedule;
  return (
    <WinBody>
      <p className="border border-os-accent/60 px-3 py-1.5 font-mono text-[11px] uppercase text-os-accent">
        {burn ? `AfrikaBurn ${year}: ${burnDatesLabel(burn)}. ` : ""}
        {schedule.datesNote}
      </p>
      <Block id="sched-before" title="Before" entries={schedule.before} />
      <Block id="sched-onsite" title="On site" entries={schedule.onSite} />
      <Block id="sched-after" title="After" entries={schedule.after} />
      <section aria-labelledby="sched-shifts" className="space-y-2">
        <Eyebrow id="sched-shifts">Daily shifts</Eyebrow>
        <p className="text-os-muted">{schedule.shiftsIntro}</p>
        <ul className="space-y-1">
          {schedule.shifts.map((s) => (
            <li key={s} className="flex gap-2">
              <span aria-hidden className="text-os-primary">
                ›
              </span>
              {s}
            </li>
          ))}
        </ul>
      </section>
      <p className="bg-os-primary/15 px-3 py-2 font-mono text-xs uppercase text-os-fg">
        {schedule.proactive}
      </p>
    </WinBody>
  );
}
