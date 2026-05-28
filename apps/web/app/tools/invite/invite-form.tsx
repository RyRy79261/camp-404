"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, Copy, Loader2, Shuffle, X } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { Input } from "@camp404/ui/components/input";
import { Label } from "@camp404/ui/components/label";
import { Textarea } from "@camp404/ui/components/textarea";
import {
  generateInviteCode,
  isSyntacticallyValidCode,
} from "@/lib/invite-words";
import { createInviteAction, type CreateInviteResult } from "./actions";

type Availability =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available" }
  | { state: "taken" }
  | { state: "invalid"; hint: string };

export function InviteForm() {
  const [code, setCode] = useState<string>(() => generateInviteCode());
  const [availability, setAvailability] = useState<Availability>({
    state: "idle",
  });

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
      setAvailability({
        state: "invalid",
        hint: "3–48 chars, lowercase letters / digits / hyphens.",
      });
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
        else if (body.reason === "taken")
          setAvailability({ state: "taken" });
        else if (body.reason === "invalid")
          setAvailability({
            state: "invalid",
            hint: body.hint ?? "Invalid code.",
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
    return <SuccessPanel code={result.code} email={result.invitedEmail} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite a member</CardTitle>
        <CardDescription>
          Mint a single-use code that lets one person sign up for Camp 404.
          Codes are recorded against your account so the family tree picks up
          who you brought on.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">Their email address</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="off"
              placeholder="sara@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">Why you're inviting them (optional)</Label>
            <Textarea
              id="note"
              name="note"
              rows={3}
              placeholder="Kitchen lead from last burn; great with sourdough."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="code">Invite code</Label>
            <div className="flex gap-2">
              <Input
                id="code"
                name="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toLowerCase())}
                spellCheck={false}
                autoComplete="off"
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
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {result.error}
            </p>
          )}

          <Button
            type="submit"
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
      </CardContent>
    </Card>
  );
}

function AvailabilityHint({
  availability,
  code,
}: {
  availability: Availability;
  code: string;
}) {
  if (!code) return null;
  if (availability.state === "checking") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking availability…
      </p>
    );
  }
  if (availability.state === "available") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
        <Check className="h-3 w-3" />{" "}
        <span>
          <span className="font-mono">{code}</span> is available.
        </span>
      </p>
    );
  }
  if (availability.state === "taken") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-destructive">
        <X className="h-3 w-3" />{" "}
        <span>
          <span className="font-mono">{code}</span> is already taken — pick another.
        </span>
      </p>
    );
  }
  if (availability.state === "invalid") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-destructive">
        <X className="h-3 w-3" /> {availability.hint}
      </p>
    );
  }
  return null;
}

function SuccessPanel({ code, email }: { code: string; email: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite ready</CardTitle>
        <CardDescription>
          Share this code with {email}. It's single-use — once they sign up
          with it, nobody else can.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 p-3 font-mono text-lg">
          <span>{code}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            <Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <Button asChild variant="outline" className="w-full">
          <a href="/tools/invite">Send another</a>
        </Button>
      </CardContent>
    </Card>
  );
}
