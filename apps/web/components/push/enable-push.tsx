"use client";

import { useEffect, useState } from "react";
import { onMessage } from "firebase/messaging";
import { z } from "zod";
import { Button } from "@camp404/ui/components/button";
import { Spinner } from "@camp404/ui/components/spinner";
import { getMessagingIfSupported } from "@/lib/firebase-client";
import { registerDeviceToken } from "./device-token";

// Web push opt-in, mounted on the authenticated home control panel (so it never
// prompts signed-out visitors). Web-only and best-effort: when permission is
// already granted it silently registers/refreshes the FCM token; when it's
// undecided it shows a small "Enable notifications" button that requests
// permission on the click (a user gesture — required by Safari). Renders
// nothing when push is unsupported/unconfigured or already denied.
//
// "Granted" means the server stored this device's token, not only that the
// browser said yes: a token that never reached the server reads as
// notifications on while nothing can arrive. If storing it fails, the button
// comes back with the reason and tries again.

type State = "loading" | "unavailable" | "default" | "granted" | "denied";

export const PUSH_REGISTER_FAILED =
  "Notifications didn't turn on. Check your connection and try again.";

// Validate the FCM payload before constructing a Notification (it's external
// input from the push service).
const FcmNotification = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
});

export function EnablePush() {
  const [state, setState] = useState<State>("loading");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detect support + current permission; register the token if already granted.
  useEffect(() => {
    let active = true;
    (async () => {
      const messaging = await getMessagingIfSupported();
      if (!active) return;
      if (
        !messaging ||
        typeof Notification === "undefined" ||
        !("serviceWorker" in navigator)
      ) {
        setState("unavailable");
        return;
      }
      if (Notification.permission === "granted") {
        // Refresh the stored token. If it cannot be stored, offer the button.
        const ok = await registerDeviceToken().catch(() => false);
        if (!active) return;
        if (ok) {
          setState("granted");
        } else {
          setState("default");
          setError(PUSH_REGISTER_FAILED);
        }
      } else if (Notification.permission === "denied") {
        setState("denied");
      } else {
        setState("default");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Foreground messages don't fire the service worker's onBackgroundMessage, so
  // surface them ourselves. Registered ONCE while granted and unsubscribed on
  // cleanup, so a remount can't stack duplicate listeners.
  useEffect(() => {
    if (state !== "granted") return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      const messaging = await getMessagingIfSupported();
      if (!active || !messaging) return;
      unsubscribe = onMessage(messaging, (payload) => {
        const parsed = FcmNotification.safeParse(payload.notification);
        if (!parsed.success || Notification.permission !== "granted") return;
        new Notification(parsed.data.title, {
          body: parsed.data.body ?? "",
          icon: "/icon.svg",
        });
      });
    })();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [state]);

  if (state !== "default") return null;

  const enable = async () => {
    setPending(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "default");
        return;
      }
      if (await registerDeviceToken()) {
        setState("granted");
      } else {
        setError(PUSH_REGISTER_FAILED);
      }
    } catch {
      setError(PUSH_REGISTER_FAILED);
    } finally {
      setPending(false);
    }
  };

  // Full-width outline CTA per board S08 (`Button-Outline {w:fill_container}`);
  // the home shell's flex gap handles spacing, so no wrapper/margin here. It
  // fades in once detection resolves, so it does not pop into place.
  return (
    <div className="flex w-full flex-col gap-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300">
      <Button
        variant="outline"
        className="w-full gap-2"
        onClick={() => void enable()}
        disabled={pending}
      >
        {pending && <Spinner size="sm" label="Turning on notifications…" />}
        {error ? "Try again" : "Enable notifications"}
      </Button>
      {error && (
        <p role="alert" className="text-center text-caption text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
