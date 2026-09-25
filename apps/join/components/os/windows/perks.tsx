import { useJoinData } from "../join-data";
import { WinBody } from "./ui";

export function PerksWindow() {
  const perks = useJoinData().content.perks;
  return (
    <WinBody>
      <ul className="grid gap-1 sm:grid-cols-2">
        {perks.summary.map((p) => (
          <li key={p} className="flex gap-2">
            <span aria-hidden className="font-mono text-os-primary">
              [✓]
            </span>
            {p}
          </li>
        ))}
      </ul>
      <div className="space-y-2">
        {perks.files.map((f) => (
          <details
            key={f.file}
            className="group border border-os-line bg-os-bg/60 open:border-os-primary"
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 font-mono text-xs uppercase text-os-fg marker:hidden hover:bg-os-chrome [&::-webkit-details-marker]:hidden">
              <span
                aria-hidden
                className="text-os-primary group-open:rotate-90"
              >
                ▸
              </span>
              {f.file}
              <span className="text-os-muted">· {f.name}</span>
            </summary>
            <div className="space-y-2 px-3 pb-3">
              {f.paragraphs.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </details>
        ))}
      </div>
    </WinBody>
  );
}
