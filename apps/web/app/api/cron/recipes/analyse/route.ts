import { assertCron } from "@/lib/cron-auth";
import { cronStubResponse } from "@/lib/cron-stub";

export const runtime = "nodejs";

/**
 * Will pick up `pending` recipes, normalise them with Claude structured
 * output, and write the result back. Not built yet (Phase 3, recipes and meal
 * planning): it says so and does nothing. Scheduled daily in vercel.json.
 */
export async function GET(req: Request) {
  const deny = assertCron(req);
  if (deny) return deny;
  return cronStubResponse("recipes/analyse");
}
