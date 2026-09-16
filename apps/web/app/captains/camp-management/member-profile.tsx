"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw, Shield, UserX, X } from "lucide-react";
import {
  REVIEW_TARGET,
  availableReviewActions,
  type ReviewAction,
  type ReviewOption,
} from "@camp404/core";
import type { MemberQuestionnaire } from "@camp404/core";
import type { ApprovalStatus } from "@camp404/types";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { useConfirm } from "@camp404/ui/components/confirm-dialog";
import { Divider } from "@camp404/ui/components/divider";
import { Skeleton, SkeletonRegion } from "@camp404/ui/components/skeleton";
import { Spinner } from "@camp404/ui/components/spinner";
import type { RosterRow } from "@/lib/camp-roster";
import { approvalSummary } from "@/lib/approval-summary";
import type { DetailItem, PresentedMember } from "@/lib/member-detail";
import {
  decideApprovalAction,
  getMemberDetailAction,
  type AssignableTeam,
  type MemberDetailResult,
  type TeamMembership,
} from "./actions";
import { AssignCaptainDialog } from "./assign-captain-dialog";
import { MemberNotes } from "./member-notes";
import { RejectConfirmDialog } from "./reject-confirm-dialog";
import { MemberQuestionnaires } from "./member-questionnaires";
import { RoleBadge, RosterAvatar, TeamBadge } from "./roster-presentation";
import { TeamAssignment } from "./team-assignment";

// Inline member profile (board S17 MemberProfile). A row selection expands this
// panel below the roster (not a modal). The head paints instantly from the row;
// the detail (decrypted ID, grouped questionnaire answers, promotion state)
// loads via the captain-gated server action. KEEPS the modal's fetch-with-cancel
// + optimistic decide() + router.refresh() from the previous MemberModal.
//
// The decision panel renders every vetting decision that exists from the
// member's status (owner's call, 2026-09-16: approve, reject, and reverse or
// re-open either), straight from the server's `reviewOptions`. A refused
// decision stays visible, disabled, with the server's sentence beside it. The
// board draws only Approve / Reject on a pending applicant; the rest reuses
// those buttons.

