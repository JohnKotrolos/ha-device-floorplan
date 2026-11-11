// Lint rules for the card and the Floorplan Editor (run in GitHub Actions).
import globals from "globals";

export default [
  { ignores: ["docs/**", "demo/device_floorplan_static/**"] },
  {
    files: ["**/*.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { ...globals.browser } },
    rules: {
      "no-undef": "error",
      "no-unreachable": "error",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "no-redeclare": "error",
      "no-self-assign": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },
];
