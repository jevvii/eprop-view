import { defineConfig, globalIgnores } from "eslint/config";
import nextPlugin from "@next/eslint-plugin-next";
import tseslintPlugin from "@typescript-eslint/eslint-plugin";
import tseslintParser from "@typescript-eslint/parser";

const eslintConfig = defineConfig([
  {
    name: "next/recommended",
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
    },
  },
  {
    name: "next/core-web-vitals",
    rules: {
      "@next/next/no-html-link-for-pages": "error",
      "@next/next/no-sync-scripts": "error",
    },
  },
  {
    name: "typescript",
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tseslintParser,
    },
    plugins: {
      "@typescript-eslint": tseslintPlugin,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
