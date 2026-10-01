import type { ReactNode } from "react";
import Link from "next/link";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { Button } from "@camp404/ui/components/button";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { cn } from "@camp404/ui/lib/utils";
import {
  MONEY_LOCK_MESSAGE,
  MONEY_REFUSAL,
  MY_DUES_PATH,
  PAYMENTS_TABS,
} from "@/lib/dues-copy";
import { PaymentsTabMenu } from "./payments-tab-menu";

// The Finance tools' frame (#240): the heading, then a row of tabs, one per
// page (the ledger, who owes what, the bank statement, the settle-up, and the
// year's fees and dates), all in the one Payments window. Below page-sm the
// tabs are one menu instead (PaymentsTabMenu): seven never fit a phone.

export type PaymentsTab = (typeof PAYMENTS_TABS)[number]["href"];

export function PaymentsTabs({ active }: { active: PaymentsTab }) {
  return (
    <nav
      aria-label="Payments pages"
      className="-mx-1 mb-6 hidden overflow-x-auto border-b border-border page-sm:block"
    >
      <ul className="flex min-w-max gap-1 px-1">
        {PAYMENTS_TABS.map((tab) => {
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
export function PaymentsFrame({
  active,
  title,
  description,
  actions,
  cleared,
  refusal = MONEY_REFUSAL,
  below = false,
  children,
}: {
  active: PaymentsTab;
  /** A page below the active tab: a phone gets a link back to it. */
  below?: boolean;
  title: string;
  description: string;
  actions?: ReactNode;
  /** False: the heading and a lock, and nothing was read. */
  cleared: boolean;
  /** The lock's sentence (a tab can say what it, in particular, is for). */
  refusal?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Finance / Payments"
        title={title}
        description={description}
        actions={cleared ? actions : undefined}
      />
      {cleared ? (
        <>
          <PaymentsTabs active={active} />
          <PaymentsTabMenu
            active={active}
            below={below}
            className="page-sm:hidden"
          />
          {children}
        </>
      ) : (
        <CaptainLock
          title="Captains and Finance leads"
          message={refusal === MONEY_REFUSAL ? MONEY_LOCK_MESSAGE : refusal}
          action={
            refusal === MONEY_REFUSAL ? (
              <Button asChild size="sm">
                <Link href={MY_DUES_PATH}>Go to My dues</Link>
              </Button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
