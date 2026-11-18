import { createHash } from 'node:crypto'
import type { DamageType, Point } from '@/app/types'

/**
 * Dataset export formatting.
 *
 * Splits are keyed by structure, never by image: repeat visits and adjacent
 * frames of the same building would otherwise leak between train and test and
 * inflate every metric reported from the dataset.
 */

export const CLASS_INDEX: Record<Exclude<DamageType, 'none'>, number> = {
  crack: 0,
  corrosion: 1,
  spalling: 2,
  deformation: 3,
  leakage: 4,
}

export type Split = 'train' | 'val' | 'test'

/** YOLO-seg row: class followed by normalised polygon coordinates. */
export function toYoloSegLine(damageType: Exclude<DamageType, 'none'>, polygon: Point[]): string {
  const coordinates = polygon
    .map((point) => `${point.x.toFixed(6)} ${point.y.toFixed(6)}`)
    .join(' ')
  return `${CLASS_INDEX[damageType]} ${coordinates}`
}

/** Deterministic PRNG so a seed reproduces the same split. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function assignSplits(rows: { structureKey: string }[], seed: number): Split[] {
  const keys = [...new Set(rows.map((row) => row.structureKey))].sort()
  const random = mulberry32(seed)

  const shuffled = [...keys]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  const assignment = new Map<string, Split>()
  const total = shuffled.length

  shuffled.forEach((key, index) => {
    if (total >= 3) {
      // Guarantee at least one structure in each split.
      if (index === 0) assignment.set(key, 'val')
      else if (index === 1) assignment.set(key, 'test')
      else if (index < 2 + Math.ceil((total - 2) * 0.7)) assignment.set(key, 'train')
      else assignment.set(key, index % 2 === 0 ? 'val' : 'test')
    } else {
      assignment.set(key, index === 0 ? 'train' : 'val')
    }
  })

  return rows.map((row) => assignment.get(row.structureKey) ?? 'train')
}

export interface ManifestImage {
  id: string
  structureKey: string
  approved: number
  negativeOnly: boolean
  widthOmitted: number
  classes?: Record<string, number>
  scaleSource?: string
  gsdKnown?: boolean
}

export interface Manifest {
  generatedAt: string
  seed: number
  imageCount: number
  totalApprovedAnnotations: number
  negativeImageCount: number
  widthOmittedCount: number
  structureCount: number
  classCounts: Record<string, number>
  gsdCoverage: number
  scaleSourceDistribution: Record<string, number>
  contentHash: string
  images: ManifestImage[]
}

export function buildManifest(input: {
  images: ManifestImage[]
  seed: number
  generatedAt: string
}): Manifest {
  const classCounts: Record<string, number> = {}
  const scaleSourceDistribution: Record<string, number> = {}
  let gsdKnownCount = 0

  for (const image of input.images) {
    for (const [name, count] of Object.entries(image.classes ?? {})) {
      classCounts[name] = (classCounts[name] ?? 0) + count
    }
    const source = image.scaleSource ?? 'unknown'
    scaleSourceDistribution[source] = (scaleSourceDistribution[source] ?? 0) + 1
    if (image.gsdKnown) gsdKnownCount++
  }

  const contentHash = createHash('sha256')
    .update(
      JSON.stringify({
        seed: input.seed,
        images: input.images.map((image) => ({
          id: image.id,
          structureKey: image.structureKey,
          approved: image.approved,
          negativeOnly: image.negativeOnly,
        })),
      })
    )
    .digest('hex')
    .slice(0, 16)

  return {
    generatedAt: input.generatedAt,
    seed: input.seed,
    imageCount: input.images.length,
    totalApprovedAnnotations: input.images.reduce((sum, image) => sum + image.approved, 0),
    negativeImageCount: input.images.filter((image) => image.negativeOnly).length,
    widthOmittedCount: input.images.reduce((sum, image) => sum + image.widthOmitted, 0),
    structureCount: new Set(input.images.map((image) => image.structureKey)).size,
    classCounts,
    gsdCoverage: input.images.length === 0 ? 0 : gsdKnownCount / input.images.length,
    scaleSourceDistribution,
    contentHash,
    images: input.images,
  }
}
