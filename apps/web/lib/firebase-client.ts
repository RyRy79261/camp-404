import {
  type FirebaseApp,
  getApp,
  getApps,
  initializeApp,
} from "firebase/app";
import { getMessaging, isSupported, type Messaging } from "firebase/messaging";

// Browser-only Firebase web SDK init for push. NO `server-only` — but every
// entry point guards on `isSupported()` and `typeof window`, so it is never
// touched during SSR/RSC. Reads the public NEXT_PUBLIC_FIREBASE_* config;
// returns null when unconfigured or when the environment can't do web push
// (SSR, private browsing, unsupported Safari).

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

function isConfigured(): boolean {
  return Boolean(
    config.apiKey &&
      config.projectId &&
      config.messagingSenderId &&
      config.appId &&
      VAPID_KEY,
  );
}

function firebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(config);
}

/** The Messaging instance, or null if web push isn't available/configured. */
export async function getMessagingIfSupported(): Promise<Messaging | null> {
  if (typeof window === "undefined" || !isConfigured()) return null;
  try {
    if (!(await isSupported())) return null;
    return getMessaging(firebaseApp());
  } catch {
    return null;
  }
}
