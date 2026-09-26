import { describe, expect, it } from "vitest";
import {
  LastSeenStore,
  PRIVATE_PLACEHOLDER,
  captureLastSeen,
  lastSeenLabel,
  mountLastSeen,
  type LastSeenCopy,
} from "./last-seen";

function fixture(html: string): HTMLElement {
  const body = document.createElement("section");
  body.innerHTML = html;
  document.body.append(body);
  return body;
}

function copyOf(chars: number, takenAt = 0): LastSeenCopy {
  return {
    html: "x".repeat(chars),
    chars,
    takenAt,
    scrollTop: 0,
    rootClasses: "",
  };
}

describe("captureLastSeen", () => {
  it("drops scripts, frames, handlers, hidden inputs and autofocus", () => {
    const body = fixture(`
      <h1 autofocus onclick="alert(1)">Roster</h1>
      <script>window.x = 1</script>
      <iframe src="/x"></iframe>
      <form><input type="hidden" name="$ACTION_ID_abc" value="token"></form>
      <a href="javascript:alert(1)">bad</a>
      <button tabindex="0" onmouseover="x()">Go</button>`);
    const copy = captureLastSeen(body, 0)!;
    expect(copy.html).toContain("Roster");
    expect(copy.html).not.toMatch(
      /<script|<iframe|onclick|onmouseover|autofocus|tabindex/i,
    );
    expect(copy.html).not.toContain("$ACTION_ID_abc");
    expect(copy.html).not.toContain("javascript:");
    body.remove();
  });

  it("blanks every data-os-private element, its text and its attributes", () => {
    const body = fixture(`
      <p>Name: Alice</p>
      <dl data-os-private class="grid" title="8001015009087">
        <dt>ID number</dt><dd>8001015009087</dd>
      </dl>
      <input data-os-private value="GB1234567" aria-label="Passport">`);
    const copy = captureLastSeen(body, 0)!;
    expect(copy.html).toContain("Alice");
    expect(copy.html).not.toContain("8001015009087");
    expect(copy.html).not.toContain("GB1234567");
    expect(copy.html).toContain(PRIVATE_PLACEHOLDER);
    expect(copy.html).toContain('class="grid"');
    body.remove();
  });

  it("never copies a password, or a value only set on the live field", () => {
    const body = fixture(
      `<input type="password" value="hunter2"><input id="t">`,
    );
    (body.querySelector("#t") as HTMLInputElement).value = "typed but unsaved";
    const copy = captureLastSeen(body, 0)!;
    expect(copy.html).not.toContain("hunter2");
    expect(copy.html).not.toContain("typed but unsaved");
    body.remove();
  });

  it("blanks a secret field whatever its type: a revealed password, a one-time code", () => {
    const body = fixture(`
      <input type="text" autocomplete="new-password" value="correct horse">
      <input type="text" autocomplete="username current-password" value="battery staple">
      <input inputmode="numeric" autocomplete="one-time-code" value="123456">
      <input type="text" autocomplete="name" value="Alice">`);
    const copy = captureLastSeen(body, 0)!;
    expect(copy.html).not.toContain("correct horse");
    expect(copy.html).not.toContain("battery staple");
    expect(copy.html).not.toContain("123456");
    expect(copy.html).toContain("Alice");
    body.remove();
  });

  it("refuses a body over the per-copy limit", () => {
    const body = fixture(`<p>${"a".repeat(500)}</p>`);
    expect(captureLastSeen(body, 0, 100)).toBeNull();
    expect(captureLastSeen(body, 0, 10_000)).not.toBeNull();
    body.remove();
  });

  it("records the root classes for dark mode and the accent skin", () => {
    document.documentElement.className = "dark camp-accent";
    const body = fixture("<p>x</p>");
    expect(captureLastSeen(body, 0)!.rootClasses).toContain("dark camp-accent");
    document.documentElement.className = "";
    body.remove();
  });
});

describe("mountLastSeen", () => {
  it("draws the copy in a closed, inert, aria-hidden shadow root", () => {
    const body = fixture(`<h1>Tasks</h1><label>Title <input></label>`);
    const copy = captureLastSeen(body, 0)!;
    body.remove();
    const host = document.createElement("div");
    document.body.append(host);
    mountLastSeen(host, copy);
    expect(host.shadowRoot).toBeNull(); // closed: nobody outside can reach in
    expect(host.hasAttribute("inert")).toBe(true);
    expect(host.getAttribute("aria-hidden")).toBe("true");
    expect(document.body.textContent).not.toContain("Tasks");
    expect(document.querySelectorAll("label")).toHaveLength(0);
    host.remove();
  });
});

