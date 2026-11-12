import { ESLint } from 'eslint'
const eslint = new ESLint()
for (const path of ['src/app/actions/gemini-analysis.ts','src/components/ai/ai-analysis-panel.tsx']) {
  const config = await eslint.calculateConfigForFile(path)
  if (!config?.languageOptions?.parser || !config.rules['@typescript-eslint/no-empty-object-type']) {
    throw new Error(`Application TypeScript is not covered by ESLint: ${path}`)
  }
}
console.log('PASS: server TypeScript and React TSX are linted')
