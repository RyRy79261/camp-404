import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { EditItemButton } from "@/components/inventory/item-dialog";
import {
  BookButton,
  CancelBookingButton,
  ItemMenu,
  LendButton,
  ReturnLoanButton,
  ReviewButtons,
  SuggestChangeButton,
} from "@/components/inventory/item-actions";
import {
  InvCard,
  InvCardHeader,
  StatusText,
  SubLine,
} from "@/components/inventory/inventory-table";
import { SuggestionDiff } from "@/components/inventory/suggestion-diff";
import {
  getInventoryItem,
  listInventoryLoans,
  listItemBookings,
  listItemUpdates,
  type InventoryLoanRow,
  type InventoryUpdateRow,
} from "@/lib/inventory";
import {
  CATEGORY_LABELS,
  CONDITION_LABELS,
  INVENTORY_PATH,
  bookingState,
  countText,
  dateText,
  maintenanceNote,
  shortDate,
  suggestionDiff,
  whereText,
} from "@/lib/inventory-copy";
import { captainPageGate } from "@/lib/captain-gate";
import { inventoryViewer } from "@/lib/inventory-viewer";
import { listAssignableMembers } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export const metadata = { title: "Item — Camp 404" };

// One item (#246; redesign option A, owner 2026-10-01), inside the Inventory
// window with a link back, laid out like AfrikaBurn's registration review:
// what we have, this year's bookings and loans on the left; the changes
// members suggested and the item's history in a rail on the right. Every
// member reads it, books it and may suggest a change; a captain or a lead of
// its team edits it (Edit, with Lend out and Archive behind "···"), decides
// suggestions and lends it out. A booking names its member only to them and
// to the member who made it: the rows come from the server already without
// the names.

function Fact({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="mb-1 text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm leading-5">{children}</dd>
    </div>
  );
}

/** One row in a box's list: words on the left, one action on the right. */
function Row({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <li className="grid grid-cols-[1fr_8rem] items-center gap-3 border-t border-border px-4 py-3 text-sm first:border-t-0 page-sm:grid-cols-[1fr_9.5rem]">
      {/* A row with nothing to press takes the whole width. */}
      <span className={action ? "min-w-0" : "col-span-2 min-w-0"}>
        {children}
      </span>
      {action}
    </li>
  );
}

type HistoryLine = { at: Date; text: string; quote?: string | null };

function historyOf(
  updates: InventoryUpdateRow[],
  loans: InventoryLoanRow[],
): HistoryLine[] {
  const lines: HistoryLine[] = [];
  for (const u of updates) {
    if (u.status === "pending") continue;
    const by = u.proposedByName ?? "a member";
    if (u.note === "Added" || u.note === "Edited") {
      lines.push({ at: u.createdAt, text: `${u.note} by ${by}` });
      continue;
    }
    const verdict = u.status === "approved" ? "approved" : "turned down";
    lines.push({
      at: u.reviewedAt ?? u.createdAt,
      text: `${u.proposedByName ?? "A member"}'s change ${verdict}${
        u.reviewedByName ? ` by ${u.reviewedByName}` : ""
      }`,
      quote: u.reviewNote,
    });
  }
  for (const l of loans) {
    lines.push({
      at: l.lentAt,
      text: `Lent ${l.quantity} to ${l.borrowerCamp}${l.lentByName ? ` by ${l.lentByName}` : ""}`,
    });
    if (l.returnedAt) {
      lines.push({
        at: l.returnedAt,
        text: `${l.quantity} back from ${l.borrowerCamp}`,
      });
    }
  }
  return lines.sort((a, b) => b.at.getTime() - a.at.getTime());
}

