/**
 * Held-out evaluation of the two crack methods on identical images.
 *
 * Both methods run through their real production modules:
 *   heuristic  -> src/app/lib/ai/inference-worker.ts (runDetection)
 *   trained    -> src/app/lib/ai/onnx-detector.ts    (runTrainedDetection)
 *
 * The trained detector is run once per image at a floor threshold and the
 * candidate list is then filtered at each threshold. That reproduces exactly
 * what the deployed path emits at that threshold, because the deployed path
 * also sorts by score and caps at 50.
 *
 * Usage: npx tsx ml/evaluate.ts --split dataset/split.json --images <dir> \
 *          --split-name test --out dataset/runs/r1/eval_test.json [--thresh 0.05,0.1,...]
 */
import fs from 'node:fs'
import path from 'node:path'
import { runDetection, type InferenceResult } from '@/app/lib/ai/inference-worker'
import { runTrainedDetection } from '@/app/lib/ai/onnx-detector'
import { calculateIoU } from '@/app/lib/ai/preprocessing'
import type { AIModel, BoundingBox } from '@/app/types'

const FLOOR = 0.001

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) {
    if (fallback === undefined) throw new Error(`missing --${name}`)
    return fallback
  }
  return process.argv[i + 1]
}

const HEURISTIC_MODEL: AIModel = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Edge-Gradient Heuristic',
  version: '2.0.0',
  task: 'detection',
  format: 'heuristic',
  storage_path: null,
  labels: ['crack', 'corrosion', 'spalling'],
  is_active: true,
  architecture: 'heuristic',
  input_width: 640,
  input_height: 640,
  confidence_threshold: 0.25,
  iou_threshold: 0.45,
  preprocessing: {},
  metadata: { engine: 'heuristic', non_ml: true },
  created_at: new Date(0).toISOString(),
}

const TRAINED_MODEL: AIModel = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'DamSegment Crack Detector',
  version: '1.0.0',
  task: 'detection',
  format: 'onnx',
  storage_path: 'models/crack-ssdlite320-damsegment-v1.onnx',
  labels: ['crack'],
  is_active: true,
  architecture: 'ssdlite320_mobilenet_v3_large',
  input_width: 320,
  input_height: 320,
  confidence_threshold: FLOOR,
  iou_threshold: 0.5,
  preprocessing: {},
  metadata: { artifact: 'crack-ssdlite320-damsegment-v1' },
  created_at: new Date(0).toISOString(),
}

interface Pred {
  bbox: BoundingBox
  score: number
}

interface MatchResult {
  tp: number
  fp: number
  fn: number
}

/** Greedy score-ordered matching, one prediction to at most one ground truth. */
function match(preds: Pred[], gts: BoundingBox[], iouThreshold: number): MatchResult {
  const used = new Array(gts.length).fill(false)
  let tp = 0
  const ordered = [...preds].sort((a, b) => b.score - a.score)
  for (const p of ordered) {
    let best = -1
    let bestIou = 0
    for (let i = 0; i < gts.length; i++) {
      if (used[i]) continue
      const iou = calculateIoU(p.bbox, gts[i])
      if (iou > bestIou) {
        bestIou = iou
        best = i
      }
    }
    if (best >= 0 && bestIou >= iouThreshold) {
      used[best] = true
      tp += 1
    }
  }
  return { tp, fp: preds.length - tp, fn: gts.length - tp }
}

function prf(tp: number, fp: number, fn: number) {
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp)
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn)
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
  return {
    precision: Number(precision.toFixed(4)),
    recall: Number(recall.toFixed(4)),
    f1: Number(f1.toFixed(4)),
  }
}

