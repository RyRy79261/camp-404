import nextPlugin from "@next/eslint-plugin-next";
import react from "./react.js";

// Next.js apps: the React rules plus Next's own (core-web-vitals).
export default [
  ...react,
  {
    files: ["**/*.{js,jsx,ts,tsx,mjs,cjs}"],
    ...nextPlugin.configs["core-web-vitals"],
  },
  {
    // A unit test renders a plain <a> as a fixture (a Sign out link handed to
    // a layout); it never navigates, so next/link has nothing to add there.
    files: ["**/__tests__/**", "**/*.test.{ts,tsx}"],
    rules: { "@next/next/no-html-link-for-pages": "off" },
  },
];
