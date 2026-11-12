import nextPlugin from "@next/eslint-plugin-next";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "node_modules/**",
      "native/**",
      "next-env.d.ts",
      "docs/**",
      "supabase/**",
    ],
  },
  ...nextTs,
  {
    files: ["**/*.{ts,tsx}"],
    // Dynamic Supabase relations still have legacy `any` annotations. Surface
    // them while enforcing the parser and correctness rules on every TS file.
    rules: { "@typescript-eslint/no-explicit-any": "warn" },
  },
  nextPlugin.configs["core-web-vitals"],
];

export default eslintConfig;
