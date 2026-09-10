import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

// Conventions that hold without type information.
const conventionRules = {
  // `any` is off the table — type it `unknown` at the edge and narrow it.
  "@typescript-eslint/no-explicit-any": "error",
  // Stop strengthening — a `!` marks a type that is too weak.
  "@typescript-eslint/no-non-null-assertion": "error",
  // Model a closed set as a string literal union.
  "no-restricted-syntax": [
    "error",
    {
      selector: "TSEnumDeclaration",
      message:
        'Model a closed set as a string literal union — type Role = "admin" | "member" — not an enum.',
    },
  ],
  // Debug logging stays out of commits.
  "no-console": ["error", { allow: ["warn", "error"] }],
};

// Conventions that need type information. Applied only to the directories
// covered by a tsconfig: api/src (api/tsconfig.json) and web/src
// (web/tsconfig.app.json). Everything else — api/scripts, web/e2e, the build
// configs — sits in no tsconfig and gets the untyped subset above.
const typeAwareConventionRules = {
  // Close every match on a union.
  "@typescript-eslint/switch-exhaustiveness-check": "error",
  // A cast the compiler already proves.
  "@typescript-eslint/no-unnecessary-type-assertion": "error",
  // `satisfies` over `as` — flags the casts the compiler cannot prove, and
  // leaves the widening ones (`as const`, narrowing to a subtype) alone.
  "@typescript-eslint/no-unsafe-type-assertion": "error",
  // Narrow `unknown` before using it.
  "@typescript-eslint/no-unsafe-assignment": "error",
  "@typescript-eslint/no-unsafe-member-access": "error",
  "@typescript-eslint/no-unsafe-argument": "error",
  "@typescript-eslint/no-unsafe-call": "error",
  "@typescript-eslint/no-unsafe-return": "error",
};

export default defineConfig([
  globalIgnores([
    "**/dist/",
    "api/drizzle/",
    "api/test-fixtures/",
    "web/test-results/",
    "web/playwright-report/",
    ".playwright-mcp/",
    "**/*.js",
    "**/*.cjs",
    "**/*.mjs",
  ]),

  // api — Node
  {
    files: ["api/**/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.node,
    },
    rules: conventionRules,
  },
  {
    files: ["api/src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: ["./api/tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: typeAwareConventionRules,
  },

  // web — browser, React
  {
    files: ["web/**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      ...conventionRules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: ["web/src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        project: ["./web/tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: typeAwareConventionRules,
  },

  // Writing to stdout is what these files are for. The rule exists to catch
  // debug residue, so it is scoped away from the CLI rather than weakened.
  {
    files: ["api/src/index.ts", "api/scripts/**/*.ts"],
    rules: { "no-console": "off" },
  },

  // Test code. The conventions above describe a domain model — a `!` or a cast
  // on a fixture you constructed two lines earlier is not a weak type, and it
  // fails loudly in CI either way. Must stay last: these paths sit inside
  // api/src and web/src, so an earlier block would re-enable the rules.
  {
    files: [
      "**/*.test.{ts,tsx}",
      "**/*.spec.{ts,tsx}",
      "web/e2e/**/*.{ts,tsx}",
      "web/src/test/**/*.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-restricted-syntax": "off",
      "@typescript-eslint/switch-exhaustiveness-check": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-unsafe-type-assertion": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },

  // Files still carrying casts at a boundary, exempt from
  // `no-unsafe-type-assertion` until #278 parses each one.
  //
  // This list only shrinks. Adding a file to it is not the way to make a new
  // cast pass — the rule holds everywhere else from today, and #278 names the
  // batch each file belongs to. Delete the block when the list empties.
  {
    files: [
      "api/src/archive/repository.ts",
      "api/src/chat-reader.ts",
      "api/src/index.ts",
      "api/src/list-counts.ts",
      "api/src/list-pagination.ts",
      "api/src/metadata/repository.ts",
      "api/src/metadata/tags.ts",
      "api/src/plugins/claude-code/actions.ts",
      "api/src/plugins/claude-code/plugin.ts",
      "api/src/plugins/visualize-widget.ts",
      "web/src/App.tsx",
      "web/src/chat/sort/sortPreference.ts",
      "web/src/chat/useChatCounts.ts",
      "web/src/chat/useCursorNavigation.ts",
      "web/src/chat/useFilteredTotal.ts",
      "web/src/chat/usePaginatedChats.ts",
      "web/src/conversation/readingState.ts",
      "web/src/tags/TagStrip.tsx",
      "web/src/tags/palette.ts",
      "web/src/tags/tagModePreference.ts",
      "web/src/tags/useTags.ts",
    ],
    rules: { "@typescript-eslint/no-unsafe-type-assertion": "off" },
  },
]);
