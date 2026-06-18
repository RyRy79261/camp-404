"use client";

import { useActionState, useEffect, useState } from "react";
import {
  CircleCheck,
  Copy,
  Info,
  Loader2,
  Shield,
  ShieldCheck,
  Shuffle,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Alert } from "@camp404/ui/components/alert";
import { Button } from "@camp404/ui/components/button";
import { Checkbox } from "@camp404/ui/components/checkbox";
import { CodeDisplay } from "@camp404/ui/components/code-display";
import { Input } from "@camp404/ui/components/input";
import { Label } from "@camp404/ui/components/label";
import { Textarea } from "@camp404/ui/components/textarea";
import {
  CODE_RULES_HINT,
  generateInviteCode,
  isSyntacticallyValidCode,
} from "@/lib/invite-words";
import { createInviteAction, type CreateInviteResult } from "./actions";
import { AvailabilityHint } from "./availability-hint";
import { Stepper } from "./stepper";
import type { Availability } from "./types";

export function InviteForm({ isCaptain }: { isCaptain: boolean }) {
  const [code, setCode] = useState<string>(() => generateInviteCode());
  const [availability, setAvailability] = useState<Availability>({
    state: "idle",
  });
  // Captain-only knobs. Pre-approve waves the redeemer straight in (skip
  // vetting); maxUses lets a captain hand one code to several people.
  const [preApprove, setPreApprove] = useState(false);
  const [maxUses, setMaxUses] = useState("1");

  const [result, formAction, isPending] = useActionState<
    CreateInviteResult | null,
    FormData
  >(createInviteAction, null);

  // GitHub-style availability check: debounce 350ms after the user
  // stops typing, then GET /api/tools/invite/check.
  useEffect(() => {
    if (!code) {
      setAvailability({ state: "idle" });
      return;
    }
    if (!isSyntacticallyValidCode(code)) {
      setAvailability({ state: "invalid", hint: CODE_RULES_HINT });
      return;
    }
    setAvailability({ state: "checking" });
    const ctrl = new AbortController();
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/tools/invite/check?code=${encodeURIComponent(code)}`,
          { signal: ctrl.signal },
        );
        const body = (await res.json()) as {
          available: boolean;
          reason?: string;
          hint?: string;
        };
        if (body.available) setAvailability({ state: "available" });
        else if (body.reason === "taken") setAvailability({ state: "taken" });
        else if (body.reason === "invalid")
          setAvailability({
            state: "invalid",
            hint: body.hint ?? CODE_RULES_HINT,
          });
        else setAvailability({ state: "idle" });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setAvailability({ state: "idle" });
      }
    }, 350);
    return () => {
      ctrl.abort();
      clearTimeout(handle);
    };
  }, [code]);

  if (result?.ok) {
    return (
      <SuccessPanel
        code={result.code}
        recipientName={result.recipientName}
        maxUses={result.maxUses}
        requiresApproval={result.requiresApproval}
      />
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-[18px]">
      <h1 className="text-2xl font-bold text-foreground">Invite a member</h1>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="note">Who&apos;s this for? (optional)</Label>
        <Textarea
          id="note"
          name="note"
          rows={3}
          placeholder="Sara — kitchen lead from last burn, great with sourdough."
        />
      </div>

      {isCaptain ? (
        <CaptainOptions
          preApprove={preApprove}
          onPreApproveChange={setPreApprove}
          maxUses={maxUses}
          onMaxUsesChange={setMaxUses}
        />
      ) : (
        // Board S14 draws this as a quiet muted note (fill:$muted), not an
        // accent Alert — keeps it tonally distinct from Captain options.
        <div className="flex items-start gap-2.5 rounded-xl bg-muted p-3.5 text-label text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            Anyone who signs up with this code will need a captain&apos;s
            approval before they can use the app.
          </span>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code">Invite code</Label>
        <div className="flex gap-2.5">
          <Input
            id="code"
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toLowerCase())}
            spellCheck={false}
            autoComplete="off"
            required
            className="font-mono"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Generate a new silly code"
            onClick={() => setCode(generateInviteCode())}
          >
            <Shuffle />
          </Button>
        </div>
        <AvailabilityHint availability={availability} code={code} />
      </div>

      {result && !result.ok && (
        <Alert variant="error">
          <TriangleAlert />
          <span>{result.error}</span>
        </Alert>
      )}

      <Button
        type="submit"
        // Block in-flight / failed checks; idle stays enabled (impl-plan gating
        // matrix) and the required code input guards the empty case natively.
        disabled={
          isPending ||
          availability.state === "checking" ||
          availability.state === "taken" ||
          availability.state === "invalid"
        }
        className="w-full"
      >
        {isPending ? (
          <>
            <Loader2 className="animate-spin" /> Creating…
          </>
        ) : (
          "Create invite"
        )}
      </Button>
    </form>
  );
}

/** Captain-only invite controls: pre-approve toggle + multi-use cap. */
function CaptainOptions({
  preApprove,
  onPreApproveChange,
  maxUses,
  onMaxUsesChange,
}: {
  preApprove: boolean;
  onPreApproveChange: (v: boolean) => void;
  maxUses: string;
  onMaxUsesChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3.5 rounded-xl border border-border bg-accent/15 p-4">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-accent" aria-hidden />
        <span className="text-label font-bold text-accent">Captain options</span>
      </div>

      <div className="flex items-start gap-2.5">
        <Checkbox
          id="preApprove"
          name="preApprove"
          checked={preApprove}
          onCheckedChange={(v) => onPreApproveChange(v === true)}
          className="mt-0.5"
        />
        <div className="flex flex-col gap-1">
          <Label htmlFor="preApprove" className="font-normal">
            Pre-approve whoever signs up
          </Label>
          <p className="text-xs text-muted-foreground">
            {preApprove
              ? "They get straight in after onboarding — no captain review."
              : "Leave unticked and a captain must approve them before access."}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="maxUses">How many people can use this code</Label>
        <Stepper
          id="maxUses"
          name="maxUses"
          value={maxUses}
          onChange={onMaxUsesChange}
          min={1}
          max={100}
        />
        <p className="text-xs text-muted-foreground">
          {Number(maxUses) > 1
            ? `Up to ${maxUses} people can sign up with this code.`
            : "Single-use — once someone signs up, the code is spent."}
        </p>
      </div>
    </div>
  );
}

function SuccessPanel({
  code,
  recipientName,
  maxUses,
  requiresApproval,
}: {
  code: string;
  recipientName: string | null;
  maxUses: number;
  requiresApproval: boolean;
}) {
  const [copied, setCopied] = useState(false);

  // Flip "Copied" back after a beat; clear the timer on unmount so a fast
  // navigate-away can't setState on an unmounted component.
  useEffect(() => {
    if (!copied) return;
    const handle = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(handle);
  }, [copied]);

  const usesLine =
    maxUses === 1
      ? "Can be used by 1 person."
      : `Can be used by ${maxUses} people.`;
  const approvalLine = requiresApproval
    ? "They'll need a captain's approval before they get access."
    : "They'll be pre-approved — no captain sign-off needed.";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2.5">
        <CircleCheck className="h-5 w-5 text-success" aria-hidden />
        <h2 className="text-lg font-bold text-foreground">Invite ready</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        {recipientName
          ? `Share this code with ${recipientName}.`
          : "Share this code with whoever you’re inviting."}
      </p>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="h-4 w-4 shrink-0" aria-hidden />
          <span>{usesLine}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
          <span>{approvalLine}</span>
        </div>
      </div>

      <CodeDisplay
        code={code}
        className="flex h-12 w-full justify-center border-border bg-muted text-base"
      />

      <div className="flex flex-col gap-2.5 pt-1">
        <Button
          type="button"
          className="w-full"
          onClick={async () => {
            await navigator.clipboard.writeText(code);
            setCopied(true);
          }}
        >
          <Copy /> {copied ? "Copied" : "Copy"}
        </Button>
        <Button asChild variant="outline" className="w-full">
          <a href="/tools/invite">Send another</a>
        </Button>
      </div>
    </div>
  );
}
