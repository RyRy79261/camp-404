"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Shield, X } from "lucide-react";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { Divider } from "@camp404/ui/components/divider";
import { Spinner } from "@camp404/ui/components/spinner";
import type { RosterRow } from "@/lib/camp-roster";
import type { DetailItem, PresentedMember } from "@/lib/member-detail";
import { decideApprovalAction, getMemberDetailAction } from "./actions";
import { AssignCaptainDialog } from "./assign-captain-dialog";
import { RejectConfirmDialog } from "./reject-confirm-dialog";
import { RoleBadge, RosterAvatar, TeamBadge } from "./roster-presentation";

// Inline member profile (board S17 MemberProfile). A row selection expands this
// panel below the roster (not a modal). The head paints instantly from the row;
// the detail (decrypted ID, grouped questionnaire answers, promotion state)
// loads via the captain-gated server action. KEEPS the modal's fetch-with-cancel
// + optimistic decide() + router.refresh() from the previous MemberModal.

type DetailState =
  | { state: "loading" }
  | {
      state: "loaded";
      member: PresentedMember;
      canAssignCaptain: boolean;
      promotionStep: { sent: boolean; accepted: boolean };
      promotionRequestId: string | null;
      promotionRequestIsMine: boolean;
    }
  | { state: "error"; message: string };

const STATUS_BADGE: Record<
  PresentedMember["approvalStatus"],
  { variant: "warning" | "success" | "destructive"; label: string }
> = {
  pending: { variant: "warning", label: "Pending" },
  approved: { variant: "success", label: "Approved" },
  rejected: { variant: "destructive", label: "Rejected" },
};

