import { useJoinData } from "../join-data";
import type { AppId } from "@/lib/window-manager";

export function ReadmeWindow({ openApp }: { openApp: (id: AppId) => void }) {
  const { readme } = useJoinData().content;
  return (
    <article className="space-y-4 p-5 text-sm leading-relaxed text-os-fg">
      <h3 className="os-glow font-pixel text-xl uppercase leading-tight text-os-fg">
        {readme.heading}
      </h3>
      {readme.paragraphs.map((p) => (
        <p key={p}>{p}</p>
      ))}
      <p className="border border-os-primary/60 bg-os-primary/10 px-3 py-2 font-mono text-xs uppercase tracking-wide text-os-primary">
        ⚠ {readme.warning}
      </p>
      <blockquote className="border-l-2 border-os-accent pl-4 italic text-os-muted">
        “{readme.quote}”
      </blockquote>
      <section aria-labelledby="readme-join" className="space-y-2">
        <h4
          id="readme-join"
          className="font-pixel text-xs uppercase tracking-widest text-os-accent"
        >
          How to join
        </h4>
        <ol className="list-inside list-decimal space-y-1 marker:font-mono marker:text-os-primary">
          {readme.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => openApp("apply")}
          className="mt-2 border-2 border-os-fg bg-os-fg px-4 py-2 font-pixel text-xs uppercase text-os-bg shadow-[4px_4px_0_0_var(--color-os-primary)] hover:bg-os-primary hover:text-os-primary-fg active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
        >
          Run APPLY.EXE
        </button>
      </section>
    </article>
  );
}