async function main() {
  const splitFile = arg('split')
  const imagesDir = arg('images')
  const splitName = arg('split-name')
  const out = arg('out')
  const skipTrained = process.argv.includes('--skip-trained')
  const thresholds = arg('thresh', '0.05,0.1,0.15,0.2,0.25,0.3,0.35,0.4,0.5,0.6')
    .split(',')
    .map(Number)

  const split = JSON.parse(fs.readFileSync(splitFile, 'utf8'))
  const records = split.splits[splitName].images as Array<{
    name: string
    kind: 'positive' | 'negative'
    boxes: Array<{ cls: number; x: number; y: number; w: number; h: number }>
  }>

  const perImage: Array<Record<string, unknown>> = []
  const trainedLatencies: number[] = []
  const heuristicLatencies: number[] = []
  const totals = {
    heuristic: { tp: 0, fp: 0, fn: 0, positives: 0, photoHits: 0, negPhotos: 0, negAlerts: 0, negFpBoxes: 0 },
    trained: Object.fromEntries(
      thresholds.map((t) => [t, { tp: 0, fp: 0, fn: 0, positives: 0, photoHits: 0, negPhotos: 0, negAlerts: 0, negFpBoxes: 0 }]),
    ),
  }

  for (let index = 0; index < records.length; index++) {
    const rec = records[index]
    const bytes = fs.readFileSync(path.join(imagesDir, `${rec.name}.jpg`))
    const gts: BoundingBox[] = rec.boxes
      .filter((b) => b.cls === 0)
      .map((b) => ({ x: b.x, y: b.y, width: b.w, height: b.h }))

    const heuristic: InferenceResult = await runDetection(bytes, HEURISTIC_MODEL)
    heuristicLatencies.push(heuristic.latencyMs)
    const hPreds: Pred[] = heuristic.detections
      .filter((d) => d.damage_type === 'crack' && d.bbox)
      .map((d) => ({ bbox: d.bbox as BoundingBox, score: d.confidence }))
    const hMatch = match(hPreds, gts, 0.5)

    totals.heuristic.tp += hMatch.tp
    totals.heuristic.fp += hMatch.fp
    totals.heuristic.fn += hMatch.fn
    if (gts.length > 0) {
      totals.heuristic.positives += 1
      if (hPreds.length > 0) totals.heuristic.photoHits += 1
    } else {
      totals.heuristic.negPhotos += 1
      if (hPreds.length > 0) totals.heuristic.negAlerts += 1
      totals.heuristic.negFpBoxes += hPreds.length
    }

    let tPreds: Pred[] = []
    if (!skipTrained) {
      const trained = await runTrainedDetection(bytes, TRAINED_MODEL)
      trainedLatencies.push(trained.latencyMs)
      tPreds = trained.detections.map((d) => ({ bbox: d.bbox as BoundingBox, score: d.confidence }))
    }

    const perThreshold: Record<string, unknown> = {}
    for (const t of thresholds) {
      const filtered = tPreds.filter((p) => p.score >= t)
      const m = match(filtered, gts, 0.5)
      const acc = totals.trained[t]
      acc.tp += m.tp
      acc.fp += m.fp
      acc.fn += m.fn
      if (gts.length > 0) {
        acc.positives += 1
        if (filtered.length > 0) acc.photoHits += 1
      } else {
        acc.negPhotos += 1
        if (filtered.length > 0) acc.negAlerts += 1
        acc.negFpBoxes += filtered.length
      }
      perThreshold[t] = { preds: filtered.length, ...m }
    }

    perImage.push({
      name: rec.name,
      kind: rec.kind,
      gt_cracks: gts.length,
      gt_boxes: gts,
      heuristic: {
        preds: hPreds.length, ...hMatch,
        scores: hPreds.map((p) => Number(p.score.toFixed(3))),
        boxes: hPreds.map((p) => ({ bbox: p.bbox, score: Number(p.score.toFixed(4)) })),
      },
      trained: {
        preds: tPreds.length, perThreshold,
        boxes: tPreds.map((p) => ({ bbox: p.bbox, score: Number(p.score.toFixed(4)) })),
        topScores: tPreds.slice(0, 10).map((p) => Number(p.score.toFixed(3))),
      },
    })
    if ((index + 1) % 25 === 0) process.stderr.write(`  ${index + 1}/${records.length}\n`)
  }

  const summarise = (acc: { tp: number; fp: number; fn: number; positives: number; photoHits: number; negPhotos: number; negAlerts: number; negFpBoxes: number }) => ({
    boxes: { tp: acc.tp, fp: acc.fp, fn: acc.fn, ...prf(acc.tp, acc.fp, acc.fn) },
    photo_recall_any_alert: acc.positives ? acc.photoHits / acc.positives : 0,
    positives: acc.positives,
    negative_photos: acc.negPhotos,
    negative_photos_with_alert: acc.negAlerts,
    false_alerts_per_negative_photo: acc.negPhotos ? Number((acc.negAlerts / acc.negPhotos).toFixed(3)) : null,
    false_alert_boxes_per_negative_photo: acc.negPhotos ? Number((acc.negFpBoxes / acc.negPhotos).toFixed(3)) : null,
  })

  const pct = (arr: number[], p: number) => arr.length ? [...arr].sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))] : null
  const latency = (arr: number[]) => arr.length ? {
    n: arr.length,
    mean_ms: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length),
    p50_ms: pct(arr, 50),
    p95_ms: pct(arr, 95),
    max_ms: Math.max(...arr),
  } : null

  const result = {
    split: splitName,
    latency_ms: { trained: latency(trainedLatencies), heuristic: latency(heuristicLatencies) },
    images: records.length,
    positives: records.filter((r) => r.kind === 'positive').length,
    negatives: records.filter((r) => r.kind === 'negative').length,
    iou_threshold: 0.5,
    heuristic: { threshold: HEURISTIC_MODEL.confidence_threshold, ...summarise(totals.heuristic) },
    trained: skipTrained ? null : Object.fromEntries(
      thresholds.map((t) => [t, { threshold: t, ...summarise(totals.trained[t]) }]),
    ),
    per_image: perImage,
  }
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify(result, null, 1))
  console.log(JSON.stringify({
    split: result.split, images: result.images, positives: result.positives, negatives: result.negatives,
    heuristic: result.heuristic,
    trained: result.trained,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
