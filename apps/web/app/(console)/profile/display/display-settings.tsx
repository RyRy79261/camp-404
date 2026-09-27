"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  DesktopPreferences,
  DesktopPreferencesPatch,
} from "@camp404/types/desktop-preferences";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { toast } from "@camp404/ui/components/toast";
import { useDesktopDisplay } from "@/components/os/desktop-display";
import { DisplayControls } from "@/components/os/display-controls";
import { saveDesktopPreferencesAction } from "../../desktop-preferences-actions";

/**
 * The Display page's controls. On the desktop they change the desktop's own
 * state, so the change shows at once everywhere (the live preview); on a page
 * with no desktop they save and refresh.
 */
export function DisplaySettings({ initial }: { initial: DesktopPreferences }) {
  const display = useDesktopDisplay();
  const router = useRouter();
  const [local, setLocal] = useState(initial);
  const prefs = display?.prefs ?? local;

  function change(patch: DesktopPreferencesPatch) {
    if (display) {
      display.change(patch);
      return;
    }
    setLocal((p) => ({ ...p, ...patch }));
    void saveDesktopPreferencesAction(patch).then(
      (result) => {
        if (!result.ok) toast.error(result.error);
        else router.refresh();
      },
      () => toast.error("Your display settings couldn't be saved."),
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>How it looks</CardTitle>
          <CardDescription>
            Changes show at once and are saved for every device you sign in on.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DisplayControls prefs={prefs} onChange={change} oneClick />
        </CardContent>
      </Card>
      {display?.openWelcome && (
        <Card>
          <CardHeader>
            <CardTitle>The welcome tour</CardTitle>
            <CardDescription>
              The short tour of the desktop you saw the first time.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={display.openWelcome}>
              Show the welcome again
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  );
}
