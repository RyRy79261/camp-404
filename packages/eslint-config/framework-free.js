import base from "./index.js";

// For packages that hold pure domain logic (@camp404/core, @camp404/types):
// no framework, no database, no server-only module. They run the same in a
// server component, a client component, a CLI and a test, and that only
// stays true if the imports say so.
const message =
  "This package is framework-free: no React, Next.js, database or server-only imports. Put the code that needs them in the app or in @camp404/db, and pass plain values in.";

export default [
  ...base,
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            "react",
            "react-dom",
            "next",
            "server-only",
            "client-only",
          ].map((name) => ({ name, message })),
          patterns: [
            {
              group: [
                "react/*",
                "react-dom/*",
                "next/*",
                "@camp404/db",
                "@camp404/db/*",
                "@camp404/auth",
                "@camp404/auth/*",
                "@camp404/ui",
                "@camp404/ui/*",
                "drizzle-orm",
                "drizzle-orm/*",
                "@neondatabase/*",
              ],
              message,
            },
          ],
        },
      ],
    },
  },
];