function FieldGrid({ items }: { items: DetailItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Nothing recorded.</p>
    );
  }
  return (
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {items.map((item, i) => (
        <div key={`${item.label}-${i}`} className="flex flex-col gap-1">
          <dt className="font-mono text-micro font-semibold text-muted-foreground">
            {item.label}
          </dt>
          <dd className="text-sm text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function MemberProfile({
  row,
  index,
  onClose,
}: {
  row: RosterRow;
  index: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const panelRef = useRef<HTMLElement>(null);
  const [detail, setDetail] = useState<DetailState>({ state: "loading" });
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Fetch detail whenever a (new) row is selected; abandon a stale response if
  // the captain has since clicked a different member.
  useEffect(() => {
    let cancelled = false;
    setActionError(null);
    setRejectOpen(false);
    setAssignOpen(false);
    setDetail({ state: "loading" });
    void getMemberDetailAction(row.id)
      .then((res) => {
        if (cancelled) return;
        setDetail(
          res.ok
            ? {
                state: "loaded",
                member: res.member,
                canAssignCaptain: res.canAssignCaptain,
                promotionStep: res.promotionStep,
                promotionRequestId: res.promotionRequestId,
                promotionRequestIsMine: res.promotionRequestIsMine,
              }
            : { state: "error", message: res.error },
        );
      })
      .catch(() => {
        // A thrown/rejected action (network drop, server error) must fall into
        // the error state, not leave the panel stuck on the spinner.
        if (cancelled) return;
        setDetail({ state: "error", message: "Couldn't load this member." });
      });
    return () => {
      cancelled = true;
    };
  }, [row.id]);

  // Move focus into the panel on open (a11y); the island returns focus to the
  // triggering row on close.
  useEffect(() => {
    panelRef.current?.focus();
  }, [row.id]);

  function decide(decision: "approved" | "rejected") {
    setActionError(null);
    startTransition(async () => {
      const res = await decideApprovalAction(row.id, decision);
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      // Reflect the decision locally so the action buttons clear, then refresh
      // the server data behind the roster.
      setDetail((prev) =>
        prev.state === "loaded"
          ? {
              ...prev,
              member: { ...prev.member, approvalStatus: decision },
            }
          : prev,
      );
      setRejectOpen(false);
      router.refresh();
    });
  }

  function markPromotionSent(requestId: string) {
    setDetail((prev) =>
      prev.state === "loaded"
        ? {
            ...prev,
            promotionStep: { ...prev.promotionStep, sent: true },
            promotionRequestId: requestId,
            // This captain just sent it, so it's theirs to cancel.
            promotionRequestIsMine: true,
          }
        : prev,
    );
    router.refresh();
  }

  function markPromotionCancelled() {
    setDetail((prev) =>
      prev.state === "loaded"
        ? {
            ...prev,
            promotionStep: { sent: false, accepted: false },
            promotionRequestId: null,
          }
        : prev,
    );
    router.refresh();
  }

  const member = detail.state === "loaded" ? detail.member : null;
  const canAssignCaptain =
    detail.state === "loaded" && detail.canAssignCaptain;
  const promotionStep =
    detail.state === "loaded"
      ? detail.promotionStep
      : { sent: false, accepted: false };
  const promotionRequestId =
    detail.state === "loaded" ? detail.promotionRequestId : null;
  const promotionRequestIsMine =
    detail.state === "loaded" ? detail.promotionRequestIsMine : false;
  const isAwaiting = member?.approvalStatus === "pending";
  const status = member ? STATUS_BADGE[member.approvalStatus] : null;

  const overviewItems: DetailItem[] = member
    ? [
        ...member.overview,
        {
          label: "Outstanding",
          value:
            row.pendingRequiredActions > 0
              ? `${row.pendingRequiredActions} to complete`
              : "All complete",
        },
      ]
    : [];

  return (
    <section
      ref={panelRef}
      tabIndex={-1}
      aria-label={`${row.displayName} profile`}
      className="flex flex-col gap-5 rounded-lg border bg-card p-5 outline-none sm:p-6"
    >
      {/* PanelBar: console prompt + record index + close. */}
      <div className="flex items-center gap-2 border-b pb-3.5">
        <span aria-hidden className="font-mono text-sm font-bold text-accent">
          {">"}
        </span>
        <span className="flex-1 truncate font-mono text-caption text-muted-foreground">
          {row.displayName.toLowerCase()} · profile
        </span>
        <span className="font-mono text-caption font-semibold text-accent">
          #{String(index).padStart(2, "0")}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close profile"
          className="ml-1 inline-flex items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>

      {/* ProfileHead — paints from the row instantly. */}
      <div className="flex items-start gap-4">
        <RosterAvatar
          name={row.displayName}
          id={row.id}
          px={64}
          radius={8}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h2 className="font-mono text-2xl font-bold text-foreground">
            {row.displayName}
          </h2>
          {row.handle && (
            <p className="font-mono text-sm text-muted-foreground">
              @{row.handle}
            </p>
          )}
          {row.teams.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {row.teams.map((team) => (
                <TeamBadge key={team} team={team} />
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {status && <Badge variant={status.variant}>{status.label}</Badge>}
          <RoleBadge
            rank={row.rank}
            isLead={row.isLead}
            className="rounded-full bg-muted px-2.5 py-1"
          />
        </div>
      </div>

      {/* Body — loads via the captain-gated action. */}
      {detail.state === "loading" && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Spinner size="sm" />
          Loading…
        </div>
      )}
      {detail.state === "error" && (
        <p className="py-8 text-center text-sm text-destructive">
          {detail.message}
        </p>
      )}

      {member && (
        <>
          {member.bio && (
            <p className="whitespace-pre-line text-sm text-foreground">
              {member.bio}
            </p>
          )}

          <p className="font-mono text-caption text-muted-foreground">
            {member.approvalSummary}
          </p>

          <FieldGrid items={overviewItems} />

          {member.profileSections.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No questionnaire answers on record yet.
            </p>
          ) : (
            member.profileSections.map((section) => (
              <div key={section.title} className="flex flex-col gap-3">
                <h3 className="font-mono text-micro font-bold uppercase tracking-wide text-muted-foreground">
                  {section.title}
                </h3>
                <FieldGrid items={section.items} />
              </div>
            ))
          )}

          <Divider />

          {/* Actions — captain decisions + assign-captain. */}
          <div className="flex flex-col gap-3">
            {actionError && (
              <p role="alert" className="text-sm text-destructive">
                {actionError}
              </p>
            )}
            {isAwaiting && (
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <Button
                  type="button"
                  className="flex-1"
                  disabled={isPending}
                  onClick={() => decide("approved")}
                >
                  {isPending ? (
                    <Spinner size="sm" />
                  ) : (
                    <Check aria-hidden className="h-4 w-4" />
                  )}
                  Approve
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={isPending}
                  onClick={() => setRejectOpen(true)}
                >
                  Reject
                </Button>
              </div>
            )}
            {canAssignCaptain && (
              <button
                type="button"
                onClick={() => setAssignOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-secondary bg-secondary/10 py-3 font-mono text-base font-semibold text-secondary-foreground transition-colors hover:bg-secondary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
              >
                <Shield aria-hidden className="h-4 w-4" />
                Assign captain rank
              </button>
            )}
          </div>

          <RejectConfirmDialog
            name={row.displayName}
            open={rejectOpen}
            onOpenChange={(o) => {
              setRejectOpen(o);
              if (!o) setActionError(null);
            }}
            onConfirm={() => decide("rejected")}
            pending={isPending}
            error={actionError}
          />
          {canAssignCaptain && (
            <AssignCaptainDialog
              targetUserId={row.id}
              name={row.displayName}
              open={assignOpen}
              onOpenChange={setAssignOpen}
              step={promotionStep}
              requestId={promotionRequestId}
              requestIsMine={promotionRequestIsMine}
              onSent={markPromotionSent}
              onCancelled={markPromotionCancelled}
            />
          )}
        </>
      )}
    </section>
  );
}
