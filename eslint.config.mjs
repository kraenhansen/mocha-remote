import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import expo from "eslint-config-expo/flat.js";
import prettier from "eslint-config-prettier/flat";
import { defineConfig } from "eslint/config";
import globals from "globals";

// Migrated from the "eslintConfig" sections of the package.json files, which
// ESLint stopped reading in v9 and dropped support for entirely in v10.
export default defineConfig([
  {
    ignores: ["**/dist/"],
  },
  // Flat config only picks up JavaScript unless TypeScript is matched explicitly
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
  },
  js.configs.recommended,
  ...tseslint.configs["flat/recommended"],
  prettier,
  {
    languageOptions: {
      parser: tsParser,
    },
    rules: {
      "no-console": "warn",
      // Rules that ESLint 10 and typescript-eslint 8 added to their recommended
      // presets. Keeping them off preserves the rule set we had on ESLint 8 -
      // adopting them needs source changes beyond a dependency update.
      "preserve-caught-error": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-expressions": "off",
    },
  },
  {
    files: ["scripts/*.js"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["**/*.test.js"],
    languageOptions: { globals: globals.mocha },
  },

  // packages/cli
  {
    files: ["packages/cli/**"],
    languageOptions: {
      sourceType: "module",
      globals: globals.node,
    },
  },
  {
    files: ["packages/cli/src/**/*.test.ts"],
    languageOptions: { globals: { ...globals.node, ...globals.mocha } },
  },

  // packages/client
  {
    files: ["packages/client/**"],
    languageOptions: { sourceType: "module" },
  },
  {
    files: ["packages/client/rollup.config.js"],
    languageOptions: { globals: globals.node },
  },

  // packages/combined
  {
    files: ["packages/combined/**"],
    languageOptions: { globals: globals.node },
  },

  // packages/mocha
  {
    files: ["packages/mocha/**"],
    languageOptions: {
      sourceType: "commonjs",
      globals: globals.commonjs,
    },
  },
  {
    files: ["packages/mocha/webpack.config.js"],
    languageOptions: { globals: { ...globals.commonjs, ...globals.node } },
  },

  // examples/expo - used to extend "@react-native", which is eslintrc-only and
  // whose plugins reach for APIs that ESLint 10 removed. eslint-config-expo is
  // the config Expo recommends and ships a flat entry point. Its config objects
  // carry no "files" of their own, so scope them to the example here.
  //
  // The react version has to be pinned rather than left at eslint-config-expo's
  // "detect": detecting it calls context.getFilename(), which ESLint 10 removed,
  // and that throws before any rule runs. Pinning is what eslint-plugin-react
  // recommends anyway, since detection walks the file system on every run.
  {
    files: ["examples/expo/**"],
    extends: [expo],
    settings: { react: { version: "18.2" } },
  },
  {
    files: ["examples/expo/*.config.js"],
    languageOptions: { sourceType: "commonjs", globals: globals.node },
  },
]);
