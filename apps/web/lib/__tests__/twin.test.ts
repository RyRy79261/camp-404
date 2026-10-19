import { describe, expect, it, vi } from "vitest";

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { twin } from "../twin";

describe("twin", () => {
  it("asks the switch at call time, and the store answers on the store", async () => {
    const real = { read: async (n: number) => `db ${n}` };
    const store = {
      prefix: "store",
      read(n: number) {
        return `${this.prefix} ${n}`;
      },
    };
    const backend = twin(real, store, ["read"]);

    mode.on = false;
    expect(await backend.read(1)).toBe("db 1");
    mode.on = true;
    expect(await backend.read(2)).toBe("store 2");
    mode.on = false;
  });

  it("looks the real function up at call time, so a later spy still intercepts it", async () => {
    const real = { read: async () => "db" };
    const backend = twin(real, { read: () => "store" }, ["read"]);
    const spy = vi.spyOn(real, "read").mockResolvedValue("spied");

    expect(await backend.read()).toBe("spied");
    expect(spy).toHaveBeenCalledOnce();
  });

  it("keeps a store's null as the answer, never falling through to the database", async () => {
    const real = { find: vi.fn(async (): Promise<string | null> => "db") };
    const backend = twin(real, { find: () => null as string | null }, ["find"]);

    mode.on = true;
    expect(await backend.find()).toBeNull();
    expect(real.find).not.toHaveBeenCalled();
    mode.on = false;
  });

  it("turns a store's throw into a rejection, as the database's would be", async () => {
    const backend = twin(
      { write: async () => 1 },
      {
        write: (): number => {
          throw new Error("refused");
        },
      },
      ["write"],
    );
    mode.on = true;
    await expect(backend.write()).rejects.toThrow("refused");
    mode.on = false;
  });
});
