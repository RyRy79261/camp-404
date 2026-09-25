import { BURN_YEAR, CREW } from "@/lib/content";
import { WinBody } from "./ui";

const Query = ({ children }: { children: React.ReactNode }) => (
  <p className="font-mono text-xs text-os-accent">&gt; {children}</p>
);

// The crew as a database query, because we are that kind of camp. It shows
// only what is known: the captains, and a crew that is still forming.
export function CrewWindow() {
  return (
    <WinBody>
      <Query>SELECT name, role FROM captains WHERE year = {BURN_YEAR};</Query>
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
        {CREW.captains.length} {CREW.captains.length === 1 ? "row" : "rows"}{" "}
        returned.
      </p>
      <Query>SELECT COUNT(*) FROM crew WHERE year = {BURN_YEAR};</Query>
      <p className="font-pixel text-2xl uppercase">
        NULL<span className="camp404-cursor">_</span>
      </p>
      <p>{CREW.forming}</p>
    </WinBody>
  );
}
