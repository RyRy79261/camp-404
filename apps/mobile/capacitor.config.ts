import type { CapacitorConfig } from "@capacitor/cli";
import path from "node:path";

const config: CapacitorConfig = {
  appId: "com.camp-404.app",
  appName: "Camp 404",
  // Bundled static export from apps/web (`MOBILE_BUILD=1 next build`).
  webDir: path.resolve(__dirname, "../web/out"),
  ios: {
    contentInset: "always",
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#000000",
    },
    FirebaseMessaging: {
      presentationOptions: ["alert", "sound"],
    },
  },
};

export default config;
