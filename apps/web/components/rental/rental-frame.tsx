import type { ReactNode } from "react";
import Link from "next/link";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { cn } from "@camp404/ui/lib/utils";
import { RENTAL_REFUSAL, RENTAL_TABS } from "@/lib/rental-copy";

// Gear rental's frame for captains (#241): the heading, then a row of tabs,
// one per page (the orders, the summary and the catalogue), all in the one
// Gear rental window. The tabs scroll sideways on a phone rather than squeeze.
// The same composition as the Finance tools' frame.

export type RentalTab = (typeof RENTAL_TABS)[number]["href"];

export function RentalTabs({ active }: { active: RentalTab }) {
  return (
    <nav
      aria-label="Gear rental pages"
      className="-mx-1 mb-6 overflow-x-auto border-b border-border"
    >
      <ul className="flex min-w-max gap-1 px-1">
        {RENTAL_TABS.map((tab) => {
          const current = tab.href === active;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex items-center whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  current
                    ? "border-accent text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The heading and tabs, then the page, or the lock for anyone else. */
export function RentalFrame({
  active,
  title,
  description,
  actions,
  cleared,
  children,
}: {
  active: RentalTab;
  title: string;
  description: string;
  actions?: ReactNode;
  /** False: the heading and a lock, and nothing was read. */
  cleared: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Captains / Gear rental"
        title={title}
        description={description}
        actions={cleared ? actions : undefined}
      />
      {cleared ? (
        <>
          <RentalTabs active={active} />
          {children}
        </>
      ) : (
        <CaptainLock
          title="Captains only"
          message={`${RENTAL_REFUSAL} Your rank doesn't have clearance for this.`}
        />
      )}
    </div>
  );
}
