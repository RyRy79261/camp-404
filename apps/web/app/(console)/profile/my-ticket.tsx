"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { TICKET_STATUS_OPTION } from "@camp404/core";
import { TICKET_STATUSES, type TicketStatus } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { OptionCardGroup } from "@camp404/ui/components/option-card-group";
import { setMyTicketAction } from "./actions";

// The member's own ticket for this year (#238), under "This year" on their
// profile: four plain choices and Save. The captains read it on Applications;
// the camp's DDT and WAP are the captains' to record
// and are not shown here.

const OPTIONS = TICKET_STATUSES.map((value) => ({
  value,
  label: TICKET_STATUS_OPTION[value],
}));

export function MyTicket({ ticketStatus }: { ticketStatus: TicketStatus }) {
  const [value, setValue] = useState<TicketStatus>(ticketStatus);
  const [saved, setSaved] = useState<TicketStatus>(ticketStatus);
  const [message, setMessage] = useState<
    { ok: true } | { ok: false; error: string } | null
  >(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await setMyTicketAction({ ticketStatus: value });
          setMessage(result);
          if (result.ok) setSaved(value);
        });
      }}
    >
      <span aria-hidden className="text-sm font-medium">
        Your Burn ticket
      </span>
      <OptionCardGroup
        aria-label="Your Burn ticket"
        options={OPTIONS}
        value={value}
        onValueChange={(v) => {
          setValue(v as TicketStatus);
          setMessage(null);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={pending || value === saved}
        >
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Save ticket
        </Button>
        {message?.ok && (
          <span role="status" className="text-sm text-muted-foreground">
            Saved.
          </span>
        )}
        {message && !message.ok && (
          <span role="alert" className="text-sm text-destructive">
            {message.error}
          </span>
        )}
      </div>
    </form>
  );
}
