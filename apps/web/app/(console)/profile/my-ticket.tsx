"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import {
  TICKET_STATUS_OPTION,
  WAP_LABEL,
  ddtRequestMet,
  myDdtLabel,
  type TicketFacts,
} from "@camp404/core";
import { TICKET_STATUSES, type TicketStatus } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { FieldList } from "@camp404/ui/components/field-list";
import { OptionCardGroup } from "@camp404/ui/components/option-card-group";
import { setMyTicketAction } from "./actions";

// The member's own ticket for this year (#238), under "This year" on their
// profile: four plain choices, and Save once one changes. The captains read it
// on Applications (and may set it for the member). Under it, read-only, the
// member's own DDT and WAP, which only captains set (owner, 2026-09-28), in
// words that answer what the member asked for.

const OPTIONS = TICKET_STATUSES.map((value) => ({
  value,
  label: TICKET_STATUS_OPTION[value],
}));

/** A sub-block's heading inside the This year card. */
function SubHeading({ id, children }: { id: string; children: string }) {
  return (
    <h3
      id={id}
      className="text-sm font-semibold normal-case tracking-normal text-foreground"
    >
      {children}
    </h3>
  );
}

export function MyTicket({ ticket }: { ticket: TicketFacts }) {
  const { ticketStatus } = ticket;
  const [value, setValue] = useState<TicketStatus>(ticketStatus);
  const [saved, setSaved] = useState<TicketStatus>(ticketStatus);
  const [message, setMessage] = useState<
    { ok: true } | { ok: false; error: string } | null
  >(null);
  const [pending, startTransition] = useTransition();
  const dirty = value !== saved;
  // The camp's DDT answers the member's own request: say so beside it.
  const met = ddtRequestMet({ ...ticket, ticketStatus: saved });

  return (
    <div className="flex flex-col gap-4">
      <form
        aria-labelledby="my-ticket-heading"
        className="flex flex-col gap-3 border-t border-border pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const result = await setMyTicketAction({ ticketStatus: value });
            setMessage(result);
            if (result.ok) setSaved(value);
          });
        }}
      >
        <SubHeading id="my-ticket-heading">Your ticket</SubHeading>
        <OptionCardGroup
          aria-label="Your ticket"
          options={OPTIONS}
          value={value}
          onValueChange={(v) => {
            setValue(v as TicketStatus);
            setMessage(null);
          }}
        />
        {met && value === saved && (
          <p className="text-sm text-muted-foreground">
            The camp has given you a DDT. Pick &ldquo;I have my ticket&rdquo;
            once you&rsquo;ve bought it.
          </p>
        )}
        {/* Save shows only once there is something to save; "Saved" takes
            its place after. */}
        {(dirty || message) && (
          <div className="flex min-h-9 flex-wrap items-center gap-3">
            {dirty && (
              <Button type="submit" size="sm" disabled={pending}>
                {pending && <Loader2 className="animate-spin" aria-hidden />}
                Save ticket
              </Button>
            )}
            {message?.ok && !dirty && (
              <span
                role="status"
                className="inline-flex items-center gap-1.5 text-sm text-success"
              >
                <Check className="h-4 w-4" aria-hidden />
                Saved
              </span>
            )}
            {message && !message.ok && (
              <span role="alert" className="text-sm text-destructive">
                {message.error}
              </span>
            )}
          </div>
        )}
      </form>

      <section
        aria-labelledby="from-captains-heading"
        className="flex flex-col gap-3 border-t border-border pt-4"
      >
        <SubHeading id="from-captains-heading">From the captains</SubHeading>
        <FieldList
          fields={[
            {
              label: "DDT (direct distribution ticket)",
              value: myDdtLabel({ ...ticket, ticketStatus: saved }),
            },
            { label: "WAP (work access pass)", value: WAP_LABEL[ticket.wap] },
          ]}
        />
      </section>
    </div>
  );
}
