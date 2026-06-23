"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Search, Send, TriangleAlert, Undo2 } from "lucide-react";
import { Team } from "@camp404/types";
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
import { closeActivationAction, sendAction } from "../../actions";

export interface MemberOption {
  id: string;
  label: string;
  sub: string;
}

type Scope = "everyone" | "team" | "team_leads" | "individual";

const SCOPE_LABEL: Record<Scope, string> = {
  everyone: "Everyone",
  team: "A team",
  team_leads: "Team leads",
  individual: "Specific members",
};

const TEAM_LABEL: Record<string, string> = {
  kitchen: "Kitchen",
  structures: "Structures",
  power_and_lighting: "Power & lighting",
  sanitation_and_water: "Sanitation & water",
  health_and_safety: "Health & safety",
  art_and_activities: "Art & activities",
  ministry_of_memes: "Ministry of memes",
  ministry_of_vibes: "Ministry of vibes",
};

// The Send/Activate screen (§6.4, functional/undrawn). Captain-only — the page
// gates clearance before rendering this. Opens an activation pinned to the
// published version and fans out the gates. The one-open invariant is surfaced
// up front: if a send is already open it must be closed before a new one.
export function SendForm({
  questionnaireKey,
  title,
  members,
  openActivationId,
}: {
  questionnaireKey: string;
  title: string;
  members: MemberOption[];
  openActivationId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [scope, setScope] = useState<Scope>("everyone");
  const [team, setTeam] = useState<Team | "">("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [blocking, setBlocking] = useState(false);
  const [dueAtLocal, setDueAtLocal] = useState("");
  const [query, setQuery] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

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
            {(Object.keys(SCOPE_LABEL) as Scope[]).map((s) => (
              <SelectItem key={s} value={s}>
                {SCOPE_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {scope === "team" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="send-team">Which team?</Label>
          <Select value={team} onValueChange={(v) => setTeam(v as Team)}>
            <SelectTrigger id="send-team">
              <SelectValue placeholder="Pick a team" />
            </SelectTrigger>
            <SelectContent>
              {Team.options.map((t) => (
                <SelectItem key={t} value={t}>
                  {TEAM_LABEL[t] ?? t}
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
