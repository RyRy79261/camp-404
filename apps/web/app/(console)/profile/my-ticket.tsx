"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import {
  DDT_LABEL,
  TICKET_STATUS_OPTION,
  WAP_LABEL,
  type TicketFacts,
} from "@camp404/core";
import { TICKET_STATUSES, type TicketStatus } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { OptionCardGroup } from "@camp404/ui/components/option-card-group";
import { setMyTicketAction } from "./actions";

// The member's own ticket for this year (#238), under "This year" on their
// profile: four plain choices and Save. The captains read it on Applications
// (and may set it for the member). Under it, read-only, the member's own DDT
// and WAP, which only captains set (owner, 2026-09-28).

const OPTIONS = TICKET_STATUSES.map((value) => ({
  value,
  label: TICKET_STATUS_OPTION[value],
}));

export function MyTicket({ ticket }: { ticket: TicketFacts }) {
  const { ticketStatus } = ticket;
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
      <div className="flex flex-col gap-1.5 border-t border-border pt-3">
        <dl
          aria-label="Set by the captains"
          className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm"
        >
          <dt className="text-muted-foreground">
            DDT (direct distribution ticket)
          </dt>
          <dd className="font-medium">{DDT_LABEL[ticket.ddt]}</dd>
          <dt className="text-muted-foreground">WAP (work access pass)</dt>
          <dd className="font-medium">{WAP_LABEL[ticket.wap]}</dd>
        </dl>
        <p className="text-xs text-muted-foreground">The captains set these.</p>
      </div>
    </form>
  );
}
