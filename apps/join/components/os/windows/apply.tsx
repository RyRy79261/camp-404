import { APPLY, APPLY_URL } from "@/lib/content";

// The off-white "early access" window, inverted from the desktop's colours.
export function ApplyWindow() {
  return (
    <div className="flex h-full flex-col gap-4 bg-os-fg p-6 text-os-bg">
      <h3 className="font-pixel text-lg uppercase leading-snug">
        {APPLY.heading}
      </h3>
      <p className="text-sm">{APPLY.body}</p>
      <a
        href={APPLY_URL}
        target="_blank"
        rel="noopener noreferrer"
        data-autofocus
        className="mt-auto w-fit border-2 border-os-bg bg-os-fg px-6 py-2 font-pixel text-sm uppercase text-os-bg shadow-[4px_4px_0_0_var(--color-os-primary)] hover:bg-os-primary hover:text-os-primary-fg focus-visible:bg-os-primary focus-visible:text-os-primary-fg active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
      >
        {APPLY.button}
        <span className="sr-only"> (opens the Google Form in a new tab)</span>
      </a>
    </div>
  );
}
