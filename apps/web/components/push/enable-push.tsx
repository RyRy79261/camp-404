"use client";

import { useEffect, useState } from "react";
import { getToken, onMessage } from "firebase/messaging";
import { z } from "zod";
import { Button } from "@camp404/ui/components/button";
import { getMessagingIfSupported, VAPID_KEY } from "@/lib/firebase-client";

// Web push opt-in, mounted on the authenticated home control panel (so it never
// prompts signed-out visitors). Web-only and best-effort: when permission is
// already granted it silently registers/refreshes the FCM token; when it's
// undecided it shows a small "Enable notifications" button that requests
// permission on the click (a user gesture — required by Safari). Renders
// nothing when push is unsupported/unconfigured or already denied.

type State = "loading" | "unavailable" | "default" | "granted" | "denied";

// Validate the FCM payload before constructing a Notification (it's external
// input from the push service).
const FcmNotification = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
});

async function registerToken(): Promise<boolean> {
  const messaging = await getMessagingIfSupported();
  if (!messaging || !VAPID_KEY) return false;
  const registration = await navigator.serviceWorker.register(
    "/firebase-messaging-sw.js",
  );
  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  if (!token) return false;
  await fetch("/api/push/tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, platform: "web" }),
  });
  return true;
}

export function EnablePush() {
  const [state, setState] = useState<State>("loading");

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
        setState("granted");
        registerToken().catch(() => {});
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

  // Full-width outline CTA per board S08 (`Button-Outline {w:fill_container}`);
  // the home shell's flex gap handles spacing, so no wrapper/margin here.
  return (
    <Button
      variant="outline"
      className="w-full"
      onClick={async () => {
        try {
          const permission = await Notification.requestPermission();
          if (permission !== "granted") {
            setState(permission === "denied" ? "denied" : "default");
            return;
          }
          await registerToken();
          setState("granted");
        } catch {
          setState("unavailable");
        }
      }}
    >
      Enable notifications
    </Button>
  );
}
