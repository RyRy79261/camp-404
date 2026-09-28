import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { bookingsLeft, maintenanceDue } from "@camp404/core";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { EditItemButton } from "@/components/inventory/item-dialog";
import {
  ArchiveItemButton,
  BookButton,
  CancelBookingButton,
  LendButton,
  ReturnLoanButton,
  ReviewButtons,
  SuggestChangeButton,
} from "@/components/inventory/item-actions";
import {
  getInventoryItem,
  listInventoryLoans,
  listItemBookings,
  listItemUpdates,
  type InventoryUpdateRow,
} from "@/lib/inventory";
import {
  CATEGORY_LABELS,
  CONDITION_LABELS,
  INVENTORY_PATH,
  INVENTORY_REFUSAL,
  countText,
  dateText,
  whereText,
} from "@/lib/inventory-copy";
import { captainPageGate } from "@/lib/captain-gate";
import { inventoryViewer } from "@/lib/inventory-viewer";
import { listAssignableMembers } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export const metadata = { title: "Item — Camp 404" };

// One item (#246): its facts, this year's bookings and loans, the changes
// members suggested, and its change log. Every member reads it and may
// suggest a change or book it; a captain or a lead of its team edits it,
// decides suggestions and lends it out. A booking names its member only to
// them (and to the member who made it): the rows come from the server
// already without the names.

