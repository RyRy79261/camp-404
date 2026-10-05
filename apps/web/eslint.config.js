import base from "@camp404/eslint-config/next";

export default [
  ...base,
  {
    ignores: ["**/.next/**", "**/out/**", "**/dist/**"],
  },
];
