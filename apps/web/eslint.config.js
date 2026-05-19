import base from "@camp404/eslint-config";

export default [
  ...base,
  {
    ignores: ["**/.next/**", "**/out/**", "**/dist/**"],
  },
];
