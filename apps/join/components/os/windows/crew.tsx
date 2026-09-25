import { BURN_YEAR, CREW } from "@/lib/content";
import { Eyebrow, WinBody } from "./ui";

// The crew as a database query, because we are that kind of camp.
export function CrewWindow() {
  return (
    <WinBody>
      <p className="font-mono text-xs text-os-accent">
        &gt; SELECT * FROM crew WHERE year = {BURN_YEAR};
      </p>
      <p className="font-pixel text-2xl uppercase">
        {CREW.size} humans{" "}
        <span className="text-os-muted">+ {CREW.orphans} orphans</span>
      </p>
      <div className="grid grid-cols-3 gap-1">
        {CREW.split.map((s, i) => (
          <div key={s.who} className="space-y-1">
            <div
              aria-hidden
              className={`h-3 ${["bg-os-primary", "bg-os-accent", "bg-os-fg"][i]}`}
            />
            <p className="font-mono text-[11px] uppercase text-os-muted">
              <span className="text-os-fg">{s.share}</span> {s.who}
            </p>
          </div>
        ))}
      </div>
      <section aria-labelledby="crew-captains" className="space-y-2">
        <Eyebrow id="crew-captains">Captains {BURN_YEAR - 1}</Eyebrow>
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
        <p className="font-mono text-[10px] uppercase text-os-muted">
          {CREW.captains.length} rows returned.
        </p>
      </section>
    </WinBody>
  );
}
