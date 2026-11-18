/**
 * Keep only the Linux x64 ONNX Runtime binary before a build.
 *
 * onnxruntime-node ships macOS, Windows and arm64 builds (~294 MB in total).
 * Vercel copies the whole package into any function that references it, which
 * pushes the saved-photo route over the 250 MB uncompressed limit on this plan.
 * The Preview runtime is linux-x64, so the rest is dead weight.
 */
import fs from 'node:fs'
import path from 'node:path'

const root = path.join(process.cwd(), 'node_modules', 'onnxruntime-node', 'bin')
if (!fs.existsSync(root)) process.exit(0)

let removed = 0
for (const napi of fs.readdirSync(root)) {
  const napiDir = path.join(root, napi)
  if (!fs.statSync(napiDir).isDirectory()) continue
  for (const platform of fs.readdirSync(napiDir)) {
    const platformDir = path.join(napiDir, platform)
    if (!fs.statSync(platformDir).isDirectory()) continue
    if (platform === 'linux') {
      for (const arch of fs.readdirSync(platformDir)) {
        if (arch === 'x64') continue
        fs.rmSync(path.join(platformDir, arch), { recursive: true, force: true })
        removed += 1
      }
    } else {
      fs.rmSync(platformDir, { recursive: true, force: true })
      removed += 1
    }
  }
}
console.log(`prune-onnxruntime: removed ${removed} non-linux-x64 binary directories`)
