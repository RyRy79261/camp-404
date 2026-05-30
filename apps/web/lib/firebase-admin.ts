import "server-only";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { mapSendResponses, type PushSend } from "@camp404/db/push-status";

// Lazy firebase-admin singleton. Initialised only on first send so the app
// builds and runs with no Firebase config (the groq.ts / telegram.ts pattern);
// a missing-config call throws and surfaces as a 503 rather than a silent
// no-op. Never imported at a server-renderable module's top level beyond this
// server-only module.

let app: App | null = null;

function getApp(): App {
  if (app) return app;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !rawKey) {
    throw new Error(
      "Firebase admin is not configured — set FIREBASE_PROJECT_ID, " +
        "FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.",
    );
  }
  const existing = getApps();
  app =
    existing.length > 0
      ? existing[0]!
      : initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            // Env stores the PEM with literal `\n`; cert() needs real newlines.
            privateKey: rawKey.replace(/\\n/g, "\n"),
          }),
        });
  return app;
}

/**
 * The {@link PushSend} implementation backed by firebase-admin's
 * `sendEachForMulticast`. Returns per-token outcomes (mapped by index via
 * `mapSendResponses`) so the drain worker can prune dead tokens; only a
 * whole-request failure (bad credentials, >500 tokens) rejects.
 */
export const sendPush: PushSend = async (tokens, notification, data) => {
  if (tokens.length === 0) return [];
  const res = await getMessaging(getApp()).sendEachForMulticast({
    tokens,
    notification,
    data,
  });
  return mapSendResponses(tokens, res.responses);
};