const REFUSAL_ID = "inventory-item-refusal";

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function Section({
  id,
  title,
  aside,
  children,
}: {
  id: string;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="text-base font-semibold">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function changeText(u: InventoryUpdateRow): string {
  const parts = [`${u.quantity}`];
  if (u.condition) parts.push(CONDITION_LABELS[u.condition].toLowerCase());
  if (u.location) {
    parts.push(
      whereText({
        location: u.location,
        custodianName: u.custodianName,
        storageLocation: u.storageLocation,
      }).toLowerCase(),
    );
  }
  if (u.maintenancePerformedAt) parts.push("maintenance done");
  return parts.join(", ");
}

const STATUS_WORDS = {
  approved: "Applied",
  rejected: "Rejected",
  pending: "Waiting",
} as const;

export default async function InventoryItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await inventoryViewer(await captainPageGate("camp_member"));
  const { id } = await params;
  const item = await getInventoryItem(id);
  if (!item) notFound();
  const canEdit = viewer.canEdit(item.team) && item.archivedAt === null;

  const [updates, bookings, loans, members] = await Promise.all([
    listItemUpdates(item.id),
    item.bookableCount !== null
      ? listItemBookings(item.id, viewer.userId, canEdit)
      : Promise.resolve([]),
    listInventoryLoans(item.id),
    listAssignableMembers(),
  ]);
  const memberOptions = members.map((m) => ({
    value: m.id,
    label: m.displayName,
  }));
  const pending = updates.filter((u) => u.status === "pending");
  const history = updates.filter((u) => u.status !== "pending");
  const mine = bookings.find((b) => b.mine);
  const left = bookingsLeft(item.bookableCount, bookings.length);
  const now = new Date();
  const due = maintenanceDue(item, now);
  const openLoans = loans.filter((l) => l.returnedAt === null);
  // The edit dialog keeps the item under a team this viewer may change; the
  // item's own team is always offered to them.
  const teams = viewer.editableTeams.some((t) => t.value === item.team)
    ? viewer.editableTeams
    : [
        { value: item.team, label: viewer.teamLabel(item.team) },
        ...viewer.editableTeams,
      ];

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow={`${viewer.teamLabel(item.team)} · ${CATEGORY_LABELS[item.category]}`}
        title={item.name}
        description={item.details ?? undefined}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href={INVENTORY_PATH}>
                <ArrowLeft aria-hidden />
                All gear
              </Link>
            </Button>
            {item.archivedAt === null && (
              <SuggestChangeButton
                item={{
                  itemId: item.id,
                  name: item.name,
                  quantity: item.quantity,
                  condition: item.condition,
                  location: item.location,
                  custodianUserId: item.custodianUserId,
                  storageLocation: item.storageLocation,
                  requiresMaintenance: item.requiresMaintenance,
                }}
                members={memberOptions}
              />
            )}
            {canEdit && (
              <>
                <EditItemButton
                  item={{
                    id: item.id,
                    version: item.version,
                    name: item.name,
                    details: item.details,
                    team: item.team,
                    category: item.category,
                    condition: item.condition,
                    quantity: item.quantity,
                    unit: item.unit,
                    weightKg: item.weightKg,
                    wattsEach: item.wattsEach,
                    location: item.location,
                    custodianUserId: item.custodianUserId,
                    storageLocation: item.storageLocation,
                    requiresMaintenance: item.requiresMaintenance,
                    maintenanceIntervalDays: item.maintenanceIntervalDays,
                    bookableCount: item.bookableCount,
                  }}
                  teams={teams}
                  members={memberOptions}
                />
                <LendButton itemId={item.id} name={item.name} />
                <ArchiveItemButton
                  itemId={item.id}
                  name={item.name}
                  version={item.version}
                />
              </>
            )}
          </>
        }
      />

      <div className="flex flex-col gap-6">
        {item.archivedAt !== null && (
          <p className="rounded-lg border border-border bg-card/40 px-3 py-2.5 text-sm text-muted-foreground">
            The camp no longer keeps this item. It stays here for its history.
          </p>
        )}
        {!canEdit && item.archivedAt === null && (
          <p
            id={REFUSAL_ID}
            className="flex items-start gap-2 rounded-lg border border-border bg-card/40 px-3 py-2.5 text-xs text-muted-foreground"
          >
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {INVENTORY_REFUSAL}
          </p>
        )}

        <Section id="facts" title="What we have">
          <dl className="grid gap-4 page-sm:grid-cols-2 page-lg:grid-cols-3">
            <Fact label="How many">
              <span className="tabular-nums">
                {countText(item.quantity, item.unit)}
              </span>
            </Fact>
            <Fact label="Condition">{CONDITION_LABELS[item.condition]}</Fact>
            <Fact label="Where">{whereText(item)}</Fact>
            {item.weightKg !== null && (
              <Fact label="Weight">
                <span className="tabular-nums">{item.weightKg} kg</span>
              </Fact>
            )}
            {item.wattsEach !== null && (
              <Fact label="Draws">
                <span className="tabular-nums">{item.wattsEach} W each</span>
              </Fact>
            )}
            <Fact label="Maintenance">
              {item.requiresMaintenance ? (
                <span className={due ? "text-warning" : undefined}>
                  Every {item.maintenanceIntervalDays} days ·{" "}
                  {item.lastMaintainedAt
                    ? `last ${dateText(item.lastMaintainedAt)}`
                    : "never recorded"}
                  {due ? " · due now" : ""}
                </span>
              ) : (
                "None needed"
              )}
            </Fact>
            <Fact label="Last checked">
              {item.lastCheckedAt ? dateText(item.lastCheckedAt) : "Not yet"}
            </Fact>
          </dl>
        </Section>

        {pending.length > 0 && (
          <Section id="suggested" title="Suggested changes">
            <ul className="flex flex-col divide-y divide-border">
              {pending.map((u) => (
                <li
                  key={u.id}
                  className="flex flex-col gap-2 py-3 page-sm:flex-row page-sm:items-center page-sm:justify-between"
                >
                  <div className="min-w-0 text-sm">
                    <p>
                      <span className="font-medium">
                        {u.proposedByName ?? "A member"}
                      </span>{" "}
                      <span className="text-muted-foreground">says</span>{" "}
                      {changeText(u)}
                    </p>
                    {u.note && (
                      <p className="text-xs text-muted-foreground">
                        &ldquo;{u.note}&rdquo;
                      </p>
                    )}
                  </div>
                  {canEdit ? (
                    <ReviewButtons
                      updateId={u.id}
                      what={`${item.name}: ${u.quantity}`}
                    />
                  ) : (
                    <Badge variant="outline">Waiting for review</Badge>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {item.bookableCount !== null && (
          <Section
            id="bookings"
            title="Bookings this year"
            aside={
              <p className="text-xs text-muted-foreground tabular-nums">
                {bookings.length} of {item.bookableCount} booked
              </p>
            }
          >
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {mine ? (
                <>
                  <span>You&apos;ve booked this.</span>
                  <CancelBookingButton
                    bookingId={mine.id}
                    label={`Cancel my booking of ${item.name}`}
                  />
                </>
              ) : left > 0 && item.archivedAt === null ? (
                <>
                  <span className="text-muted-foreground">
                    {left} left to book.
                  </span>
                  <BookButton itemId={item.id} name={item.name} />
                </>
              ) : (
                <span className="text-muted-foreground">
                  It&apos;s fully booked this year.
                </span>
              )}
            </div>
            {canEdit && bookings.length > 0 && (
              <ul className="flex flex-col divide-y divide-border">
                {bookings.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between gap-2 py-2 text-sm"
                  >
                    <span>
                      {b.displayName}
                      {b.note && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {b.note}
                        </span>
                      )}
                    </span>
                    {!b.mine && (
                      <CancelBookingButton
                        bookingId={b.id}
                        label={`Cancel ${b.displayName}'s booking`}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {loans.length > 0 && (
          <Section
            id="loans"
            title="Lent out this year"
            aside={
              <p className="text-xs text-muted-foreground">
                {openLoans.length} still out
              </p>
            }
          >
            <ul className="flex flex-col divide-y divide-border">
              {loans.map((l) => (
                <li
                  key={l.id}
                  className="flex flex-col gap-2 py-2 text-sm page-sm:flex-row page-sm:items-center page-sm:justify-between"
                >
                  <span>
                    {l.quantity} to {l.borrowerCamp}{" "}
                    <span className="text-muted-foreground">
                      at {l.borrowerAddress} · {dateText(l.lentAt)}
                      {l.returnedAt ? ` · back ${dateText(l.returnedAt)}` : ""}
                    </span>
                  </span>
                  {l.returnedAt === null && canEdit && (
                    <ReturnLoanButton
                      loanId={l.id}
                      what={`${l.quantity} lent to ${l.borrowerCamp}`}
                    />
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section id="history" title="Change log">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No changes yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {history.map((u) => (
                <li key={u.id} className="flex flex-col gap-0.5 py-2 text-sm">
                  <span>
                    <Badge
                      variant={u.status === "approved" ? "success" : "outline"}
                      className="mr-2"
                    >
                      {STATUS_WORDS[u.status]}
                    </Badge>
                    {u.note === "Added" || u.note === "Edited"
                      ? `${u.note} by ${u.proposedByName ?? "a member"}`
                      : `${u.proposedByName ?? "A member"} said ${changeText(u)}`}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {dateText(u.createdAt)}
                    {u.reviewedByName && u.reviewedByName !== u.proposedByName
                      ? ` · reviewed by ${u.reviewedByName}`
                      : ""}
                    {u.reviewNote ? ` · “${u.reviewNote}”` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
