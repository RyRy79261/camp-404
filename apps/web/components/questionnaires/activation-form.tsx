"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  Loader2,
  Search,
  Send,
  ShieldCheck,
  Tent,
  TriangleAlert,
  Undo2,
  UserCheck,
  Users,
} from "lucide-react";
import { Alert } from "@camp404/ui/components/alert";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { Checkbox } from "@camp404/ui/components/checkbox";
import { useConfirm } from "@camp404/ui/components/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@camp404/ui/components/dialog";
import { Input } from "@camp404/ui/components/input";
import { Label } from "@camp404/ui/components/label";
import { Switch } from "@camp404/ui/components/switch";
import { toast } from "@camp404/ui/components/toast";
import { cn } from "@camp404/ui/lib/utils";
import { BlockingBadge } from "@/components/questionnaire/blocking-chrome";
import {
  closeActivationAction,
  previewAudienceCount,
  sendAction,
} from "@/app/(console)/captains/questionnaires/actions";
import { CLOSE_SEND_CONFIRM } from "@/app/(console)/captains/questionnaires/[key]/lifecycle-controls";

// The send screen's form, from AfrikaBurn's organiser console
// (apps/org/components/questionnaire/activation-form.tsx): an Audience card of
// mode cards with a live count of who it reaches, a Delivery card for blocking
// and the due date, and the Send row.
//
// The audiences are Camp 404's: everyone, a team, the team leads, or members
// picked by name. `opt_in` has no send path (openActivation refuses it), so it
// is not offered. A team lead is offered only a team, and only the teams they
// lead; the page narrows the options and `sendAction` checks the rule again.

/** A member the individual picker offers. */
export interface MemberOption {
  id: string;
  label: string;
  sub: string;
}

/**
 * One entry in a picker: the value the send stores, and what a captain reads.
 * Structurally the `AudienceOption` that @camp404/db/camp-config builds — named
 * again here because this island is bundled client-side and that module pulls
 * the DB driver.
 */
export interface AudienceOption {
  value: string;
  label: string;
}

export type SendScope = "everyone" | "team" | "team_leads" | "individual";

const SCOPES: readonly SendScope[] = [
  "everyone",
  "team",
  "team_leads",
  "individual",
];

function isSendScope(value: string): value is SendScope {
  return (SCOPES as readonly string[]).includes(value);
}

/** The icon and caption on each audience card. */
const SCOPE_CARD: Record<
  SendScope,
  { icon: React.ReactNode; caption: string; leadCaption?: string }
> = {
  everyone: {
    icon: <Tent className="h-4 w-4" aria-hidden />,
    caption: "Every approved member of the camp.",
  },
  team: {
    icon: <Users className="h-4 w-4" aria-hidden />,
    caption: "Everyone on one team this year.",
    leadCaption: "Everyone on a team you lead.",
  },
  team_leads: {
    icon: <ShieldCheck className="h-4 w-4" aria-hidden />,
    caption: "Everyone who leads a team this year.",
  },
  individual: {
    icon: <UserCheck className="h-4 w-4" aria-hidden />,
    caption: "Members you pick by name.",
  },
};

/** The audience a send is aimed at, as the form holds it. */
export interface AudienceChoice {
  scope: SendScope;
  team?: string | null;
}

/**
 * Why a send cannot go yet, as the sentence the captain reads, or null when it
 * can. The Send button stays enabled and says this on press: a greyed-out
 * button gives no reason, and the missing choice (a team, a member) can be out
 * of view.
 */
export function sendRefusal(input: {
  scope: string;
  team: string;
  selectedCount: number;
}): string | null {
  if (input.scope === "team" && input.team === "") {
    return "Pick a team to send this to.";
  }
  if (input.scope === "individual" && input.selectedCount === 0) {
    return "Pick at least one member to send this to.";
  }
  return null;
}

export interface ActivationFormProps {
  questionnaireKey: string;
  title: string;
  members: MemberOption[];
  /** Every scope this screen offers, labelled by `audienceLabel`. */
  scopeOptions: AudienceOption[];
  /** ACTIVE teams only, in the camp's configured order, with config labels. */
  teamOptions: AudienceOption[];
  openActivationId: string | null;
  /**
   * A team lead's view: closing a send is captain-only, so a lead is told who
   * can, and the way back is the hub.
   */
  asLead?: boolean;
  /** The year a send made now is filed under, as a captain reads it. */
  yearLabel?: string | null;
  /** Pre-filled choices (from the query string). The author still confirms. */
  initialAudience?: AudienceChoice | null;
  initialBlocking?: boolean;
  /** A `datetime-local` value. */
  initialDueAt?: string;
}

