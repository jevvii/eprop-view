/**
 * Action results.
 *
 * Next strips the message from a thrown server-action error in production and
 * replaces it with React error #441 plus a digest. Any expected refusal — a
 * locked record, a missing link, a failed guard — therefore reaches the user as
 * an opaque code. Actions return these refusals as values instead; only genuine
 * faults (auth, infrastructure) still throw.
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

export function actionOk<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

export function actionRefuse(error: string): ActionResult<never> {
  return { ok: false, error }
}

export function isActionResult(value: unknown): value is ActionResult<unknown> {
  return typeof value === 'object' && value !== null && 'ok' in value
}

/** True when the browser received a sanitised server error rather than a message. */
export function isSanitisedServerError(message: string): boolean {
  return /Server Components render|Minified React error|An error occurred in the Server/i.test(
    message
  )
}

export const SANITISED_SERVER_MESSAGE =
  'The server rejected this action and production hides the reason. Retry once; if it persists, check the deployment logs for the request digest.'
