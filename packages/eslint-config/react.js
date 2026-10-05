import reactHooks from "eslint-plugin-react-hooks";
import base from "./index.js";

const recommended = reactHooks.configs.flat.recommended;

// The two classic Rules of Hooks keep their weight: breaking rules-of-hooks
// is a bug, so it is an error; exhaustive-deps warns, and a deliberate
// exception carries an `eslint-disable-next-line` with its reason.
const CLASSIC = new Set(["react-hooks/rules-of-hooks", "react-hooks/exhaustive-deps"]);

// v7's `recommended` also carries the React Compiler rules (refs, purity,
// set-state-in-effect, static-components, ...). The code predates them and
// trips them in many places, most of them harmless, so they are rolled out as
// warnings: they show where the compiler would bail out, without failing CI.
// Raise one to "error" here once the code it flags has been cleaned up.
const rules = Object.fromEntries(
  Object.entries(recommended.rules).map(([rule, level]) => [
    rule,
    CLASSIC.has(rule) ? level : "warn",
  ]),
);

// React packages and apps: the base rules plus the Rules of Hooks.
export default [
  ...base,
  {
    files: ["**/*.{js,jsx,ts,tsx,mjs,cjs}"],
    plugins: recommended.plugins,
    rules,
  },
];