export default async function InventoryItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await inventoryViewer(await captainPageGate("camp_member"));
  const { id } = await params;
  const item = await getInventoryItem(id);
  if (!item) notFound();
  const archived = item.archivedAt !== null;
  const canEdit = viewer.canEdit(item.team) && !archived;

  const [updates, bookings, loans, members] = await Promise.all([
    listItemUpdates(item.id),
    item.bookableCount !== null
      ? listItemBookings(item.id, viewer.userId, canEdit)
      : Promise.resolve([]),
    listInventoryLoans(item.id),
    archived ? Promise.resolve([]) : listAssignableMembers(),
  ]);
  const memberOptions = members.map((m) => ({
    value: m.id,
    label: m.displayName,
  }));
  const pending = updates.filter((u) => u.status === "pending");
  const history = historyOf(updates, loans);
  const mine = bookings.find((b) => b.mine);
  const openLoans = loans.filter((l) => l.returnedAt === null);
  const lentOut = openLoans.reduce((sum, l) => sum + l.quantity, 0);
  const lentCamps = [...new Set(openLoans.map((l) => l.borrowerCamp))];
  const booking =
    item.bookableCount !== null
      ? bookingState({
          bookableCount: item.bookableCount,
          quantity: item.quantity,
          condition: item.condition,
          lentOut,
          booked: bookings.length,
          myBookingId: mine?.id ?? null,
        })
      : null;
  const maintenance = maintenanceNote(item, new Date());
  const category = CATEGORY_LABELS[item.category];
  // The edit dialog keeps the item under a team this viewer may change; the
  // item's own team is always offered to them.
  const teams = viewer.editableTeams.some((t) => t.value === item.team)
    ? viewer.editableTeams
    : [
        { value: item.team, label: viewer.teamLabel(item.team) },
        ...viewer.editableTeams,
      ];
  const others = bookings.filter((b) => !b.mine);
  const thisYear = new Date().getFullYear();

  return (
    <div className="flex flex-col">
      <p className="mb-1 text-xs text-muted-foreground">
        <Link
          href={INVENTORY_PATH}
          className="inline-flex items-center gap-0.5 underline underline-offset-4 hover:text-foreground"
        >
          <ChevronLeft aria-hidden className="size-3.5 page-sm:hidden" />
          Inventory
        </Link>
        <span className="hidden page-sm:inline"> / {category}</span>
      </p>
      <PageHeading
        title={item.name}
        description={`${viewer.teamLabel(item.team)} · ${whereText(item)}`}
        actions={
          canEdit ? (
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
                // Full width on a phone, beside the "···" (the mock-up).
                className="flex-1 page-sm:flex-none"
              />
              <ItemMenu
                itemId={item.id}
                name={item.name}
                version={item.version}
              />
            </>
          ) : !archived ? (
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
          ) : undefined
        }
      />

      {archived && (
        <p className="mb-4 border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          The camp no longer keeps this item. It stays here for its history.
        </p>
      )}

      <div className="grid items-start gap-4 page-md:grid-cols-[1fr_17.5rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <InvCard label="facts">
            <InvCardHeader
              id="facts"
              title="What we have"
              aside={
                item.lastCheckedAt
                  ? `Last counted ${dateText(item.lastCheckedAt)}`
                  : "Not counted yet"
              }
            />
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-4">
              <Fact label="How many">
                <span className="tabular-nums">
                  {countText(item.quantity, item.unit)}
                </span>
              </Fact>
              <Fact label="Condition">
                {item.condition === "good" ? (
                  CONDITION_LABELS.good
                ) : (
                  <StatusText
                    tone={item.condition === "broken" ? "bad" : "warn"}
                  >
                    {CONDITION_LABELS[item.condition]}
                  </StatusText>
                )}
              </Fact>
              {lentOut > 0 && (
                <Fact label="Out with other camps">
                  {lentOut},{" "}
                  {lentCamps.length === 1
                    ? `to ${lentCamps[0]}`
                    : `to ${lentCamps.length} camps`}
                </Fact>
              )}
              {booking && item.bookableCount !== null && (
                <Fact label="Can be booked">
                  <b className="font-semibold tabular-nums">{booking.free}</b>{" "}
                  of {item.quantity}{" "}
                  <span className="text-xs text-muted-foreground">
                    ({bookings.length} booked)
                  </span>
                </Fact>
              )}
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
                {!item.requiresMaintenance ? (
                  <span className="text-muted-foreground">Not needed</span>
                ) : (
                  <>
                    Every {item.maintenanceIntervalDays} days
                    <SubLine>
                      {item.lastMaintainedAt
                        ? `Last done ${dateText(item.lastMaintainedAt)}`
                        : "Never done"}
                    </SubLine>
                    {maintenance?.due && (
                      <StatusText tone="warn">{maintenance.text}</StatusText>
                    )}
                  </>
                )}
              </Fact>
              {item.details && (
                <Fact label="Details" wide>
                  <span className="whitespace-pre-line">{item.details}</span>
                </Fact>
              )}
            </dl>
          </InvCard>

          {booking && item.bookableCount !== null && (
            <InvCard label="bookings">
              <InvCardHeader
                id="bookings"
                title="Bookings this year"
                phoneTitle="Bookings"
                aside={
                  <>
                    <span className="tabular-nums">
                      {bookings.length} of {booking.free}
                      <span className="hidden page-sm:inline"> booked</span>
                    </span>
                    {mine ? (
                      <CancelBookingButton
                        bookingId={mine.id}
                        // The phone's shorter words (the mock-up).
                        text={
                          <>
                            <span className="page-sm:hidden">Cancel mine</span>
                            <span className="hidden page-sm:inline">
                              Cancel my booking
                            </span>
                          </>
                        }
                        label={`Cancel my booking of ${item.name}`}
                      />
                    ) : !archived && booking.left > 0 ? (
                      <BookButton itemId={item.id} name={item.name} />
                    ) : null}
                  </>
                }
              />
              <ul>
                {archived && (
                  <Row>
                    <span className="text-muted-foreground">
                      It can&apos;t be booked: the camp no longer keeps it.
                    </span>
                  </Row>
                )}
                {!archived && booking.broken && (
                  <Row>
                    <span className="text-muted-foreground">
                      It&apos;s marked broken, so it can&apos;t be booked until
                      it&apos;s fixed.
                    </span>
                  </Row>
                )}
                {!booking.broken &&
                  !mine &&
                  !archived &&
                  booking.left === 0 && (
                    <Row>
                      <span className="text-muted-foreground">
                        {booking.free === 0
                          ? "None is free to book: the rest are lent to another camp."
                          : "It's fully booked this year."}
                      </span>
                    </Row>
                  )}
                {mine && (
                  <Row>
                    <span className="font-semibold">You</span>
                    <SubLine>
                      Booked {shortDate(mine.createdAt)}
                      <span className="hidden page-sm:inline">
                        , for the whole burn
                      </span>
                    </SubLine>
                  </Row>
                )}
                {canEdit
                  ? others.map((b) => (
                      <Row
                        key={b.id}
                        action={
                          <CancelBookingButton
                            bookingId={b.id}
                            text="Cancel booking"
                            label={`Cancel ${b.displayName}'s booking`}
                            confirmFor={b.displayName ?? "this member"}
                            className="w-full"
                          />
                        }
                      >
                        <span className="font-semibold">{b.displayName}</span>
                        <SubLine>
                          Booked {shortDate(b.createdAt)}
                          <span className="hidden page-sm:inline">
                            , for the whole burn
                          </span>
                          {b.note ? ` · ${b.note}` : ""}
                        </SubLine>
                      </Row>
                    ))
                  : others.length > 0 && (
                      <Row>
                        <span className="text-muted-foreground">
                          {others.length === 1
                            ? "1 booked by another member."
                            : `${others.length} booked by other members.`}
                        </span>
                      </Row>
                    )}
                {bookings.length === 0 &&
                  !archived &&
                  !booking.broken &&
                  booking.left > 0 && (
                    <Row>
                      <span className="text-muted-foreground">
                        Nobody has booked one yet. A booking is one unit for the
                        whole burn.
                      </span>
                    </Row>
                  )}
              </ul>
            </InvCard>
          )}

          {(loans.length > 0 || canEdit) && (
            <InvCard label="loans">
              <InvCardHeader
                id="loans"
                title="Lent out this year"
                phoneTitle="Lent out"
                aside={
                  <>
                    <span>{lentOut} out</span>
                    {canEdit && (
                      <LendButton itemId={item.id} name={item.name} />
                    )}
                  </>
                }
              />
              <ul>
                {loans.length === 0 && (
                  <Row>
                    <span className="text-muted-foreground">
                      Not lent to another camp this year.
                    </span>
                  </Row>
                )}
                {loans.map((l) => (
                  <Row
                    key={l.id}
                    action={
                      l.returnedAt === null && canEdit ? (
                        <ReturnLoanButton
                          loanId={l.id}
                          what={`${l.quantity} lent to ${l.borrowerCamp}`}
                          className="w-full"
                        />
                      ) : undefined
                    }
                  >
                    <span className="font-semibold">
                      {l.quantity} to {l.borrowerCamp}
                    </span>
                    <SubLine>
                      {l.borrowerAddress} · {l.lentByName ?? "A member"},{" "}
                      {shortDate(l.lentAt)}
                      {l.returnedAt ? ` · back ${shortDate(l.returnedAt)}` : ""}
                    </SubLine>
                  </Row>
                ))}
              </ul>
            </InvCard>
          )}
        </div>

        <aside
          aria-label="Suggestions and history"
          className="flex min-w-0 flex-col gap-4"
        >
          {pending.length > 0 && (
            <InvCard
              label="suggested"
              className="border-[color-mix(in_oklab,var(--color-primary)_45%,transparent)]"
            >
              <InvCardHeader
                id="suggested"
                title={
                  pending.length === 1
                    ? "Suggested change"
                    : "Suggested changes"
                }
              />
              <ul>
                {pending.map((u) => (
                  <li
                    key={u.id}
                    className="flex flex-col gap-3 border-t border-border p-4 first:border-t-0"
                  >
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {u.proposedByName ?? "A member"} ·{" "}
                      {shortDate(u.createdAt)}
                      {!canEdit && (
                        <span className="border border-border px-1.5 py-px text-[11px] font-semibold text-foreground">
                          Waiting for review
                        </span>
                      )}
                    </span>
                    <SuggestionDiff
                      fields={suggestionDiff(item, u)}
                      note={u.note}
                      narrow
                    />
                    {canEdit && (
                      <ReviewButtons
                        updateId={u.id}
                        what={`the change to ${item.name}`}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </InvCard>
          )}
          <InvCard label="history">
            <InvCardHeader id="history" title="History" />
            {history.length === 0 ? (
              <p className="p-4 text-xs text-muted-foreground">Nothing yet.</p>
            ) : (
              <ul>
                {history.map((h, i) => (
                  <li
                    key={i}
                    className="border-t border-border px-4 py-2.5 text-xs leading-4 first:border-t-0"
                  >
                    {h.text},{" "}
                    {h.at.getFullYear() === thisYear
                      ? shortDate(h.at)
                      : dateText(h.at)}
                    {h.quote && (
                      <span className="block text-muted-foreground italic">
                        &ldquo;{h.quote}&rdquo;
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </InvCard>
        </aside>
      </div>
    </div>
  );
}
