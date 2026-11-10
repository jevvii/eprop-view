import 'server-only'

/**
 * Gemini client.
 *
 * Deliberately a thin `fetch` wrapper rather than an SDK dependency: the API
 * surface used here is one endpoint with a JSON schema, and keeping the
 * dependency graph small keeps CI and the Vercel build predictable.
 *
 * Rules enforced here (see docs/capstone_v2_scope_contract.md §6):
 *  - the key is read server-side only and never returned to a caller
 *  - every response is validated by the caller's parser before use
 *  - a 429 falls through to the next model, and only then to the caller's
 *    deterministic fallback
 *  - no live AR frame path may call this module
 */

export const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite'] as const
export type GeminiModel = (typeof GEMINI_MODELS)[number]

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

export const GEMINI_DATA_NOTICE =
  'Processed by Google Gemini on the free tier, which may review inputs to improve its products. Do not submit confidential or client-identifiable imagery.'

export class GeminiUnavailableError extends Error {
  readonly code: 'not_configured' | 'rate_limited' | 'invalid_response' | 'transport'
  readonly status?: number

  constructor(
    message: string,
    code: GeminiUnavailableError['code'],
    status?: number
  ) {
    super(message)
    this.name = 'GeminiUnavailableError'
    this.code = code
    this.status = status
  }
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY)
}

interface GenerateOptions {
  prompt: string
  schema: Record<string, unknown>
  /** Base64-encoded image data, no data: prefix. */
  image?: { data: string; mimeType: string }
  models?: readonly string[]
  timeoutMs?: number
  temperature?: number
}

interface GeminiPart {
  text?: string
  inlineData?: { mimeType: string; data: string }
}

interface GeminiCandidate {
  content?: { parts?: GeminiPart[] }
  finishReason?: string
}

interface GeminiResponse {
  candidates?: GeminiCandidate[]
  promptFeedback?: { blockReason?: string }
  error?: { message?: string; status?: string; code?: number }
}

function extractText(payload: GeminiResponse): string {
  const candidate = payload.candidates?.[0]
  const text = candidate?.content?.parts?.map((part) => part.text ?? '').join('').trim()

  if (!text) {
    const blocked = payload.promptFeedback?.blockReason
    const finish = candidate?.finishReason
    throw new GeminiUnavailableError(
      `Gemini returned no usable text${blocked ? ` (blocked: ${blocked})` : ''}${finish ? ` (finish: ${finish})` : ''}.`,
      'invalid_response'
    )
  }

  return text
}

async function callModel(
  model: string,
  options: GenerateOptions,
  apiKey: string
): Promise<string> {
  const parts: GeminiPart[] = [{ text: options.prompt }]
  if (options.image) {
    parts.push({
      inlineData: { mimeType: options.image.mimeType, data: options.image.data },
    })
  }

  let response: Response
  try {
    response = await fetch(`${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: options.schema,
          temperature: options.temperature ?? 0.2,
        },
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      cache: 'no-store',
    })
  } catch (error) {
    throw new GeminiUnavailableError(
      `Gemini request failed: ${error instanceof Error ? error.message : 'network error'}`,
      'transport'
    )
  }

  if (response.status === 429) {
    throw new GeminiUnavailableError('Gemini free-tier quota exhausted.', 'rate_limited', 429)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    const detail = body.slice(0, 300)
    throw new GeminiUnavailableError(
      `Gemini responded ${response.status}${detail ? `: ${detail}` : ''}`,
      'transport',
      response.status
    )
  }

  const payload = (await response.json()) as GeminiResponse

  if (payload.error) {
    throw new GeminiUnavailableError(payload.error.message ?? 'Gemini error', 'transport')
  }

  return extractText(payload)
}

/**
 * Generate structured JSON, falling through the model chain on rate limits.
 *
 * Transport and validation errors do NOT fall through: a malformed response is a
 * failed call, and silently retrying it against another model would hide the
 * defect. Only 429 advances the chain.
 */
export async function generateStructured<T>(
  options: GenerateOptions & { parse: (value: unknown) => T }
): Promise<{ value: T; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new GeminiUnavailableError('GEMINI_API_KEY is not configured.', 'not_configured')
  }

  const chain = options.models ?? GEMINI_MODELS
  let lastError: GeminiUnavailableError | null = null

  for (const model of chain) {
    try {
      const text = await callModel(model, options, apiKey)

      let parsedJson: unknown
      try {
        parsedJson = JSON.parse(text)
      } catch {
        throw new GeminiUnavailableError('Gemini returned text that is not valid JSON.', 'invalid_response')
      }

      let value: T
      try {
        value = options.parse(parsedJson)
      } catch (error) {
        throw new GeminiUnavailableError(
          `Gemini response failed validation: ${error instanceof Error ? error.message : 'unknown schema error'}`,
          'invalid_response'
        )
      }

      return { value, model }
    } catch (error) {
      if (error instanceof GeminiUnavailableError && error.code === 'rate_limited') {
        lastError = error
        continue
      }
      throw error
    }
  }

  throw lastError ?? new GeminiUnavailableError('All Gemini models are rate limited.', 'rate_limited')
}
