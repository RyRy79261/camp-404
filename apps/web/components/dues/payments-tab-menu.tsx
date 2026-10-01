"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@camp404/ui/components/select";
import { cn } from "@camp404/ui/lib/utils";
import { PAYMENTS_TABS } from "@/lib/dues-copy";

// The Finance tools' tabs in a narrow window (#240): seven tabs never fit a
// phone's width, and a row cut off at "Budg" hid the last three. Below
// page-sm the row is this one menu instead, naming the page you are on; the
// pick opens that page.

type Tab = (typeof PAYMENTS_TABS)[number]["href"];

export function PaymentsTabMenu({
  active,
  className,
}: {
  active: Tab;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className={cn("mb-6", className)}>
      <Select
        value={active}
        onValueChange={(href) => {
          const tab = PAYMENTS_TABS.find((t) => t.href === href);
          if (tab && tab.href !== active) start(() => router.push(tab.href));
        }}
      >
        <SelectTrigger
          aria-label="Payments page"
          className={cn(pending && "os-pending")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PAYMENTS_TABS.map((tab) => (
            <SelectItem key={tab.href} value={tab.href}>
              {tab.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
