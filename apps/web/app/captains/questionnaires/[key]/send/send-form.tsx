"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Search, Send, TriangleAlert, Undo2 } from "lucide-react";
import { Alert } from "@camp404/ui/components/alert";
import { Button } from "@camp404/ui/components/button";
import { Card } from "@camp404/ui/components/card";
import { Checkbox } from "@camp404/ui/components/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@camp404/ui/components/select";
import { Switch } from "@camp404/ui/components/switch";
import { toast } from "@camp404/ui/components/toast";
import {
  closeActivationAction,
  previewAudienceCount,
  sendAction,
} from "../../actions";

export interface MemberOption {
  id: string;
  label: string;
  sub: string;
}

/**
 * One entry in a picker: the value the send stores, and what a captain reads.
 * Structurally the `AudienceOption` that @camp404/db/camp-config builds — named
 * again here rather than imported because this island is bundled client-side
 * and that module pulls the DB driver.
 */
export interface AudienceOption {
  value: string;
  label: string;
}

type Scope = "everyone" | "team" | "team_leads" | "individual";

// This island used to own two label maps of its own: a SCOPE_LABEL, and a
// TEAM_LABEL hardcoding all eight founding names. Both are gone. The team half
// was a live bug the moment configurable-teams Phase 2 shipped — a captain's
// rename never reached this screen, and the picker enumerated the raw
// `Team.options` enum, so an ARCHIVED team was still offered as a send target.
// Both lists now arrive as props, built on the server from the camp config by
// `audienceLabel` (@camp404/db/camp-config), which is the one owner of the
// vocabulary. The island stays a client component and never imports the DB.

/**
 * The audience count line — the whole point of item 2.6, in one predicate.
 *
 *     showCount = count !== null && count !== undefined
 *
 * `null` HIDES the line (we don't know yet: still debouncing, an incomplete
 * audience, a refused scope). `0` SHOWS it — zero is precisely the moment the
 * author needs telling, because a team send with nobody on the team reaches
 * nobody and still toasts success. Treating 0 as falsy and hiding the line
 * would reproduce the silent failure this exists to fix.
 */
export function AudienceCount({
  count,
  noun = "member",
}: {
  count: number | null | undefined;
  noun?: string;
}) {
  const showCount = count !== null && count !== undefined;
  if (!showCount) return null;
  return (
    <p
      role="status"
      aria-live="polite"
      className={
        count === 0
          ? "text-sm font-medium text-warning"
          : "text-sm text-muted-foreground"
      }
    >
      {count === 0
        ? `Nobody matches this audience — this send would reach no ${noun}s.`
        : count === 1
          ? `This will reach 1 ${noun}.`
          : `This will reach ${count} ${noun}s.`}
    </p>
  );
}

