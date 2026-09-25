import { CREW, type Headcount } from "@/lib/content";
import { Eyebrow, WinBody } from "./ui";

// This year's captains, then a headcount from the app's "Coming this year?"
// answers: counts only, never a list of who.
export function CrewWindow() {
  return (
    <WinBody>
      <section aria-labelledby="crew-captains" className="space-y-2">
        <Eyebrow id="crew-captains">{CREW.captainsHeading}</Eyebrow>
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
            {CREW.captains.map((c) => (
              <tr key={c.name} className="border-b border-os-line/50 align-top">
                <th
                  scope="row"
                  className="py-2 pr-3 font-pixel text-xs uppercase"
                >
                  {c.name}
                </th>
                <td className="py-2 pr-3 font-mono text-[11px] uppercase text-os-primary">
                  {c.role}
                </td>
                <td className="py-2 text-os-muted">{c.bio}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="crew-count" className="space-y-3">
        <Eyebrow id="crew-count">{CREW.headcountHeading}</Eyebrow>
        <p className="font-mono text-xs text-os-accent">
          &gt; SELECT answer, COUNT(*) FROM coming_this_year GROUP BY answer;
        </p>
        {CREW.headcount ? (
          <HeadcountBars count={CREW.headcount} />
        ) : (
          <div className="space-y-1">
            <p className="font-pixel text-2xl uppercase">
              NULL<span className="camp404-cursor">_</span>
            </p>
            <p>{CREW.counting}</p>
          </div>
        )}
        <p className="text-xs text-os-muted">{CREW.headcountSource}</p>
      </section>
    </WinBody>
  );
}

function HeadcountBars({ count }: { count: Headcount }) {
  const total = Math.max(count.yes + count.maybe, 1);
  const rows = [
    { label: "Said yes", n: count.yes, bar: "bg-os-primary" },
    { label: "Maybe", n: count.maybe, bar: "bg-os-accent" },
    { label: "Accepted", n: count.accepted, bar: "bg-os-fg" },
  ];
  return (
    <div className="space-y-3">
      <p className="font-pixel text-3xl uppercase">
        {count.yes + count.maybe}{" "}
        <span className="text-base text-os-muted">humans answered</span>
      </p>
      <dl className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.label}
            className="grid grid-cols-[6rem_1fr_2.5rem] items-center gap-3"
          >
            <dt className="font-mono text-[11px] uppercase text-os-muted">
              {r.label}
            </dt>
            <div aria-hidden className="h-3 border border-os-line">
              <div
                className={`h-full ${r.bar}`}
                style={{ width: `${(r.n / total) * 100}%` }}
              />
            </div>
            <dd className="text-right font-pixel text-sm">{r.n}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
