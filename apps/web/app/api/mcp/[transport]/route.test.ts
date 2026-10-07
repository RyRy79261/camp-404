// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// The connector's endpoint through the real mcp-handler and MCP SDK: the
// token check is stubbed (it reads the database), everything after it is the
// production transport. Guards SDK upgrades: initialize, tools/list and a
// tool call must keep working.

vi.mock("@/lib/mcp/auth", () => ({
  verifyMcpToken: vi.fn(async (_req: Request, token?: string) =>
    token === "good"
      ? { token, clientId: "test", scopes: [], extra: { campUserId: "u1" } }
      : undefined,
  ),
  getCampUserIdFromAuth: () => "u1",
}));
vi.mock("@/lib/mcp/server", async () => {
  const { z } = await import("zod");
  return {
    SERVER_INSTRUCTIONS: "Test camp.",
    registerCampMcpTools: (server: {
      registerTool: (
        name: string,
        config: object,
        cb: (
          args: object,
          ctx: { http?: { authInfo?: { extra?: { campUserId?: string } } } },
        ) => Promise<unknown>,
      ) => void;
    }) => {
      // Answers with the camp user the verified token carries, as runTool
      // reads it: the token check's result must reach the tool.
      server.registerTool(
        "ping",
        {
          title: "Ping",
          description: "Answers pong.",
          inputSchema: z.object({}),
        },
        async (_args, ctx) => ({
          content: [
            {
              type: "text",
              text: `pong ${ctx.http?.authInfo?.extra?.campUserId}`,
            },
          ],
        }),
      );
    },
  };
});

import { POST } from "./route";

const URL = "https://camp.test/api/mcp/mcp";

function rpc(body: object, token = "good"): Request {
  return new Request(URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
    },
    body: JSON.stringify(body),
  });
}

/** The JSON-RPC result, from a plain JSON or a one-event stream reply. */
async function result(
  res: Response,
): Promise<{ result?: Record<string, unknown> }> {
  const text = await res.text();
  const data = text.includes("data:")
    ? text
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("")
    : text;
  return JSON.parse(data);
}

describe("POST /api/mcp/mcp", () => {
  it("refuses a request without a good token", async () => {
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "bad"),
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("access-control-expose-headers")).toBe(
      "WWW-Authenticate",
    );
  });

  it("initializes, lists the tools and calls one through the SDK", async () => {
    const init = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "test", version: "1" },
        },
      }),
    );
    expect(init.status).toBe(200);
    expect((await result(init)).result).toMatchObject({
      serverInfo: { name: "camp-404" },
      instructions: "Test camp.",
    });

    const list = await result(
      await POST(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" })),
    );
    expect(
      (list.result!.tools as { name: string }[]).map((t) => t.name),
    ).toEqual(["ping"]);

    const call = await result(
      await POST(
        rpc({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "ping", arguments: {} },
        }),
      ),
    );
    expect(call.result).toMatchObject({
      content: [{ type: "text", text: "pong u1" }],
    });
  });

  it("answers 404 on any path but the connector's", async () => {
    const res = await POST(
      new Request("https://camp.test/api/mcp/sse", {
        method: "POST",
        headers: {
          authorization: "Bearer good",
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
    );
    expect(res.status).toBe(404);
  });
});
