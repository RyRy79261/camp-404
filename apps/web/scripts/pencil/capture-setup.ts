import type { FullConfig } from "@playwright/test";

/**
 * Global setup for the Pencil screenshot capture.
 *
 * Unlike the intake-tracker reference (which signs in once and writes a shared
 * storageState), Camp 404's auth is a cookie seam — `/api/test/login` sets
 * `camp404_test_user` per browser context — and every screen needs a DIFFERENT
 * seeded user (member, captain, pending, rejected, invited-not-yet). So there is
 * no single storageState to bake here; the spec logs in and seeds per context.
 *
 * All this does is start from a clean store: POST /api/test/reset once before
 * the capture walks the app. The route only exists under E2E_TEST_MODE=1 (set in
 * capture.config.ts's webServer.env), so this is inert against a real server.
 */
async function captureSetup(config: FullConfig): Promise<void> {
  const baseURL =
    config.projects[0]?.use.baseURL ?? "http://localhost:3000";
  try {
    const res = await fetch(`${baseURL}/api/test/reset`, { method: "POST" });
    if (!res.ok) {
      console.warn(
        `[capture-setup] /api/test/reset returned ${res.status}; ` +
          "is the dev server running with E2E_TEST_MODE=1?",
      );
      return;
    }
    console.log("[capture-setup] test store reset — clean slate for capture");
  } catch (err) {
    console.warn(
      "[capture-setup] could not reach /api/test/reset:",
      (err as Error).message,
    );
  }
}

export default captureSetup;
