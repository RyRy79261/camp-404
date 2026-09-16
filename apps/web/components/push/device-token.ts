import { deleteToken, getToken } from "firebase/messaging";
import { getMessagingIfSupported, VAPID_KEY } from "@/lib/firebase-client";

// This device's push token: registering it after the member allows
// notifications, and forgetting it when they sign out, so a shared or handed-on
// phone stops getting the last member's notifications.

export const PUSH_SW_PATH = "/firebase-messaging-sw.js";

/**
 * Get this device's FCM token and store it for the signed-in member. True only
 * when the server stored it: a token the server never saw would read as
 * "notifications on" while nothing can reach the device.
 */
export async function registerDeviceToken(): Promise<boolean> {
  const messaging = await getMessagingIfSupported();
  if (!messaging || !VAPID_KEY) return false;
  const registration = await navigator.serviceWorker.register(PUSH_SW_PATH);
  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  if (!token) return false;
  const res = await fetch("/api/push/tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, platform: "web" }),
  });
  return res.ok;
}

/**
 * Remove this device's token from the member's account and from Firebase.
 * Does nothing on a device that never turned notifications on: it does not ask
 * for permission and does not register a service worker. Never throws.
 */
export async function forgetDeviceToken(): Promise<void> {
  try {
    if (
      typeof Notification === "undefined" ||
      Notification.permission !== "granted" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }
    const registration =
      await navigator.serviceWorker.getRegistration(PUSH_SW_PATH);
    const messaging = await getMessagingIfSupported();
    if (!registration || !messaging || !VAPID_KEY) return;
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return;
    await fetch("/api/push/tokens", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    await deleteToken(messaging);
  } catch {
    // Sign-out must still happen. The drain drops a token FCM reports dead.
  }
}
