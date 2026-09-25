import { CREW_LABELS } from "@/lib/content";
import type { JoinHeadcount as Headcount } from "@/lib/join-data";
import { useJoinData } from "../join-data";
import { Eyebrow, WinBody } from "./ui";

// This year's captains, then a headcount from the app's "Coming this year?"
// answers: counts only, never a list of who.
export function CrewWindow() {
  const { year, captains, headcount } = useJoinData();
  return (
    <WinBody>
      <section aria-labelledby="crew-captains" className="space-y-2">
        <Eyebrow id="crew-captains">
          {CREW_LABELS.captainsHeading(year)}
        </Eyebrow>
        {captains.length === 0 ? (
          <p className="text-os-muted">{CREW_LABELS.noCaptains}</p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead className="font-mono text-[10px] uppercase tracking-widest text-os-muted">
              <tr className="border-b border-os-line">
                <th scope="col" className="py-1 pr-3 font-normal">
                  name
                </th>
                <th scope="col" className="py-1 pr-3 font-normal">
                  role
                </th>
                <th scope="col" className="py-1 font-normal">
                  bio
                </th>
              </tr>
            </thead>
            <tbody>
              {captains.map((c) => (
                <tr
                  key={c.name}
                  className="border-b border-os-line/50 align-top"
                >
                  <th
                    scope="row"
                    className="py-2 pr-3 font-pixel text-xs uppercase"
                  >
                    {c.name}
                  </th>
                  <td className="py-2 pr-3 font-mono text-[11px] uppercase text-os-primary">
                    {c.title}
                  </td>
                  <td className="py-2 text-os-muted">{c.blurb}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-labelledby="crew-count" className="space-y-3">
        <Eyebrow id="crew-count">{CREW_LABELS.headcountHeading(year)}</Eyebrow>
        <p className="font-mono text-xs text-os-accent">
          &gt; SELECT status, COUNT(*) FROM coming_this_year GROUP BY status;
        </p>
        <CapacityBar count={headcount} />
        <p className="text-xs text-os-muted">{CREW_LABELS.headcountSource}</p>
      </section>
    </WinBody>
  );
}

const SEGMENTS = [
  { key: "accepted", label: "Accepted", swatch: "bg-os-primary" },
  { key: "applied", label: "Said yes, waiting", swatch: "bg-os-primary/45" },
  {
    key: "maybe",
    label: "Maybe",
    swatch:
      "bg-[repeating-linear-gradient(135deg,var(--color-os-accent)_0_3px,transparent_3px_6px)]",
  },
] as const;

// One bar from 0 to the camp's capacity: accepted, then yes-and-waiting, then
// maybe, with the minimum the camp needs marked on it.
function CapacityBar({ count }: { count: Headcount | null }) {
  const crew = useJoinData().content.crew;
  const { min, max } = crew.capacity;
  const pct = (n: number) => `${(Math.min(n, max) / max) * 100}%`;
  const accepted = count?.accepted ?? 0;
  return (
    <div className="space-y-3">
      {count ? (
        <p className="font-pixel text-3xl uppercase">
          {accepted}
          <span className="text-base text-os-muted">
            {" "}
            / {max} places filled
          </span>
        </p>
      ) : (
        <div className="space-y-1">
          <p className="font-pixel text-2xl uppercase">
            NULL<span className="camp404-cursor">_</span>
            <span className="text-base text-os-muted"> / {max} places</span>
          </p>
          <p>{crew.counting}</p>
        </div>
      )}

      <div className="relative pb-10 pt-1">
        <div
          role="img"
          aria-label={
            count
              ? `${count.accepted} accepted, ${count.applied} said yes and waiting, ${count.maybe} maybe, of ${max} places. The camp needs ${min}.`
              : `Not counted yet. The camp needs ${min} and has room for ${max}.`
          }
          className="flex h-5 overflow-hidden border border-os-line bg-os-bg"
        >
          {count &&
            SEGMENTS.map((s) => (
              <div
                key={s.key}
                className={`h-full ${s.swatch}`}
                style={{ width: pct(count[s.key]) }}
              />
            ))}
        </div>
        <div
          aria-hidden
          className="absolute top-0 h-7 w-0.5 -translate-x-1/2 bg-os-fg"
          style={{ left: pct(min) }}
        />
        <p
          aria-hidden
          className="absolute top-8 -translate-x-1/2 whitespace-nowrap text-center font-mono text-[10px] uppercase text-os-fg"
          style={{ left: pct(min) }}
        >
          {min} · {CREW_LABELS.minLabel}
        </p>
        <p
          aria-hidden
          className="absolute right-0 top-8 font-mono text-[10px] uppercase text-os-muted"
        >
          {max} · {CREW_LABELS.maxLabel}
        </p>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {SEGMENTS.map((s) => (
          <li
            key={s.key}
            className="flex items-center gap-2 font-mono text-[11px] uppercase text-os-muted"
          >
            <span
              aria-hidden
              className={`size-3 border border-os-line ${s.swatch}`}
            />
            {s.label}
            {count && <span className="text-os-fg">{count[s.key]}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
