import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// Flat config built from the plugins directly. We avoid FlatCompat +
// eslint-config-next, which crashes on ESLint 9 (circular structure in the
// bundled react config). This gives the Next preset rules (recommended +
// core-web-vitals), react-hooks, typescript-eslint, and the CLAUDE.md "no any".
export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "prisma/migrations/**",
      "next-env.d.ts",
      // BMAD planning/workflow output (git-ignored scaffold, not application source).
      "_bmad-output/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    plugins: {
      "@next/next": nextPlugin,
      "react-hooks": reactHooks,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...reactHooks.configs.recommended.rules,
      // CLAUDE.md convention: no `any`. tsconfig strict can't enforce this alone.
      "@typescript-eslint/no-explicit-any": "error",
      // Allow deliberately-unused args/vars when prefixed with "_" (fixed-arity
      // callback signatures like useActionState, interface params a stub ignores).
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
);
