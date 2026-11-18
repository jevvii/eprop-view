// Fingerprint every DamSegment frame so related views and duplicates can be
// kept in one split. dHash (64-bit) is cheap and tolerant of re-compression.
// Usage: node ml/hash_images.mjs <images-dir> <out.json>
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const dir = process.argv[2]
const out = process.argv[3]
const names = fs.readdirSync(dir).filter((n) => /\.(jpe?g|png)$/i.test(n)).sort()

async function fingerprint(name) {
  const file = path.join(dir, name)
  const img = sharp(file).rotate()
  const meta = await img.metadata()
  const { data } = await sharp(file)
    .rotate()
    .greyscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true })
  let bits = ''
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = data[y * 9 + x]
      const right = data[y * 9 + x + 1]
      bits += left > right ? '1' : '0'
    }
  }
  let hex = ''
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16)
  return { name, width: meta.width, height: meta.height, dhash: hex }
}

const results = []
const concurrency = 12
let cursor = 0
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (cursor < names.length) {
      const i = cursor++
      results.push(await fingerprint(names[i]))
    }
  }),
)
results.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
fs.writeFileSync(out, JSON.stringify({ dir, count: results.length, images: results }, null, 0))
console.log(`hashed ${results.length} images -> ${out}`)
