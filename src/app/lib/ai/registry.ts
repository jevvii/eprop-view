import type { AIModel } from '@/app/types'

/** Stable identifier of the artifact this build ships. */
export const TRAINED_CRACK_ARTIFACT = 'crack-ssdlite320-damsegment-v1'

type ModelShape = Pick<AIModel, 'format' | 'task'> & { metadata?: Record<string, unknown> | null }

/**
 * The registered project-trained detector. A row is only treated as runnable
 * when it names the exact artifact this deployment carries, so an unrelated
 * `onnx` registry entry can never be selected as if it were the fitted model.
 */
export function isTrainedCrackDetector(model: ModelShape): boolean {
  const metadata = (model.metadata ?? {}) as Record<string, unknown>
  return model.format === 'onnx' && model.task === 'detection' && metadata.artifact === TRAINED_CRACK_ARTIFACT
}

export function supportsLocalInference(model: ModelShape): boolean {
  return (model.format === 'heuristic' && model.task === 'detection') || isTrainedCrackDetector(model)
}
