/**
 * Zapper Business API client.
 * Docs: https://docs.zapper.com/
 *
 * No subscription API — recurring dues must be cron-generated as fresh invoices.
 * Settlement is ZAR only.
 */
const ZAPPER_BASE = "https://api.zapper.com/business";

function requireKey(): string {
  const key = process.env.ZAPPER_MERCHANT_API_KEY;
  if (!key) throw new Error("ZAPPER_MERCHANT_API_KEY is not set");
  return key;
}

export interface CreateInvoiceInput {
  /** Camp member identifier — included as reference for reconciliation. */
  reference: string;
  amountZar: number;
  description: string;
}

export interface ZapperInvoice {
  invoiceId: string;
  paymentReference: string;
  qrCodeSvgUrl: string;
  deepLinkUrl: string;
}

export async function createInvoice(
  input: CreateInvoiceInput,
): Promise<ZapperInvoice> {
  const res = await fetch(`${ZAPPER_BASE}/invoices`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reference: input.reference,
      amount: Math.round(input.amountZar * 100), // minor units
      currency: "ZAR",
      description: input.description,
    }),
  });

  if (!res.ok) {
    throw new Error(`Zapper createInvoice failed: ${res.status}`);
  }

  return (await res.json()) as ZapperInvoice;
}

export async function getPayment(paymentReference: string) {
  const res = await fetch(`${ZAPPER_BASE}/payments/${paymentReference}`, {
    headers: { Authorization: `Bearer ${requireKey()}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Zapper getPayment failed: ${res.status}`);
  }
  return res.json();
}
