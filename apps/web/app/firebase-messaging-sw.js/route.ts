export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Serves the Firebase Cloud Messaging background service worker at the root
// path /firebase-messaging-sw.js, interpolating the PUBLIC NEXT_PUBLIC_FIREBASE_*
// config from env at runtime. Generating it (rather than committing a static
// public/ file) keeps a single source of truth for the config and avoids
// hand-editing a committed file per deploy. These values are public (they ship
// to the browser anyway). A static-export build has no route handlers, but web
// push is web-only, so that's fine.

const SW_CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
};

export function GET() {
  const body = `/* Firebase Cloud Messaging service worker (compat). Generated from env. */
importScripts("https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js");

firebase.initializeApp(${JSON.stringify(SW_CONFIG)});

const messaging = firebase.messaging();
messaging.onBackgroundMessage(function (payload) {
  const n = (payload && payload.notification) || {};
  self.registration.showNotification(n.title || "Camp 404", {
    body: n.body || "",
    icon: "/icon.svg",
    data: (payload && payload.data) || {},
  });
});
`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}
