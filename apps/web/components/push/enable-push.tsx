"use client";

import { useEffect, useState } from "react";
import { getToken } from "firebase/messaging";
import { Button } from "@camp404/ui/components/button";
import { getMessagingIfSupported, VAPID_KEY } from "@/lib/firebase-client";

// Web push opt-in, mounted on the authenticated home control panel (so it never
// prompts signed-out visitors). Web-only and best-effort: when permission is
// already granted it silently registers/refreshes the FCM token; when it's
// undecided it shows a small "Enable notifications" button that requests
// permission on the click (a user gesture — required by Safari). Renders
// nothing when push is unsupported/unconfigured or already denied.

type State = "loading" | "unavailable" | "default" | "granted" | "denied";

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
        // Refresh the token on every load — tokens rotate.
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

  if (state !== "default") return null;

  return (
    <div className="mt-4 flex justify-center">
      <Button
        variant="secondary"
        size="sm"
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
    </div>
  );
}
