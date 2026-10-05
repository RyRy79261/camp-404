import { describe, expect, it, vi } from "vitest";

vi.mock("@camp404/db/rate-limit", () => ({ consumeRateLimit: vi.fn() }));

import { clientAddressKey } from "../rate-limit";

// What a per-address limit counts against: an IPv6 /64 is one address.
describe("clientAddressKey", () => {
  it("keeps IPv4 as given, and maps an IPv4-mapped IPv6 address to it", () => {
    expect(clientAddressKey("203.0.113.7")).toBe("203.0.113.7");
    expect(clientAddressKey("::ffff:203.0.113.7")).toBe("203.0.113.7");
  });

  it("counts IPv6 by its /64, however the address is written", () => {
    const key = "2001:db8:abcd:12::/64";
    expect(clientAddressKey("2001:db8:abcd:12::1")).toBe(key);
    expect(clientAddressKey("2001:0DB8:ABCD:0012:ffff:1:2:3")).toBe(key);
    expect(clientAddressKey("2001:db8:abcd:12:0:0:0:9")).toBe(key);
    expect(clientAddressKey("2001:db8:abcd:13::1")).not.toBe(key);
  });

  it("handles short forms and a zone id", () => {
    expect(clientAddressKey("::1")).toBe("0:0:0:0::/64");
    expect(clientAddressKey("2001:db8::")).toBe("2001:db8:0:0::/64");
    expect(clientAddressKey("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
  });
});
