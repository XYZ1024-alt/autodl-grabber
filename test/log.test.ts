import { describe, expect, it } from 'vitest'
import { createLog, redact } from '../src/runner/log'

const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjEyMzQ1Niwic3ViIjoidGVzdCJ9.c2lnbmF0dXJlLXZhbHVlLWhlcmU'

describe('redact', () => {
  it('hides a login token wherever it appears', () => {
    expect(redact(`request failed with ${JWT} attached`)).not.toContain('eyJ')
  })

  it.each([
    'Authorization: abc123secret',
    'token=abc123secret&x=1',
    '{"cookie":"abc123secret"}',
    'password = abc123secret',
  ])('hides the value in %s', (text) => {
    expect(redact(text)).not.toContain('abc123secret')
  })

  it('leaves ordinary text alone', () => {
    expect(redact('第 3 次检查：10 台主机，0 台符合全部条件')).toBe(
      '第 3 次检查：10 台主机，0 台符合全部条件',
    )
  })
})

describe('createLog', () => {
  it('redacts on the way in and keeps only the newest entries', () => {
    const log = createLog(2)
    log.add('info', 'one')
    log.add('warn', `Authorization: ${JWT}`)
    log.add('error', 'three')
    expect(log.entries().map((entry) => entry.text)).toEqual(['Authorization: [已隐藏]', 'three'])
  })
})
