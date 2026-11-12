import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileFunction } from 'node:vm'
import ts from 'typescript'

/** Load the real server module, replacing only its external boundaries. */
export function loadServerModule<T>(url: URL, boundaries: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const filename = fileURLToPath(url)
  const nativeRequire = createRequire(url)
  const { outputText } = ts.transpileModule(readFileSync(url, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  })
  const loadedModule = { exports: {} }
  const require = (specifier: string) => {
    if (specifier === 'server-only') return {}
    return Object.hasOwn(boundaries, specifier) ? boundaries[specifier] : nativeRequire(specifier)
  }
  const names = Object.keys(globals)
  const run = compileFunction(outputText, ['exports', 'require', 'module', '__filename', '__dirname', ...names], { filename })
  run(loadedModule.exports, require, loadedModule, filename, dirname(filename), ...Object.values(globals))
  return loadedModule.exports as T
}
