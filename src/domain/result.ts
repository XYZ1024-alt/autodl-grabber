/** Why a call to AutoDL did not produce a usable value. The runner decides what to do per kind. */
export type FailureKind =
  /** Login expired or missing. */
  | 'auth'
  /** The account is not allowed to do this. */
  | 'permission'
  /** The platform asks for a human verification. Never bypassed. */
  | 'captcha'
  | 'balance'
  | 'real-name'
  | 'unpaid-orders'
  /** The host ran out of GPUs between listing and creating. Definitely nothing was created. */
  | 'sold-out'
  | 'rate-limit'
  /** Network error, timeout or 5xx on a read. Safe to repeat. */
  | 'transient'
  /** A create request was sent and its outcome is unknown. Must be reconciled, never blindly repeated. */
  | 'ambiguous'
  /** The response no longer has the shape this script was written against. */
  | 'invalid-response'
  /** Any other definite refusal by the platform. */
  | 'rejected'

export type Failure = { kind: FailureKind; code: string; message: string }

export type Result<T> = { ok: true; value: T } | { ok: false; failure: Failure }

export const ok = <T>(value: T): Result<T> => ({ ok: true, value })

export const fail = (kind: FailureKind, message: string, code = ''): Result<never> => ({
  ok: false,
  failure: { kind, code, message },
})