describe("LastSeenStore", () => {
  it("drops the least recently used copies when over budget", () => {
    const store = new LastSeenStore(100);
    store.put("a", copyOf(40));
    store.put("b", copyOf(40));
    store.touch("a"); // a is now more recent than b
    expect(store.put("c", copyOf(40))).toEqual(["b"]);
    expect(store.get("a")).toBeDefined();
    expect(store.get("b")).toBeUndefined();
    expect(store.totalChars).toBe(80);
  });

  it("keeps at most maxCopies, however small they are", () => {
    const store = new LastSeenStore(1000, 2);
    store.put("a", copyOf(10));
    store.put("b", copyOf(10));
    store.touch("a"); // b is now the oldest
    expect(store.put("c", copyOf(10))).toEqual(["b"]);
    expect(store.get("a")).toBeDefined();
    expect(store.get("c")).toBeDefined();
    expect(store.totalChars).toBe(20);
  });

  it("replaces a window's copy without double counting", () => {
    const store = new LastSeenStore(100);
    store.put("a", copyOf(60));
    store.put("a", copyOf(70));
    expect(store.totalChars).toBe(70);
  });

  it("keeps nothing over the whole budget, and prunes and clears", () => {
    const store = new LastSeenStore(100);
    store.put("big", copyOf(101));
    expect(store.get("big")).toBeUndefined();
    store.put("a", copyOf(10));
    store.put("b", copyOf(10));
    store.keepOnly(["b"]);
    expect(store.get("a")).toBeUndefined();
    expect(store.totalChars).toBe(10);
    store.clear();
    expect(store.get("b")).toBeUndefined();
    expect(store.totalChars).toBe(0);
  });
});

describe("lastSeenLabel", () => {
  it("says the local time as hh:mm", () => {
    const at = new Date(2026, 8, 26, 9, 5).getTime();
    expect(lastSeenLabel(at)).toBe("Last seen 09:05.");
  });

  it("says the time in the zone the app names, whatever the device's clock", () => {
    // 07:22 UTC is 09:22 in Johannesburg (SAST, no daylight saving).
    const at = Date.UTC(2026, 8, 26, 7, 22);
    expect(lastSeenLabel(at, "Africa/Johannesburg")).toBe("Last seen 09:22.");
    expect(lastSeenLabel(at, "UTC")).toBe("Last seen 07:22.");
    expect(
      lastSeenLabel(Date.UTC(2026, 8, 26, 22, 5), "Africa/Johannesburg"),
    ).toBe("Last seen 00:05.");
  });
});

describe("blanking inside tables and lists", () => {
  function reparse(html: string): DocumentFragment {
    const t = document.createElement("template");
    t.innerHTML = html;
    return t.content;
  }

  it("keeps the word inside a private table row after the copy is parsed", () => {
    const body = fixture(`<table><tbody>
      <tr data-os-private><td>Ada</td><td>8001015009087</td></tr>
      <tr><td>Ben</td></tr></tbody></table>`);
    const copy = captureLastSeen(body, 0)!;
    body.remove();
    const tbody = reparse(copy.html).querySelector("tbody")!;
    expect(tbody.textContent).toContain(PRIVATE_PLACEHOLDER);
    expect(tbody.textContent).toContain("Ben");
    expect(copy.html).not.toContain("8001015009087");
  });

  it("keeps the word inside a private list", () => {
    const body = fixture(`<ul data-os-private><li>Peanuts</li></ul>`);
    const copy = captureLastSeen(body, 0)!;
    body.remove();
    expect(reparse(copy.html).querySelector("ul")!.textContent).toBe(
      PRIVATE_PLACEHOLDER,
    );
  });
});

describe("a React controlled field", () => {
  it("DOES copy what the member typed (React keeps the value attribute in step)", async () => {
    const { render, fireEvent } = await import("@testing-library/react");
    const { createElement, useState } = await import("react");
    function Field() {
      const [v, setV] = useState("");
      return createElement("input", {
        "aria-label": "Title",
        value: v,
        onChange: (e: { target: { value: string } }) => setV(e.target.value),
      });
    }
    const { container, getByLabelText } = render(createElement(Field));
    fireEvent.change(getByLabelText("Title"), {
      target: { value: "unsaved words" },
    });
    expect(captureLastSeen(container, 0)!.html).toContain("unsaved words");
  });
});
