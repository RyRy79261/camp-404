import Link from "next/link";
import { cn } from "@camp404/ui/lib/utils";

// The account section nav under the profile heading (the AfrikaBurn account
// shell's pill row). A plain nav of links rather than tabs: each section is its
// own route, so the active state survives a full page load and every entry is a
// real, shareable URL.

export type ProfileSection = "profile" | "edit";

const SECTIONS: readonly {
  key: ProfileSection;
  label: string;
  href: string;
}[] = [
  { key: "profile", label: "Profile", href: "/profile" },
  { key: "edit", label: "Edit profile", href: "/profile/edit" },
];

export function ProfileSections({ active }: { active: ProfileSection }) {
  return (
    <nav
      aria-label="Account sections"
      className="inline-flex w-fit items-center gap-1 rounded-md bg-muted p-1"
    >
      {SECTIONS.map((section) => {
        const current = section.key === active;
        return (
          <Link
            key={section.key}
            href={section.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "rounded-sm px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              current
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
