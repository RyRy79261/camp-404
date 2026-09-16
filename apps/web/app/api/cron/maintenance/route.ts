import { NextResponse } from "next/server";
import { redactSecrets } from "@camp404/core";
import {
  backfillIdEncryption,
  listLiveAuthUserIds,
} from "@camp404/db/maintenance";
import { sweepOrphanAvatarBlobs } from "@/lib/avatar-blob";
import { assertCron } from "@/lib/cron-auth";

export const runtime = "nodejs";

// Daily data upkeep, so no one has to run a one-off script against production:
//
// 1. Encrypt any government ID number still stored as plaintext in a burner
//    profile (left from before encryption), and strip it.
// 2. Delete profile photos and image answers of members who no longer have a
//    camp account (left by erasures before the photo-folder fix).
//
// Both are idempotent, so a daily run that finds nothing does nothing. The
// photo sweep runs only on the production deployment: it compares the Blob
// store with the database's members, and a preview branch's database can miss
// recent members whose photos share the same store. A step that fails does not
// stop the other, and the run answers 500.

function failure(err: unknown, fallback: string) {
  return {
    status: "failed" as const,
    error: redactSecrets(
      err instanceof Error ? err.message : fallback,
      process.env,
    ),
  };
}

export async function GET(req: Request) {
  const deny = assertCron(req);
  if (deny) return deny;

  let ok = true;

  let idEncryption;
  try {
    idEncryption = {
      status: "done" as const,
      ...(await backfillIdEncryption()),
    };
  } catch (err) {
    ok = false;
    idEncryption = failure(err, "ID encryption backfill failed");
  }

  let orphanPhotos;
  if (process.env.VERCEL_ENV !== "production") {
    orphanPhotos = {
      status: "skipped" as const,
      message:
        "Runs only on the production deployment, whose database lists every member.",
    };
  } else {
    try {
      orphanPhotos = await sweepOrphanAvatarBlobs(await listLiveAuthUserIds());
      if (orphanPhotos.status === "refused") ok = false;
    } catch (err) {
      ok = false;
      orphanPhotos = failure(err, "orphan photo sweep failed");
    }
  }

  return NextResponse.json(
    { ok, job: "maintenance", idEncryption, orphanPhotos },
    { status: ok ? 200 : 500 },
  );
}
