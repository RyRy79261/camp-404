import type { ReactNode } from "react";
import { WindowDirtyProvider, WindowKeyProvider } from "@camp404/os";
import { DraftOwnerContext } from "@/components/os/editor-draft";

/** The member every editor test signs in as. */
export const DRAFT_OWNER = "u-1";

/**
 * An editor as the desktop draws it: inside a window (its key), for a signed-in
 * member, under the dirty registry. `confirm` answers the guard.
 */
export function DraftWindow({
  windowKey,
  confirm = () => true,
  children,
}: {
  windowKey: string;
  confirm?: (message: string) => boolean;
  children: ReactNode;
}) {
  return (
    <WindowDirtyProvider confirm={confirm}>
      <DraftOwnerContext.Provider value={DRAFT_OWNER}>
        <WindowKeyProvider windowKey={windowKey}>{children}</WindowKeyProvider>
      </DraftOwnerContext.Provider>
    </WindowDirtyProvider>
  );
}