export function ActivationForm({
  questionnaireKey,
  title,
  members,
  scopeOptions,
  teamOptions,
  openActivationId,
  asLead = false,
  yearLabel,
  initialAudience,
  initialBlocking,
  initialDueAt,
}: ActivationFormProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [confirm, confirmDialog] = useConfirm();

  const offered = scopeOptions.map((o) => o.value).filter(isSendScope);
  const [scope, setScope] = React.useState<SendScope>(() =>
    initialAudience && offered.includes(initialAudience.scope)
      ? initialAudience.scope
      : (offered[0] ?? "everyone"),
  );
  const [team, setTeam] = React.useState<string>(() => {
    const wanted = initialAudience?.team ?? "";
    return teamOptions.some((t) => t.value === wanted) ? wanted : "";
  });
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [blocking, setBlocking] = React.useState(initialBlocking ?? false);
  const [dueAtLocal, setDueAtLocal] = React.useState(initialDueAt ?? "");
  const [query, setQuery] = React.useState("");
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  // Starts "resolving": the first count is on its way the moment the form
  // opens on a complete audience.
  const [preview, setPreview] = React.useState<PreviewState>({
    loading: true,
    count: null,
    error: null,
  });

  // The spec the preview is keyed on, or "" when the audience is incomplete.
  // A string, so the effect below depends on the VALUE, not a fresh object.
  const incomplete = sendRefusal({
    scope,
    team,
    selectedCount: selected.size,
  });
  const specKey = incomplete
    ? ""
    : JSON.stringify({
        scope,
        team: scope === "team" ? team : null,
        targetUserIds: scope === "individual" ? [...selected].sort() : [],
      });

  // LIVE count of who this reaches, computed on the server by the same gate
  // and resolver the send uses. Debounced 300 ms so ticking through a member
  // list does not fan out a query per checkbox; `cancelled` drops the answer
  // to a spec no longer on screen. An incomplete audience asks nothing of the
  // server, and nor does the locked "close the current send" state.
  React.useEffect(() => {
    if (openActivationId) return;
    if (!specKey) {
      setPreview({ loading: false, count: null, error: null });
      return;
    }
    let cancelled = false;
    setPreview({ loading: true, count: null, error: null });
    const timer = setTimeout(() => {
      void (async () => {
        const result = await previewAudienceCount(JSON.parse(specKey));
        if (cancelled) return;
        setPreview(
          result.ok
            ? { loading: false, count: result.count, error: null }
            : { loading: false, count: null, error: result.error },
        );
      })();
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [specKey, openActivationId]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.label.toLowerCase().includes(q) || m.sub.toLowerCase().includes(q),
    );
  }, [members, query]);

  function toggleMember(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const backHref = asLead
    ? ("/captains/questionnaires" as const)
    : (`/captains/questionnaires/${questionnaireKey}` as const);

  function doSend() {
    setConfirmOpen(false);
    startTransition(async () => {
      const result = await sendAction(questionnaireKey, {
        scope,
        team: scope === "team" ? team || undefined : undefined,
        blocking,
        // datetime-local is wall-clock; Date converts it to a real instant (ISO).
        dueAt: dueAtLocal ? new Date(dueAtLocal).toISOString() : undefined,
        targetUserIds: scope === "individual" ? [...selected] : undefined,
      });
      if (!result.ok) {
        toast.error("Could not send", { description: result.error });
        return;
      }
      toast.success("Sent to members");
      router.push(backHref);
    });
  }

  function attemptSend() {
    if (incomplete) {
      toast.error(incomplete);
      return;
    }
    // Everyone + blocking takes over every member's screen — confirm it.
    if (scope === "everyone" && blocking) {
      setConfirmOpen(true);
      return;
    }
    doSend();
  }

  async function closeCurrent() {
    if (!openActivationId) return;
    // Closing expires every unanswered gate, so it asks first, like the
    // editor's Close send.
    if (!(await confirm(CLOSE_SEND_CONFIRM))) return;
    startTransition(async () => {
      const result = await closeActivationAction(
        openActivationId,
        questionnaireKey,
      );
      if (!result.ok) {
        toast.error("Could not close", { description: result.error });
        return;
      }
      toast.success("Send closed");
      router.refresh();
    });
  }

  if (openActivationId) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          {confirmDialog}
          <Alert variant="warning">
            <TriangleAlert aria-hidden />
            <span>
              {asLead
                ? `“${title}” is already sent. A captain can close that send so it can go out again.`
                : `“${title}” is already sent. Close the current send before sending it again with new settings.`}
            </span>
          </Alert>
          <div className="flex flex-wrap gap-2">
            {!asLead && (
              <Button
                type="button"
                onClick={() => void closeCurrent()}
                disabled={pending}
              >
                {pending ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Undo2 aria-hidden />
                )}
                Close current send
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href={backHref}>
                {asLead ? "Back to questionnaires" : "Back to editor"}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Audience</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <RadioCardGroup
            aria-label={`Who should answer “${title}”?`}
            className={cn(
              "grid gap-3",
              scopeOptions.length > 1 && "sm:grid-cols-2",
              scopeOptions.length > 2 && "lg:grid-cols-4",
            )}
            value={scope}
            onValueChange={(v) => {
              if (isSendScope(v)) setScope(v);
            }}
            options={scopeOptions.filter((o) => isSendScope(o.value))}
            render={(option, active) => {
              const card = SCOPE_CARD[option.value as SendScope];
              return (
                <AudienceModeCard
                  active={active}
                  icon={card.icon}
                  title={option.label}
                  caption={(asLead && card.leadCaption) || card.caption}
                />
              );
            }}
          />

          {scope === "team" && (
            <div className="flex flex-col gap-2">
              <span id="send-team-label" className="text-sm font-medium">
                Which team?
              </span>
              {teamOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  There are no active teams to send to.
                </p>
              ) : (
                <RadioCardGroup
                  aria-labelledby="send-team-label"
                  className="flex flex-wrap gap-2"
                  itemClassName="rounded-full"
                  value={team}
                  onValueChange={setTeam}
                  options={teamOptions}
                  render={(option, active) => (
                    <Chip active={active} label={option.label} />
                  )}
                />
              )}
            </div>
          )}

          {scope === "individual" && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">
                Choose members ({selected.size} selected)
              </span>
              <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3">
                <Search aria-hidden className="h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.currentTarget.value)}
                  placeholder="Search members"
                  aria-label="Search members"
                  className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                />
              </div>
              <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-md border border-border p-1">
                {filtered.length === 0 ? (
                  <li className="px-2 py-3 text-center text-sm text-muted-foreground">
                    No members match “{query}”.
                  </li>
                ) : (
                  filtered.map((m) => (
                    <li key={m.id}>
                      <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted">
                        <Checkbox
                          checked={selected.has(m.id)}
                          onCheckedChange={() => toggleMember(m.id)}
                          aria-label={m.label}
                        />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-sm font-medium">
                            {m.label}
                          </span>
                          {m.sub && (
                            <span className="truncate text-xs text-muted-foreground">
                              {m.sub}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}

          <AudiencePreview
            preview={preview}
            prompt={incomplete ? promptFor(scope) : null}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delivery</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="send-blocking">Blocking</Label>
              <p
                id="send-blocking-help"
                className="max-w-md text-xs text-muted-foreground"
              >
                A blocking questionnaire is a hard gate — members can do nothing
                else in the app until they answer. Leave it off and it waits in
                their inbox instead.
              </p>
            </div>
            <Switch
              id="send-blocking"
              aria-describedby="send-blocking-help"
              className="mt-1"
              checked={blocking}
              onCheckedChange={setBlocking}
            />
          </div>

          <div>
            <BlockingBadge blocking={blocking} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="send-due">Due date (optional)</Label>
            <Input
              id="send-due"
              type="datetime-local"
              className="max-w-xs"
              value={dueAtLocal}
              onChange={(e) => setDueAtLocal(e.currentTarget.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Sending asks everyone this audience matches now, and anyone who joins
          it while the send is open
          {yearLabel ? `, for ${yearLabel}` : ""}.
        </p>
        <div className="flex shrink-0 justify-end gap-2">
          <Button asChild variant="outline">
            <Link href={backHref}>Cancel</Link>
          </Button>
          <Button type="button" onClick={attemptSend} disabled={pending}>
            {pending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Send aria-hidden />
            )}
            {pending ? "Sending…" : "Send questionnaire"}
          </Button>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Block everyone in camp?</DialogTitle>
            <DialogDescription>
              A blocking send to everyone takes over every member’s screen until
              they answer “{title}”. Send it to the whole camp?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={doSend} disabled={pending}>
              Send to everyone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function promptFor(scope: SendScope): string {
  if (scope === "team") return "Pick a team to see how many people it reaches.";
  if (scope === "individual") {
    return "Pick members to see how many people it reaches.";
  }
  return "Pick an audience to see how many people it reaches.";
}

/**
 * A single choice drawn as cards or chips: radiogroup semantics with one tab
 * stop and arrow keys, which AfrikaBurn's pressed buttons did not have.
 */
function RadioCardGroup({
  options,
  value,
  onValueChange,
  render,
  className,
  itemClassName = "rounded-lg",
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: {
  options: readonly AudienceOption[];
  value: string;
  onValueChange: (value: string) => void;
  render: (option: AudienceOption, active: boolean) => React.ReactNode;
  className?: string;
  /** The item's shape, so its focus ring follows the card or chip. */
  itemClassName?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = options.findIndex((o) => o.value === value);

  function select(index: number) {
    const target = (index + options.length) % options.length;
    const next = options[target];
    if (!next) return;
    onValueChange(next.value);
    refs.current[target]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      select(index + 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      select(index - 1);
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className={className}
    >
      {options.map((option, i) => {
        const active = option.value === value;
        const tabbable = active || (selectedIndex === -1 && i === 0);
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={tabbable ? 0 : -1}
            onClick={() => select(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              itemClassName,
            )}
          >
            {render(option, active)}
          </button>
        );
      })}
    </div>
  );
}

function AudienceModeCard({
  active,
  icon,
  title,
  caption,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  caption: string;
}) {
  return (
    <span
      className={cn(
        "flex h-full flex-col gap-1.5 rounded-lg border p-4 text-left transition-colors",
        active
          ? "border-accent bg-accent/10"
          : "border-input bg-background hover:bg-muted",
      )}
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
        {active && (
          <Check className="ml-auto h-4 w-4 text-accent" aria-hidden />
        )}
      </span>
      <span className="text-xs text-muted-foreground">{caption}</span>
    </span>
  );
}

function Chip({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
        active
          ? "border-accent bg-accent/10 text-foreground"
          : "border-input bg-background text-muted-foreground hover:bg-muted",
      )}
    >
      {active && <Check className="h-3.5 w-3.5 text-accent" aria-hidden />}
      {label}
    </span>
  );
}

interface PreviewState {
  loading: boolean;
  count: number | null;
  error: string | null;
}

/**
 * Who the send reaches, right now. Zero is SHOWN, as a warning: a team with
 * nobody on it resolves to nobody, and the send would still report success.
 * A refusal shows the server's reason rather than a number.
 */
function AudiencePreview({
  preview,
  prompt,
}: {
  preview: PreviewState;
  /** Set while the audience is incomplete: what to pick first. */
  prompt: string | null;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2.5 text-sm"
    >
      {prompt ? (
        <span className="text-muted-foreground">{prompt}</span>
      ) : preview.loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden />
          <span className="text-muted-foreground">Resolving audience…</span>
        </>
      ) : preview.error ? (
        <span className="text-destructive">{preview.error}</span>
      ) : preview.count === 0 ? (
        <>
          <TriangleAlert className="h-4 w-4 text-warning" aria-hidden />
          <span className="font-medium text-warning">
            Nobody matches this audience — this send would reach no members.
          </span>
        </>
      ) : preview.count !== null ? (
        <>
          <Users className="h-4 w-4 text-accent" aria-hidden />
          <span>
            <span className="font-semibold tabular-nums">{preview.count}</span>{" "}
            {preview.count === 1 ? "member" : "members"} will receive this right
            now.
          </span>
        </>
      ) : (
        <span className="text-muted-foreground">
          Working out how many people this reaches.
        </span>
      )}
    </div>
  );
}
