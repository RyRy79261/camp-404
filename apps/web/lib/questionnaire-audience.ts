import "server-only";

import * as activations from "@camp404/db/activations";
import type { SendAudiencePreview } from "@camp404/db/activations";
import type { BroadcastScope } from "@camp404/db/recipients";
import { testStore } from "./test-store";
import { twin } from "./twin";

// The questionnaire Send screen's count: who a send would gate, read for the
// year the send will freeze, by the recipients rule the send itself uses.

const preview = twin(
  activations,
  {
    previewSendAudience: (spec: {
      scope: BroadcastScope;
      team: string | null;
      targetUserIds: readonly string[];
    }): SendAudiencePreview => testStore.previewSendAudience(spec),
  },
  ["previewSendAudience"],
);

export type { SendAudiencePreview };
export const previewSendAudience = preview.previewSendAudience;
