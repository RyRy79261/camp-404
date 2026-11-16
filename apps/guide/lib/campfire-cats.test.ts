import { describe, expect, it } from "vitest";
import { PET_PORTRAITS, trimSprite } from "@camp404/games/pets";
import { NIPSTER_ON_JINN, PRINCE_ON_JINN, portrait } from "./campfire-cats";

/** Where the outline and the air are: the drawing, without its colours. */
const shape = (s: readonly string[]) => s.map((r) => r.replace(/[^.O]/g, "#"));

describe("the campfire's cats", () => {
  const jinn = trimSprite(PET_PORTRAITS.jinn.sprite);

  it("draws Moda and Nipster on Jinn's exact outline, only recoloured", () => {
    expect(shape(portrait("moda"))).toEqual(shape(jinn));
    expect(shape(NIPSTER_ON_JINN)).toEqual(shape(jinn));
    expect(shape(PRINCE_ON_JINN)).toEqual(shape(jinn));
  });

  it("gives Nipster a tortoiseshell coat: black, orange and white, green eyes", () => {
    const fills = new Set(NIPSTER_ON_JINN.join("").replace(/[.O]/g, ""));
    expect([...fills].sort()).toEqual(["A", "K", "L", "W"]);
  });

  it("gives Prince his white coat with black cap, patch and tail", () => {
    const fills = new Set(PRINCE_ON_JINN.join("").replace(/[.O]/g, ""));
    expect([...fills].sort()).toEqual(["G", "K", "L", "W"]);
    expect(portrait("prince")).toEqual(PRINCE_ON_JINN);
  });

  it("keeps Jinn as his own portrait", () => {
    expect(portrait("jinn")).toEqual(jinn);
  });
});
