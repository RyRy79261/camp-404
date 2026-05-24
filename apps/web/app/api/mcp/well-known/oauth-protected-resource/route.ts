import { NextResponse } from "next/server";
import { getPublicOrigin } from "@/lib/mcp/origin";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// RFC 9728 — Protected Resource Metadata. Tells callers which auth
// server protects this resource (us) and what scopes it accepts.
export async function GET(req: Request) {
  const origin = getPublicOrigin(req);
  return NextResponse.json(
    {
      resource: `${origin}/api/mcp`,
      authorization_servers: [origin],
      scopes_supported: ["mcp:user"],
      bearer_methods_supported: ["header"],
    },
    { headers: CORS_HEADERS },
  );
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
