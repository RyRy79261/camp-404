"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Lock,
  RotateCcw,
  Shield,
  ShieldAlert,
  UserX,
} from "lucide-react";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { useConfirm } from "@camp404/ui/components/confirm-dialog";
import {
  Skeleton,
  SkeletonRegion,
  SkeletonText,
} from "@camp404/ui/components/skeleton";
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
import { ProfileHead } from "./roster-presentation";
import { TeamAssignment } from "./team-assignment";

// The captain's member profile, laid out like the AfrikaBurn registration
// review: a header, then the member's record in cards down a main column and
// the decision, rank and team controls in a sticky side column. A row
// selection opens it inline below the roster (not a modal). The head paints
// instantly from the row; the detail (decrypted ID, grouped questionnaire
// answers, promotion state) loads via the captain-gated server action. KEEPS
// the fetch-with-cancel + optimistic decide() + router.refresh() from the
// previous MemberModal.
//
// The decision card renders every vetting decision that exists from the
// member's status (owner's call, 2026-09-16: approve, reject, and reverse or
// re-open either), straight from the server's `reviewOptions`. A refused
// decision stays visible, disabled, with the server's sentence beside it.

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

/** A definition list of read-only fields (AfrikaBurn's `FieldList`). */
function FieldGrid({ items }: { items: DetailItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing recorded.</p>;
  }
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      {items.map((item, i) => (
        <div key={`${item.label}-${i}`}>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {item.label}
          </dt>
          <dd className="mt-1 whitespace-pre-wrap text-sm text-foreground">
            {item.value}
          </dd>
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
  const canAssignCaptain = detail.state === "loaded" && detail.canAssignCaptain;
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
          // Named, so a captain chasing a member can say what to finish.
          value:
            row.outstanding.length > 0
              ? row.outstanding.join(", ")
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
      className="flex scroll-mt-24 flex-col gap-6 border-t pt-8 outline-none motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-200"
    >
      {/* Head — paints from the row instantly. */}
      <ProfileHead
        row={row}
        index={index}
        teamLabels={teamLabels}
        badges={
          status && <Badge variant={status.variant}>{status.label}</Badge>
        }
        onClose={onClose}
      />

      {/* Body — loads via the captain-gated action. The shape of what is
          coming (the record cards, then the side column), so the panel does
          not jump when it arrives. One announcing region. */}
      {detail.state === "loading" && (
        <SkeletonRegion
          label="Loading profile…"
          className="grid items-start gap-6 page-lg:grid-cols-3"
        >
          <div className="flex flex-col gap-6 page-lg:col-span-2">
            {[6, 3].map((lines) => (
              <div
                key={lines}
                className="rounded-xl border bg-card p-6 shadow-sm"
              >
                <Skeleton className="h-4 w-32" />
                <SkeletonText lines={lines} className="mt-5" />
              </div>
            ))}
          </div>
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <Skeleton className="h-4 w-24" />
            <SkeletonText lines={2} className="mt-5" />
            <Skeleton className="mt-5 h-9 w-full" />
          </div>
        </SkeletonRegion>
      )}
      {detail.state === "error" && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-destructive">
            {detail.message}
          </CardContent>
        </Card>
      )}

      {member && (
        <div className="grid items-start gap-6 page-lg:grid-cols-3">
          {/* The member's record. */}
          <div className="flex min-w-0 flex-col gap-6 page-lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Overview</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                {member.bio && (
                  <p className="whitespace-pre-line text-sm text-foreground">
                    {member.bio}
                  </p>
                )}
                <FieldGrid items={overviewItems} />
              </CardContent>
            </Card>

            {detail.state === "loaded" && (
              <MemberQuestionnaires questionnaires={detail.questionnaires} />
            )}

            {member.profileSections.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  No questionnaire answers on record yet.
                </CardContent>
              </Card>
            ) : (
              // The member's answers hold their ID number and safety data.
              // `data-os-private` blanks them in the desktop's last-seen copy
              // of this window, so they never sit in a background picture.
              member.profileSections.map((section) => (
                <Card key={section.title} data-os-private="">
                  <CardHeader>
                    <CardTitle className="text-base">{section.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <FieldGrid items={section.items} />
                  </CardContent>
                </Card>
              ))
            )}

            <MemberNotes
              userId={row.id}
              notes={detail.state === "loaded" ? detail.notes : []}
              onChange={(notes) =>
                setDetail((prev) =>
                  prev.state === "loaded" ? { ...prev, notes } : prev,
                )
              }
            />
          </div>

          {/* The action rail — decisions, rank and teams. */}
          <aside className="flex flex-col gap-6 page-lg:sticky page-lg:top-24">
            <Card className="border-accent/40">
              <CardHeader>
                <CardTitle className="text-base">Decision</CardTitle>
                <CardDescription>{member.approvalSummary}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {actionError && (
                  <p role="alert" className="text-sm text-destructive">
                    {actionError}
                  </p>
                )}
                {reviewOptions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
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
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No decision is open for this member.
                  </p>
                )}
                {refusals.map((refusal) => (
                  <p
                    key={refusal}
                    className="flex items-start gap-2 text-xs text-muted-foreground"
                  >
                    <ShieldAlert
                      aria-hidden
                      className="mt-px h-3.5 w-3.5 shrink-0"
                    />
                    <span>{refusal}</span>
                  </p>
                ))}
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Lock aria-hidden className="h-3.5 w-3.5 shrink-0" />
                  Every decision is logged to the audit trail.
                </p>
              </CardContent>
            </Card>

            {canAssignCaptain && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Captain rank</CardTitle>
                  <CardDescription>
                    They accept in their own app before it takes effect.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setAssignOpen(true)}
                  >
                    <Shield aria-hidden />
                    Assign captain rank
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Team assignment — the write path behind every team-scoped
                broadcast, questionnaire send and roster badge. */}
            <TeamAssignment
              userId={row.id}
              teams={teams}
              assignableTeams={assignableTeams}
              teamLabels={teamLabels}
              onChange={applyTeams}
            />
          </aside>

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
        </div>
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
          disabled={disabled}
          onClick={() => onChoose("approve")}
        >
          {busy ? <Spinner size="sm" /> : <Check aria-hidden />}
          Approve
        </Button>
      );
    case "reject":
      return (
        <Button
          type="button"
          variant="destructive"
          disabled={disabled}
          onClick={() => onChoose("reject")}
        >
          {from === "approved" && <UserX aria-hidden />}
          {from === "approved" ? "Remove from camp" : "Reject"}
        </Button>
      );
    case "reopen":
      return (
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => onChoose("reopen")}
        >
          <RotateCcw aria-hidden />
          Move back to pending
        </Button>
      );
  }
}
