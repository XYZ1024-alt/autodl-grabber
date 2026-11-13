import { type GenericSchema, type InferOutput, nullish, object, safeParse, string } from 'valibot'
import { type FailureKind, fail, ok, type Result } from '../domain/result'

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

export type RequestSpec<TSchema extends GenericSchema> = {
  method: 'GET' | 'POST'
  /** Path exactly as the AutoDL front end writes it, e.g. "api/v1/instance". */
  path: string
  query?: Record<string, string>
  body?: Json
  /** Shape of the "data" field of a successful response. */
  data: TSchema
  /**
   * How to report an outcome that cannot be known (network error, timeout, 5xx, unreadable body).
   * Reads use 'transient'. A request that changes state must use 'ambiguous'.
   */
  uncertain?: 'transient' | 'ambiguous'
  timeoutMs?: number
}

export type Http = <TSchema extends GenericSchema>(
  spec: RequestSpec<TSchema>,
) => Promise<Result<InferOutput<TSchema>>>

export type BrowserDeps = { fetch: typeof fetch; storage: Pick<Storage, 'getItem'> }

/** localStorage keys written by the AutoDL front end. Read at call time, never copied or persisted. */
export const STORAGE_KEYS = { token: 'token', user: 'user', appVersion: 'app_version' } as const

const DEFAULT_TIMEOUT_MS = 15_000

const Envelope = object({ code: string(), msg: nullish(string(), '') })

/** Response codes found in the AutoDL front end bundle. */
const KIND_BY_CODE: Record<string, FailureKind> = {
  AuthorizeFailed: 'auth',
  TORecharge: 'balance',
  TORealName: 'real-name',
  OrderUnpaidMoreThanThree: 'unpaid-orders',
  MachineGpuNumUpdateFailed: 'sold-out',
}

/**
 * Keyword fallbacks for refusals whose codes were not observed. They only ever make the task pause,
 * so a wrong guess costs a manual "resume" and nothing else.
 */
const KIND_BY_KEYWORD: [keyword: string, kind: FailureKind][] = [
  ['captcha', 'captcha'],
  ['验证码', 'captcha'],
  ['人机验证', 'captcha'],
  ['频繁', 'rate-limit'],
  ['权限', 'permission'],
]

const kindOfRefusal = (code: string, message: string): FailureKind => {
  const known = KIND_BY_CODE[code]
  if (known !== undefined) return known
  const text = `${code} ${message}`.toLowerCase()
  return KIND_BY_KEYWORD.find(([keyword]) => text.includes(keyword))?.[1] ?? 'rejected'
}

const KIND_BY_STATUS: Record<number, FailureKind> = { 401: 'auth', 403: 'permission', 429: 'rate-limit' }

export type JsonParse = { ok: true; value: Json } | { ok: false; error: string }

export const parseJson = (text: string): JsonParse => {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

const StoredUser = object({ sub_name: nullish(string(), '') })

/** Sub-accounts use a different URL prefix; the front end decides this from the stored user. */
export const isSubAccount = (storage: Pick<Storage, 'getItem'>): boolean => {
  const parsed = parseJson(storage.getItem(STORAGE_KEYS.user) ?? 'null')
  if (!parsed.ok) return false
  const user = safeParse(StoredUser, parsed.value)
  return user.success && user.output.sub_name !== ''
}

const StoredVersion = object({ version: string() })

const appVersion = (storage: Pick<Storage, 'getItem'>): string => {
  const parsed = parseJson(storage.getItem(STORAGE_KEYS.appVersion) ?? 'null')
  const stored = parsed.ok ? safeParse(StoredVersion, parsed.value) : null
  return stored?.success ? stored.output.version : '0.0.0'
}

const buildUrl = (path: string, query: Record<string, string> | undefined, subAccount: boolean): string => {
  const scoped = subAccount ? path.replace('api/v1', 'api/v1/sub_user') : path
  const search = query === undefined ? '' : `?${new URLSearchParams(query)}`
  return `/${scoped}${search}`
}

type Exchange = { status: number; text: string }

/**
 * Sends requests the way the AutoDL front end does: same origin, the login token from localStorage
 * in the Authorization header, and the front end version in AppVersion.
 */
export const createHttp =
  ({ fetch, storage }: BrowserDeps): Http =>
  async (spec) => {
    const uncertain = spec.uncertain ?? 'transient'
    const token = storage.getItem(STORAGE_KEYS.token) ?? ''
    if (token === '') return fail('auth', '未检测到登录状态')

    const controller = new AbortController()
    const timeoutMs = spec.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const exchange = async (): Promise<Result<Exchange>> => {
      try {
        const response = await fetch(buildUrl(spec.path, spec.query, isSubAccount(storage)), {
          method: spec.method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: token,
            AppVersion: appVersion(storage),
          },
          body: spec.body === undefined ? undefined : JSON.stringify(spec.body),
          credentials: 'same-origin',
          signal: controller.signal,
        })
        return ok({ status: response.status, text: await response.text() })
      } catch (error) {
        const cause = controller.signal.aborted
          ? `超过 ${timeoutMs / 1000} 秒未响应`
          : error instanceof Error
            ? error.message
            : String(error)
        return fail(uncertain, `请求未完成（${cause}）：${spec.path}`)
      } finally {
        clearTimeout(timer)
      }
    }

    const exchanged = await exchange()
    if (!exchanged.ok) return exchanged
    const { status, text } = exchanged.value

    const statusKind = KIND_BY_STATUS[status]
    if (statusKind !== undefined) return fail(statusKind, `HTTP ${status}：${spec.path}`, String(status))
    if (status >= 500) return fail(uncertain, `服务器错误 HTTP ${status}：${spec.path}`, String(status))

    const unreadable = uncertain === 'ambiguous' ? 'ambiguous' : 'invalid-response'
    const json = parseJson(text)
    if (!json.ok) return fail(unreadable, `响应不是 JSON（HTTP ${status}，${json.error}）：${spec.path}`)
    const envelope = safeParse(Envelope, json.value)
    if (!envelope.success) return fail(unreadable, `响应缺少 code 字段（HTTP ${status}）：${spec.path}`)

    const { code, msg } = envelope.output
    if (code !== 'Success') return fail(kindOfRefusal(code, msg), msg === '' ? code : msg, code)

    const payload = safeParse(object({ data: spec.data }), json.value)
    if (!payload.success) {
      const issue = payload.issues[0]
      const where = issue.path?.map((item) => String(item.key)).join('.') ?? 'data'
      return fail(unreadable, `响应字段 ${where} 与预期不符（${issue.message}）：${spec.path}`)
    }
    return ok(payload.output.data)
  }
