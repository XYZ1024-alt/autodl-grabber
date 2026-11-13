import { number, object, string } from 'valibot'
import { describe, expect, it, vi } from 'vitest'
import { createHttp } from '../src/autodl/http'

const TOKEN = 'header.payload.signature'

const storageOf = (entries: Record<string, string>) => ({ getItem: (key: string) => entries[key] ?? null })

type Seen = { url: string; init: RequestInit | undefined }

const setup = (reply: () => Promise<Response>, entries: Record<string, string> = { token: TOKEN }) => {
  const seen: Seen[] = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    seen.push({ url: String(input), init })
    return reply()
  }
  return { http: createHttp({ fetch, storage: storageOf(entries) }), seen }
}

const json =
  (body: object, status = 200) =>
  async () =>
    new Response(JSON.stringify(body), { status })

const read = { method: 'GET', path: 'api/v1/instance/count/v1', data: number() } as const
const write = {
  method: 'POST',
  path: 'api/v1/order/instance/create/payg',
  body: {},
  data: string(),
  uncertain: 'ambiguous',
} as const

describe('createHttp', () => {
  it('sends the login token from localStorage and returns the data field', async () => {
    const { http, seen } = setup(json({ code: 'Success', data: 3 }), {
      token: TOKEN,
      app_version: '{"version":"v6.55.0"}',
    })
    expect(await http(read)).toEqual({ ok: true, value: 3 })
    expect(seen[0]?.url).toBe('/api/v1/instance/count/v1')
    expect(seen[0]?.init?.headers).toMatchObject({ Authorization: TOKEN, AppVersion: 'v6.55.0' })
  })

  it('uses the sub-account prefix when the stored user is a sub-account', async () => {
    const { http, seen } = setup(json({ code: 'Success', data: 3 }), {
      token: TOKEN,
      user: '{"sub_name":"worker"}',
    })
    await http({ ...read, query: { a: '1' } })
    expect(seen[0]?.url).toBe('/api/v1/sub_user/instance/count/v1?a=1')
  })

  it('does not send anything without a login token', async () => {
    const { http, seen } = setup(json({ code: 'Success', data: 3 }), {})
    expect(await http(read)).toMatchObject({ ok: false, failure: { kind: 'auth' } })
    expect(seen).toHaveLength(0)
  })

  it.each([
    ['AuthorizeFailed', '', 'auth'],
    ['TORecharge', '余额不足', 'balance'],
    ['TORealName', '请实名', 'real-name'],
    ['OrderUnpaidMoreThanThree', '', 'unpaid-orders'],
    ['MachineGpuNumUpdateFailed', '', 'sold-out'],
    ['SomethingElse', '请完成验证码校验', 'captcha'],
    ['SomethingElse', '操作过于频繁', 'rate-limit'],
    ['RecordNotFoundError', '主机不存在', 'rejected'],
  ])('maps the refusal %s "%s" to %s', async (code, msg, kind) => {
    const { http } = setup(json({ code, msg }))
    expect(await http(write)).toMatchObject({ ok: false, failure: { kind, code } })
  })

  it.each([
    [401, 'auth'],
    [403, 'permission'],
    [429, 'rate-limit'],
  ])('maps HTTP %i to %s even for a create request', async (status, kind) => {
    const { http } = setup(json({}, status))
    expect(await http(write)).toMatchObject({ ok: false, failure: { kind } })
  })

  it('reports an unknown outcome of a read as transient and of a create as ambiguous', async () => {
    const offline = async (): Promise<Response> => {
      throw new TypeError('Failed to fetch')
    }
    expect(await setup(offline).http(read)).toMatchObject({ ok: false, failure: { kind: 'transient' } })
    expect(await setup(offline).http(write)).toMatchObject({ ok: false, failure: { kind: 'ambiguous' } })
    expect(await setup(json({}, 502)).http(read)).toMatchObject({ ok: false, failure: { kind: 'transient' } })
    expect(await setup(json({}, 502)).http(write)).toMatchObject({
      ok: false,
      failure: { kind: 'ambiguous' },
    })
    const html = async () => new Response('<html>gateway</html>', { status: 200 })
    expect(await setup(html).http(write)).toMatchObject({ ok: false, failure: { kind: 'ambiguous' } })
  })

  it('gives up after the timeout and aborts the request', async () => {
    vi.useFakeTimers()
    const seen: AbortSignal[] = []
    const fetch: typeof globalThis.fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal
        if (signal) {
          seen.push(signal)
          signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }
      })
    const pending = createHttp({ fetch, storage: storageOf({ token: TOKEN }) })({
      ...write,
      timeoutMs: 30_000,
    })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(await pending).toMatchObject({ ok: false, failure: { kind: 'ambiguous' } })
    expect(seen[0]?.aborted).toBe(true)
    vi.useRealTimers()
  })

  it('flags a response whose data no longer has the expected shape', async () => {
    const { http } = setup(json({ code: 'Success', data: { total: 'three' } }))
    const result = await http({ method: 'GET', path: 'api/v1/x', data: object({ total: number() }) })
    expect(result).toMatchObject({ ok: false, failure: { kind: 'invalid-response' } })
    expect(result.ok ? '' : result.failure.message).toContain('data.total')
  })

  it('never puts the token into a failure message', async () => {
    const { http } = setup(async () => {
      throw new TypeError('Failed to fetch')
    })
    const result = await http(read)
    expect(JSON.stringify(result)).not.toContain(TOKEN)
  })
})
