import "server-only";

// Voice's E2E twin (#356): the one-time consent, the connector's audit rows
// (client "voice") and which scripted command the fake transcriber and the
// fake Claude play next. Process-wide, as the rest of the test store, and
// cleared by /api/test/reset.

export interface TestMcpAuditRow {
  campUserId: string;
  clientId: string;
  tool: string;
  argsJson: Record<string, unknown> | null;
  outcome: "success" | "error";
  errorMessage: string | null;
}

interface VoiceStore {
  consent: Map<string, Date>;
  audit: TestMcpAuditRow[];
  /** The scripted command the next clip plays (lib/voice/e2e-script.ts). */
  script: string | null;
}

const KEY = "__camp404VoiceTestStore__";

function store(): VoiceStore {
  const g = globalThis as Record<string, unknown>;
  g[KEY] ??= { consent: new Map(), audit: [], script: null };
  return g[KEY] as VoiceStore;
}

export const voiceTestStore = {
  getConsent(userId: string): Date | null {
    return store().consent.get(userId) ?? null;
  },
  setConsent(userId: string, at: Date | null): void {
    if (at) store().consent.set(userId, at);
    else store().consent.delete(userId);
  },
  appendAudit(row: TestMcpAuditRow): void {
    store().audit.push(row);
  },
  audit(): readonly TestMcpAuditRow[] {
    return store().audit;
  },
  setScript(name: string | null): void {
    store().script = name;
  },
  script(): string | null {
    return store().script;
  },
};

export function resetVoiceStore(): void {
  const s = store();
  s.consent.clear();
  s.audit.length = 0;
  s.script = null;
}