// The Send/Activate screen (§6.4, functional/undrawn). Captain-only — the page
// gates clearance before rendering this. Opens an activation pinned to the
// published version and fans out the gates. The one-open invariant is surfaced
// up front: if a send is already open it must be closed before a new one.
export function SendForm({
  questionnaireKey,
  title,
  members,
  scopeOptions,
  teamOptions,
  openActivationId,
}: {
  questionnaireKey: string;
  title: string;
  members: MemberOption[];
  /** Every scope this screen offers, labelled by `audienceLabel`. */
  scopeOptions: AudienceOption[];
  /** ACTIVE teams only, in the camp's configured order, with config labels. */
  teamOptions: AudienceOption[];
  openActivationId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [scope, setScope] = useState<Scope>("everyone");
  const [team, setTeam] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [blocking, setBlocking] = useState(false);
  const [dueAtLocal, setDueAtLocal] = useState("");
  const [query, setQuery] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [audienceCount, setAudienceCount] = useState<number | null>(null);

  // The spec the preview is keyed on. Stringified so the effect below depends
  // on the VALUE, not on a fresh object identity every render.
  const specKey = JSON.stringify({
    scope,
    team: scope === "team" ? team || null : null,
    targetUserIds: scope === "individual" ? [...selected].sort() : [],
  });

  // 300 ms debounce: a captain ticking through a member list must not fan out
  // one query per checkbox. The `cancelled` flag drops the answer to a spec
  // that is no longer on screen, so a slow reply can never overwrite a newer
  // one. Clearing to `null` first hides the line while it is being recomputed,
  // rather than showing a stale count against the new audience.
  useEffect(() => {
    setAudienceCount(null);
    if (openActivationId) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const result = await previewAudienceCount(JSON.parse(specKey));
        if (cancelled) return;
        // A refusal (opt_in, an incomplete audience, a non-captain) leaves the
        // line hidden — `null`, never 0.
        setAudienceCount(result.ok ? result.count : null);
      })();
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [specKey, openActivationId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.label.toLowerCase().includes(q) || m.sub.toLowerCase().includes(q),
    );
  }, [members, query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
        toast.error(result.error);
        return;
      }
      toast.success("Sent to members");
      router.push(`/captains/questionnaires/${questionnaireKey}`);
    });
  }

  function attemptSend() {
    // Everyone + blocking takes over every member's screen — confirm it.
    if (scope === "everyone" && blocking) {
      setConfirmOpen(true);
      return;
    }
    doSend();
  }

  function closeCurrent() {
    if (!openActivationId) return;
    startTransition(async () => {
      const result = await closeActivationAction(
        openActivationId,
        questionnaireKey,
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Send closed");
      router.refresh();
    });
  }

  const canSubmit =
    !pending &&
    (scope !== "team" || team !== "") &&
    (scope !== "individual" || selected.size > 0);

  if (openActivationId) {
    return (
      <Card className="flex flex-col gap-4 p-4">
        <Alert variant="warning">
          <TriangleAlert aria-hidden />
          <span>
            “{title}” is already sent. Close the current send before sending it
            again with new settings.
          </span>
        </Alert>
        <div className="flex gap-2">
          <Button type="button" onClick={closeCurrent} disabled={pending}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Undo2 className="size-4" />
            )}
            Close current send
          </Button>
          <Button asChild variant="outline">
            <Link href={`/captains/questionnaires/${questionnaireKey}`}>
              Back to editor
            </Link>
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-5 p-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="send-scope">Who should answer “{title}”?</Label>
        <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
          <SelectTrigger id="send-scope">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {scopeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {scope === "team" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="send-team">Which team?</Label>
          <Select value={team} onValueChange={setTeam}>
            <SelectTrigger id="send-team">
              <SelectValue placeholder="Pick a team" />
            </SelectTrigger>
            <SelectContent>
              {teamOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {scope === "individual" && (
        <div className="flex flex-col gap-2">
          <Label>Choose members ({selected.size} selected)</Label>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3">
            <Search aria-hidden className="size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              placeholder="Search members"
              aria-label="Search members"
              className="border-0 bg-transparent px-0 focus-visible:ring-0"
            />
          </div>
          <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-lg border border-border p-1">
            {filtered.length === 0 ? (
              <li className="px-2 py-3 text-center text-sm text-muted-foreground">
                No members match “{query}”.
              </li>
            ) : (
              filtered.map((m) => (
                <li key={m.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted">
                    <Checkbox
                      checked={selected.has(m.id)}
                      onCheckedChange={() => toggle(m.id)}
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

      <AudienceCount count={audienceCount} />

      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <Label htmlFor="send-blocking">Blocking</Label>
          <span className="text-xs text-muted-foreground">
            Members must answer before they can use the rest of the app.
          </span>
        </div>
        <Switch
          id="send-blocking"
          checked={blocking}
          onCheckedChange={setBlocking}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="send-due">Due date (optional)</Label>
        <Input
          id="send-due"
          type="datetime-local"
          value={dueAtLocal}
          onChange={(e) => setDueAtLocal(e.currentTarget.value)}
        />
      </div>

      <div className="flex gap-2">
        <Button type="button" onClick={attemptSend} disabled={!canSubmit}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          Send
        </Button>
        <Button asChild variant="outline">
          <Link href={`/captains/questionnaires/${questionnaireKey}`}>
            Cancel
          </Link>
        </Button>
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
    </Card>
  );
}
