import base from "@camp404/eslint-config";

export default [
  ...base,
  {
    ignores: ["**/.next/**", "**/out/**", "**/dist/**"],
  },
  {
    // The public site must never reach the members' search (#350): it reads
    // the stored text of chapters with their members-only parts, meetings
    // and announcements. This site reads only chapters already cut for the
    // public (listPublicChapters, getPublicChapter).
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@camp404/db/search",
              message:
                "The public guide never searches stored text: that is the members' Ctrl+K, behind the member gate in apps/web.",
            },
          ],
          patterns: [
            {
              group: ["@camp404/db/src/search*"],
              message:
                "The public guide never searches stored text: that is the members' Ctrl+K, behind the member gate in apps/web.",
            },
          ],
        },
      ],
    },
  },
];
