import type { AIModel } from '@/app/types'

export function supportsLocalInference(model: Pick<AIModel, 'format' | 'task'>): boolean {
  return model.format === 'heuristic' && model.task === 'detection'
}
