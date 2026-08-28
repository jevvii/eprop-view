import nextPlugin from "@next/eslint-plugin-next";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "node_modules/**",
      "next-env.d.ts",
      "docs/**",
      "supabase/**",
    ],
  },
  nextPlugin.configs["core-web-vitals"],
];

export default eslintConfig;
