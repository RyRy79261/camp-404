"use client";

import { WindowError } from "@/components/os/window-error";

// A page that fails is caught here and shown inside its own window, with the
// desktop still around it: "Tasks stopped responding".
export default WindowError;
