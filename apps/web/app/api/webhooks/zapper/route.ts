import { NextResponse } from "next/server";
import { getPayment } from "@/lib/zapper";

export const runtime = "nodejs";

/**
 * Zapper payment webhook.
 * Open question (§14.7): does Zapper provide HMAC signature headers?
 * Until confirmed, we re-verify every webhook via GET /payments/{ref}.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as { paymentReference?: string };
  if (!body.paymentReference) {
    return new NextResponse("Missing paymentReference", { status: 400 });
  }

  // Re-verify with Zapper (do not trust the webhook payload alone).
  const payment = await getPayment(body.paymentReference);

  // TODO Phase 1: mark `payments.status = 'paid'` and `users.dues_paid = true`.
  return NextResponse.json({ ok: true, payment });
}