type DetailState =
  | { state: "loading" }
  | {
      state: "loaded";
      member: PresentedMember;
      canAssignCaptain: boolean;
      promotionStep: { sent: boolean; accepted: boolean };
      promotionRequestId: string | null;
      promotionRequestIsMine: boolean;
      promotionRequestedByName: string | null;
      /** This member's teams for the camp's current year. */
      teams: TeamMembership[];
      /** Active teams a captain may assign (archived excluded server-side). */
      assignableTeams: AssignableTeam[];
      /** Every decision from this status, with its refusal or null. */
      reviewOptions: ReviewOption[];
      /** Captains' private notes on this member. */
      notes: Extract<MemberDetailResult, { ok: true }>["notes"];
      /** Where each of this member's questionnaires stands. */
      questionnaires: MemberQuestionnaire[];
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
  onDecided,
  teamLabels = {},
}: {
  row: RosterRow;
  index: number;
  onClose: () => void;
  /**
   * Told when a decision lands, so the roster keeps this member on screen
   * even if the new status no longer matches its filter.
   */
  onDecided?: (userId: string) => void;
  /** key → configured label for the team chips (falls back to the humanizer). */
  teamLabels?: Record<string, string>;
}) {
  const router = useRouter();
  const panelRef = useRef<HTMLElement>(null);
  const [detail, setDetail] = useState<DetailState>({ state: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();

  // A new selection starts on a clean error slate. Deliberately NOT folded into
  // the fetch effect below: a reload driven by a refused decision has to keep
  // the error that caused it on screen.
  useEffect(() => {
    setActionError(null);
  }, [row.id]);

  // Fetch detail whenever a (new) row is selected, or `reloadToken` says the
  // loaded copy is known-stale; abandon a stale response if the captain has
  // since clicked a different member.
  useEffect(() => {
    let cancelled = false;
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
                promotionRequestedByName: res.promotionRequestedByName,
                teams: res.teams,
                assignableTeams: res.assignableTeams,
                reviewOptions: res.reviewOptions,
                notes: res.notes,
                questionnaires: res.questionnaires,
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
  }, [row.id, reloadToken]);

  // Move focus into the panel on open (a11y); the island returns focus to the
  // triggering row on close.
  useEffect(() => {
    panelRef.current?.focus();
  }, [row.id]);

  function decide(from: ApprovalStatus, to: ApprovalStatus, reason?: string) {
    setActionError(null);
    startTransition(async () => {
      const res = await decideApprovalAction({
        userId: row.id,
        from,
        to,
        reason,
      });
      if (!res.ok) {
        setActionError(res.error);
        // The decision may have lost the compare-and-set to another captain.
        // `router.refresh()` re-renders the server components behind the panel
        // but leaves this client component's `detail` untouched, so re-run the
        // fetch too — otherwise `approvalStatus` stays "pending" and the panel
        // keeps offering the decision that was just refused. Harmless for the
        // other error branches, which reload an unchanged member.
        setReloadToken((n) => n + 1);
        router.refresh();
        return;
      }
      // Reflect the decision locally so the panel offers the next decisions,
      // then refresh the server data behind the roster. The decision landed,
      // so this is not the captain's own account.
      setDetail((prev) =>
        prev.state === "loaded"
          ? {
              ...prev,
              // The summary line too, or it says "Awaiting a captain's
              // decision" beside an Approved badge until the panel reopens.
              member: {
                ...prev.member,
                approvalStatus: to,
                approvalSummary: approvalSummary(to),
              },
              reviewOptions: availableReviewActions({
                status: to,
                isSelf: false,
                isCaptain: row.rank === "captain",
              }),
            }
          : prev,
      );
      setRejectOpen(false);
      setRejectReason("");
      onDecided?.(row.id);
      router.refresh();
    });
  }

  // A team write answers with the refreshed membership list; fold it into the
  // panel state and pull the roster behind it down again, since the row's team
  // chips and lead badge are the same rows.
  function applyTeams(teams: TeamMembership[]) {
    setDetail((prev) => (prev.state === "loaded" ? { ...prev, teams } : prev));
    router.refresh();
  }

  function markPromotionSent(sent: {
    requestId: string;
    requestIsMine: boolean;
    requestedByName: string | null;
  }) {
    setDetail((prev) =>
      prev.state === "loaded"
        ? {
            ...prev,
            promotionStep: { ...prev.promotionStep, sent: true },
            promotionRequestId: sent.requestId,
            // Send hands back an existing open request when another captain
            // got there first, and only its sender may cancel it.
            promotionRequestIsMine: sent.requestIsMine,
            promotionRequestedByName: sent.requestedByName,
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
            promotionRequestIsMine: false,
            promotionRequestedByName: null,
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
  const promotionRequestedByName =
    detail.state === "loaded" ? detail.promotionRequestedByName : null;
  const teams = detail.state === "loaded" ? detail.teams : [];
  const assignableTeams =
    detail.state === "loaded" ? detail.assignableTeams : [];
  const reviewOptions = detail.state === "loaded" ? detail.reviewOptions : [];
  const status = member ? STATUS_BADGE[member.approvalStatus] : null;
  // One line per distinct refusal, so two decisions refused for the same
  // reason say it once.
  const refusals = [
    ...new Set(reviewOptions.flatMap((o) => (o.refusal ? [o.refusal] : []))),
  ];

  async function choose(action: ReviewAction) {
    if (!member) return;
    const from = member.approvalStatus;
    if (action === "reject") {
      setRejectOpen(true);
      return;
    }
    if (action === "reopen") {
      const sure = await confirm({
        title: `Move ${row.displayName} back to pending?`,
        description:
          from === "approved"
            ? "They lose access to the app until a captain approves them again. Their teams stay."
            : "Their application goes back in the queue, and the reason you gave is cleared.",
        confirmLabel: "Move to pending",
      });
      if (!sure) return;
    }
    decide(from, REVIEW_TARGET[action]);
  }

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
        // From the payments ledger: a received or waived payment this year.
        { label: "Dues this year", value: row.duesPaid ? "Paid" : "Not paid" },
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
                <TeamBadge key={team} team={team} label={teamLabels[team]} />
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
      {/* The shape of what is coming (the detail rows, then a section), so
          the panel does not jump when it arrives. One announcing region. */}
      {detail.state === "loading" && (
        <SkeletonRegion
          label="Loading profile…"
          className="flex flex-col gap-4 py-2"
        >
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-4 gap-y-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Fragment key={i}>
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-full max-w-48" />
              </Fragment>
            ))}
          </div>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </SkeletonRegion>
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

          {detail.state === "loaded" && (
            <MemberQuestionnaires questionnaires={detail.questionnaires} />
          )}

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

          {/* Team assignment — the write path behind every team-scoped
              broadcast, questionnaire send and roster badge. */}
          <TeamAssignment
            userId={row.id}
            teams={teams}
            assignableTeams={assignableTeams}
            teamLabels={teamLabels}
            onChange={applyTeams}
          />

          <Divider />

          <MemberNotes
            userId={row.id}
            notes={detail.state === "loaded" ? detail.notes : []}
            onChange={(notes) =>
              setDetail((prev) =>
                prev.state === "loaded" ? { ...prev, notes } : prev,
              )
            }
          />

          <Divider />

          {/* Actions — captain decisions + assign-captain. */}
          <div className="flex flex-col gap-3">
            {actionError && (
              <p role="alert" className="text-sm text-destructive">
                {actionError}
              </p>
            )}
            {reviewOptions.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-2.5 sm:flex-row">
                  {reviewOptions.map((option) => (
                    <DecisionButton
                      key={option.action}
                      option={option}
                      from={member.approvalStatus}
                      busy={isPending}
                      onChoose={(action) => void choose(action)}
                    />
                  ))}
                </div>
                {refusals.map((refusal) => (
                  <p key={refusal} className="text-xs text-muted-foreground">
                    {refusal}
                  </p>
                ))}
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

          {confirmDialog}
          <RejectConfirmDialog
            mode={
              member.approvalStatus === "approved"
                ? { kind: "offboard", name: row.displayName }
                : { kind: "application", name: row.displayName }
            }
            open={rejectOpen}
            onOpenChange={(o) => {
              setRejectOpen(o);
              if (!o) setActionError(null);
            }}
            onConfirm={() =>
              decide(member.approvalStatus, "rejected", rejectReason)
            }
            pending={isPending}
            error={actionError}
            reason={rejectReason}
            onReasonChange={setRejectReason}
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
              requestedByName={promotionRequestedByName}
              onSent={markPromotionSent}
              onCancelled={markPromotionCancelled}
            />
          )}
        </>
      )}
    </section>
  );
}

/** One decision control. Refused decisions stay visible, disabled. */
function DecisionButton({
  option,
  from,
  busy,
  onChoose,
}: {
  option: ReviewOption;
  from: ApprovalStatus;
  busy: boolean;
  onChoose: (action: ReviewAction) => void;
}) {
  const disabled = busy || option.refusal !== null;
  switch (option.action) {
    case "approve":
      return (
        <Button
          type="button"
          className="flex-1"
          disabled={disabled}
          onClick={() => onChoose("approve")}
        >
          {busy ? (
            <Spinner size="sm" />
          ) : (
            <Check aria-hidden className="h-4 w-4" />
          )}
          Approve
        </Button>
      );
    case "reject":
      return (
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={disabled}
          onClick={() => onChoose("reject")}
        >
          {from === "approved" && <UserX aria-hidden className="h-4 w-4" />}
          {from === "approved" ? "Remove from camp" : "Reject"}
        </Button>
      );
    case "reopen":
      return (
        <Button
          type="button"
          variant="ghost"
          className="flex-1"
          disabled={disabled}
          onClick={() => onChoose("reopen")}
        >
          <RotateCcw aria-hidden className="h-4 w-4" />
          Move back to pending
        </Button>
      );
  }
}
