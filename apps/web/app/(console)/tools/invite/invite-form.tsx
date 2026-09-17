"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  CircleCheck,
  Copy,
  Info,
  Loader2,
  Shield,
  ShieldCheck,
  Shuffle,
  TriangleAlert,
  UserPlus,
  Users,
} from "lucide-react";
import { Alert } from "@camp404/ui/components/alert";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@camp404/ui/components/card";
import { Checkbox } from "@camp404/ui/components/checkbox";
import { CodeDisplay } from "@camp404/ui/components/code-display";
import { Input } from "@camp404/ui/components/input";
import { Label } from "@camp404/ui/components/label";
import {
  CODE_RULES_HINT,
  generateInviteCode,
  isSyntacticallyValidCode,
} from "@/lib/invite-words";
import { createInviteAction, type CreateInviteResult } from "./actions";
import { AvailabilityHint } from "./availability-hint";
import { NumberStepper } from "./number-stepper";
import type { Availability } from "./types";

export function InviteForm({ isCaptain }: { isCaptain: boolean }) {
  // Start empty and generate the code after mount: the generator is random, so
  // running it in the initializer produces a different code on the server than
  // on the client and trips a hydration mismatch on the input value.
  const [code, setCode] = useState<string>("");
  useEffect(() => {
    setCode(generateInviteCode());
  }, []);
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

  // Someone else saved this code after the live check said it was free. Show
  // it as taken until the code changes, so the button cannot resend it.
  const shownAvailability: Availability =
    result && !result.ok && result.taken === code
      ? { state: "taken" }
      : availability;

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
    <Card>
      <CardHeader>
        <h2 className="flex items-center gap-2 text-base font-semibold normal-case leading-none tracking-normal">
          <UserPlus className="h-4 w-4 text-accent" aria-hidden />
          New invite code
        </h2>
        <CardDescription>
          Pick a code, or shuffle for a silly one, then share it with them.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="code">Invite code</Label>
            <div className="flex gap-2">
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
                className="shrink-0"
                aria-label="Generate a new silly code"
                onClick={() => setCode(generateInviteCode())}
              >
                <Shuffle aria-hidden />
              </Button>
            </div>
            <AvailabilityHint availability={shownAvailability} code={code} />
          </div>

          {/* The owner chose a one-line name over a "why you're inviting them"
              note (ba8a003): the code is what matters, and the name only helps
              a captain place the person. */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="note">Name (optional)</Label>
            <Input
              id="note"
              name="note"
              autoComplete="off"
              placeholder="Sara"
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
            // A quiet muted note, tonally distinct from the captain options.
            <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                Anyone who signs up with this code will need a captain&apos;s
                approval before they can use the app.
              </span>
            </div>
          )}

          {result && !result.ok && (
            <Alert variant="error">
              <TriangleAlert aria-hidden />
              <span>{result.error}</span>
            </Alert>
          )}

          <Button
            type="submit"
            // Block in-flight / failed checks; idle stays enabled (impl-plan
            // gating matrix) and the required code input guards the empty case
            // natively.
            disabled={
              isPending ||
              shownAvailability.state === "checking" ||
              shownAvailability.state === "taken" ||
              shownAvailability.state === "invalid"
            }
            className="w-full"
          >
            {isPending ? (
              <>
                <Loader2 className="animate-spin" aria-hidden /> Creating…
              </>
            ) : (
              "Create invite"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
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
    <div className="flex flex-col gap-4 rounded-lg border border-accent/50 bg-accent/10 p-4">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-accent" aria-hidden />
        <span className="text-sm font-semibold text-accent">
          Captain options
        </span>
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
        <NumberStepper
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
  const [copyFailed, setCopyFailed] = useState(false);
  // The form the member was in is gone. Move focus to the result, so a
  // keyboard or screen-reader user lands on "Invite ready".
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

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
    <Card className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CircleCheck className="h-5 w-5 text-success" aria-hidden />
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-base font-semibold normal-case leading-none tracking-normal outline-none"
          >
            Invite ready
          </h2>
        </div>
        <CardDescription>
          {recipientName
            ? `Share this code with ${recipientName}.`
            : "Share this code with whoever you’re inviting."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <CodeDisplay
          code={code}
          className="flex h-12 w-full justify-center border-border bg-muted text-base"
        />

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

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            className="w-full"
            onClick={async () => {
              // Clipboard access can be denied (permissions policy, insecure
              // context, iOS quirks) — fall back to pointing at the visible code
              // instead of letting the rejection vanish into the void.
              try {
                await navigator.clipboard.writeText(code);
                setCopied(true);
                setCopyFailed(false);
              } catch {
                // A failed retry inside the success timeout must not show
                // "Copied" and the failure hint at the same time.
                setCopied(false);
                setCopyFailed(true);
              }
            }}
          >
            <Copy aria-hidden /> {copied ? "Copied" : "Copy"}
          </Button>
          {copyFailed && (
            <p
              className="text-center text-xs text-muted-foreground"
              role="status"
            >
              Couldn&apos;t copy automatically — select the code above and copy
              it by hand.
            </p>
          )}
          <Button asChild variant="outline" className="w-full">
            <a href="/tools/invite">Send another</a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
