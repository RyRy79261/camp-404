"use client";

import { WindowError } from "@/components/os/window-error";

// A questionnaire that fails is caught here, not at the root. On the desktop
// it sits in the questionnaire's window; for a member a blocking
// questionnaire holds, it sits in the blocking layer over the inert desktop;
// with no desktop (a rejected applicant) it is the page alone. The way back
// is the desktop, which for a held member is the gate again.
export default WindowError;
