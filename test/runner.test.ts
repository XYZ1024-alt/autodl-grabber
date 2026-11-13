import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Draft } from '../src/domain/config'
import { GIB } from '../src/domain/units'

import type { TabLock } from '../src/ports'
import { createLog } from '../src/runner/log'
import { createRunner, type Phase } from '../src/runner/runner'
import { plan } from './fixtures'
import { createMemoryPending, createMockApi, type MockScenario } from './simulator'

const RESTING: Phase[] = ['idle', 'paused', 'done', 'stopped', 'failed']

type Options = { soldOutPolls?: number; latencyMs?: number }

const setup = (scenario: MockScenario, { soldOutPolls = 1, latencyMs = 10 }: Options = {}) => {
  const api = createMockApi()
  api.configure({ scenario, soldOutPolls, latencyMs })
  const log = createLog()
  const pending = createMemoryPending()
  const tab = { held: false }
  const lock: TabLock = {
    acquire: async () => {
      if (tab.held) return null
      tab.held = true
      return () => {
        tab.held = false
      }
    },
  }
  const notices: string[] = []
  const runner = createRunner({ api, pending, lock, log, notify: (title) => notices.push(title) })
  const phase = () => runner.getState().phase
  /** Lets simulated time pass until the runner needs nothing more, or the limit is reached. */
  const settle = async (limitMs = 20 * 60_000) => {
    for (let elapsed = 0; elapsed < limitMs && !RESTING.includes(phase()); elapsed += 500)
      await vi.advanceTimersByTimeAsync(500)
  }
  const until = async (target: Phase, limitMs = 5 * 60_000) => {
    for (let elapsed = 0; elapsed < limitMs && phase() !== target; elapsed += 5)
      await vi.advanceTimersByTimeAsync(5)
    expect(phase()).toBe(target)
  }
  /** Simulated calls take simulated time, so time has to pass for anything awaited here. */
  const during = async <T>(work: Promise<T>): Promise<T> => {
    await vi.advanceTimersByTimeAsync(latencyMs + 1)
    return work
  }
  const start = (patch: Partial<Draft> = {}) => during(runner.start(plan(patch)))
  const logged = () =>
    log
      .entries()
      .map((entry) => entry.text)
      .join('\n')
  return { api, runner, pending, tab, notices, phase, settle, until, start, during, logged }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('a task that finds a host', () => {
  it('creates exactly one instance with the requested expansion and then stops monitoring', async () => {
    const t = setup('success')
    expect(await t.start()).toBeNull()
    await t.settle()

    const { phase, outcome } = t.runner.getState()
    expect(phase).toBe('done')
    expect(t.api.calls.createInstance).toBe(1)
    expect(outcome?.instance).toMatchObject({ status: 'running', expandBytes: 100 * GIB, gpuCount: 1 })
    expect(outcome?.quote?.diskDailyMilli).toBe(665)
    expect(outcome?.mayBeBilling).toBe(true)
    expect(t.logged()).toContain('任务开始：GPU RTX 4090 × 1 卡；地区优先级 模拟一区 > 模拟二区')
    expect(t.logged()).toContain('数据盘额外扩容 100 GB')
    expect(t.pending.load()).toBeNull()
    expect(t.tab.held).toBe(false)
    expect(t.notices).toEqual(['AutoDL 抢机完成'])

    const polls = t.api.calls.countIdleGpus
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(t.api.calls.countIdleGpus).toBe(polls)
    expect(t.api.calls.createInstance).toBe(1)
  })

  it('reads host lists only when the platform reports idle GPUs', async () => {
    const t = setup('success', { soldOutPolls: 3 })
    await t.start()
    await vi.advanceTimersByTimeAsync(25_000)
    expect(t.api.calls.countIdleGpus).toBeGreaterThanOrEqual(2)
    expect(t.api.calls.listMachines).toBe(0)
    await t.settle()
    expect(t.phase()).toBe('done')
    // The preferred region had an eligible host, so the second region was never read.
    expect(t.api.calls.listMachines).toBe(1)
  })

  it('prefers the region ranked first even when another region is cheaper', async () => {
    const t = setup('success')
    await t.start({ regionIds: ['mockDC1', 'mockDC2'] })
    await t.settle()
    expect(t.runner.getState().outcome?.instance?.machineId).toBe('mockhost-a1')

    const reversed = setup('success')
    await reversed.start({ regionIds: ['mockDC2', 'mockDC1'] })
    await reversed.settle()
    expect(reversed.runner.getState().outcome?.instance?.machineId).toBe('mockhost-b1')
  })

  it('skips hosts that cannot provide the expansion instead of shrinking it', async () => {
    const t = setup('success')
    await t.start({ expandGb: 400 })
    await t.settle()
    expect(t.runner.getState().outcome?.instance).toMatchObject({
      machineId: 'mockhost-b1',
      expandBytes: 400 * GIB,
    })
  })

  it('keeps waiting when no host can provide the expansion', async () => {
    const t = setup('success')
    await t.start({ expandGb: 600 })
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(t.phase()).toBe('monitoring')
    expect(t.api.calls.createInstance).toBe(0)
    expect(t.logged()).toContain('可扩容上限 500 GB 小于所需 600 GB')
    // 30 polls in 5 minutes, but each region's host list is re-read at most once a minute.
    expect(t.api.calls.countIdleGpus).toBeGreaterThan(25)
    expect(t.api.calls.listMachines).toBeLessThanOrEqual(12)
  })
})

describe('protection against duplicate creation', () => {
  it('accepts only one of two simultaneous starts', async () => {
    const t = setup('success')
    const results = await t.during(Promise.all([t.runner.start(plan()), t.runner.start(plan())]))
    expect(results.filter((result) => result === null)).toHaveLength(1)
    expect(results).toContain('任务已在运行中')
    await t.settle()
    expect(t.api.calls.createInstance).toBe(1)
  })

  it('refuses to start while another tab holds the task lock', async () => {
    const t = setup('success')
    t.tab.held = true
    expect(await t.start()).toContain('另一个标签页')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(t.phase()).toBe('idle')
    expect(t.api.calls.countIdleGpus).toBe(0)
  })

  it('refuses to start when an earlier unconfirmed create request may have produced an instance', async () => {
    const t = setup('success')
    t.pending.save({ sentAt: Date.now() - 3_600_000, machineId: 'mockhost-a1', knownInstanceIds: [] })
    expect(await t.start()).toContain('可能已成功')
    expect(t.tab.held).toBe(false)
    expect(t.pending.load()).not.toBeNull()
    expect(t.api.calls.countIdleGpus).toBe(0)
  })

  it('makes a new task wait while an earlier create request is still being confirmed', async () => {
    const t = setup('success')
    t.pending.save({
      sentAt: Date.now(),
      machineId: 'mockhost-a1',
      knownInstanceIds: ['mockhost-zz-00000000'],
    })
    expect(await t.start()).toContain('核对期内')
    await vi.advanceTimersByTimeAsync(151_000)
    expect(await t.start()).toBeNull()
    expect(t.pending.load()).toBeNull()
  })

  it('stops when an instance it did not create appears during the task', async () => {
    const t = setup('success', { soldOutPolls: 0 })
    await t.start()
    // Another tab or person creates an instance while this task is checking its first candidate.
    await t.during(
      t.api.createInstance({ machineId: 'mockhost-a3', gpuCount: 1, image: plan().image, expandBytes: 0 }),
    )
    await t.settle()
    expect(t.phase()).toBe('failed')
    // The only create call is the one made above on behalf of the other tab.
    expect(t.api.calls.createInstance).toBe(1)
    expect(t.runner.getState().outcome).toMatchObject({
      mayBeBilling: true,
      instance: { machineId: 'mockhost-a3' },
    })
  })
})

describe('a create request with an unknown result', () => {
  it('finds the instance in the instance list instead of sending the request again', async () => {
    const t = setup('timeout-created')
    await t.start()
    await t.settle()
    const { phase, outcome } = t.runner.getState()
    expect(phase).toBe('done')
    expect(t.api.calls.createInstance).toBe(1)
    expect(outcome?.instance).toMatchObject({ machineId: 'mockhost-a1', expandBytes: 100 * GIB })
    expect(t.pending.load()).toBeNull()
    expect(t.logged()).toContain('不会重复提交')
  })

  it('retries only after the instance list confirmed that nothing was created, and only once', async () => {
    const t = setup('timeout-lost')
    await t.start()
    await t.until('verifying')
    expect(t.api.calls.createInstance).toBe(1)
    // Throughout the confirmation window no second request may go out.
    await vi.advanceTimersByTimeAsync(120_000)
    expect(t.api.calls.createInstance).toBe(1)
    expect(t.pending.load()).not.toBeNull()

    await t.settle()
    expect(t.phase()).toBe('failed')
    expect(t.api.calls.createInstance).toBe(2)
    expect(t.runner.getState().outcome?.mayBeBilling).toBe(false)
    expect(t.pending.load()).toBeNull()
  })
})

describe('stop and pause', () => {
  it('stop cancels monitoring at once', async () => {
    const t = setup('success', { soldOutPolls: 1000 })
    await t.start()
    await vi.advanceTimersByTimeAsync(35_000)
    const polls = t.api.calls.countIdleGpus
    expect(polls).toBeGreaterThan(1)

    t.runner.stop()
    await vi.advanceTimersByTimeAsync(100)
    expect(t.phase()).toBe('stopped')
    expect(t.tab.held).toBe(false)
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(t.api.calls.countIdleGpus).toBe(polls)
    expect(t.api.calls.createInstance).toBe(0)
  })

  it('stop cancels a pending backoff retry', async () => {
    const t = setup('rate-limit', { soldOutPolls: 1000 })
    await t.start()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(t.logged()).toContain('秒后重试')
    const polls = t.api.calls.countIdleGpus
    t.runner.stop()
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(t.phase()).toBe('stopped')
    expect(t.api.calls.countIdleGpus).toBe(polls)
  })

  it('stop during the create request still reports the instance and creates no other', async () => {
    const t = setup('success', { latencyMs: 2_000 })
    await t.start()
    await t.until('creating')
    t.runner.stop()
    expect(t.logged()).toContain('无法保证撤销')
    await t.settle()
    const { phase, outcome } = t.runner.getState()
    expect(phase).toBe('done')
    expect(outcome?.instance?.status).toBe('running')
    expect(t.api.calls.createInstance).toBe(1)
  })

  it('stop during a refused create request sends no further create request', async () => {
    const t = setup('sold-out-race', { latencyMs: 2_000 })
    await t.start()
    await t.until('creating')
    t.runner.stop()
    await t.settle()
    expect(t.phase()).toBe('stopped')
    expect(t.api.calls.createInstance).toBe(1)
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(t.api.calls.createInstance).toBe(1)
  })

  it('stop requested during the pre-create checks prevents the create request', async () => {
    const t = setup('success', { soldOutPolls: 0, latencyMs: 1_000 })
    await t.start()
    // 1 s for the idle count, 1 s for the host list, then 1 s of checks: stop in the middle of them.
    await vi.advanceTimersByTimeAsync(2_500)
    expect(t.logged()).toContain('开始创建前核对')
    expect(t.phase()).toBe('monitoring')
    t.runner.stop()
    await t.settle()
    expect(t.phase()).toBe('stopped')
    expect(t.api.calls.createInstance).toBe(0)
  })

  it('pause halts polling until resume', async () => {
    const t = setup('success', { soldOutPolls: 1000 })
    await t.start()
    await vi.advanceTimersByTimeAsync(15_000)
    t.runner.pause()
    await vi.advanceTimersByTimeAsync(100)
    expect(t.phase()).toBe('paused')
    const polls = t.api.calls.countIdleGpus
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(t.api.calls.countIdleGpus).toBe(polls)

    t.runner.resume()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(t.phase()).toBe('monitoring')
    expect(t.api.calls.countIdleGpus).toBeGreaterThan(polls)
  })
})

describe('failures', () => {
  it('a host that sells out during creation is not counted as created; the next round succeeds', async () => {
    const t = setup('sold-out-race')
    await t.start()
    await t.settle()
    expect(t.phase()).toBe('done')
    expect(t.api.calls.createInstance).toBe(2)
    expect(t.logged()).toContain('已被租完')
  })

  it('never creates when the expansion no longer fits at the final check', async () => {
    const t = setup('expand-shrinks')
    await t.start()
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(t.phase()).toBe('monitoring')
    expect(t.api.calls.createInstance).toBe(0)
    expect(t.logged()).toContain('可扩容上限 10 GB 小于所需 100 GB')
  })

  it('stops with a billing warning when the created instance lacks the expansion', async () => {
    const t = setup('expand-ignored')
    await t.start()
    await t.settle()
    const { phase, outcome } = t.runner.getState()
    expect(phase).toBe('failed')
    expect(outcome?.mayBeBilling).toBe(true)
    expect(outcome?.instance?.expandBytes).toBe(0)
    expect(outcome?.headline).toContain('数据盘扩容与设置不符')
    expect(t.api.calls.createInstance).toBe(1)
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(t.api.calls.createInstance).toBe(1)
  })

  it('pauses without creating when the price at the final check exceeds the cap', async () => {
    const t = setup('price-jump')
    await t.start()
    await t.settle()
    expect(t.phase()).toBe('paused')
    expect(t.runner.getState().detail).toContain('价格超限')
    expect(t.api.calls.createInstance).toBe(0)
  })

  it('pauses when the login expires', async () => {
    const t = setup('auth-expired', { soldOutPolls: 1000 })
    await t.start()
    await t.settle()
    expect(t.phase()).toBe('paused')
    expect(t.runner.getState().detail).toContain('登录已失效')
    expect(t.notices).toEqual(['AutoDL 抢机已暂停'])
    const polls = t.api.calls.countIdleGpus
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(t.api.calls.countIdleGpus).toBe(polls)
  })

  it('pauses when the platform refuses the create request for lack of balance', async () => {
    const t = setup('balance')
    await t.start()
    await t.settle()
    expect(t.phase()).toBe('paused')
    expect(t.runner.getState().detail).toContain('余额不足')
    expect(t.api.calls.createInstance).toBe(1)
    expect(t.pending.load()).toBeNull()
  })

  it('backs off when rate limited and carries on afterwards', async () => {
    const t = setup('rate-limit')
    await t.start()
    await t.settle()
    expect(t.phase()).toBe('done')
    expect(t.api.calls.createInstance).toBe(1)
    expect(t.logged()).toContain('20 秒后重试（第 1/6 次）')
    expect(t.logged()).toContain('40 秒后重试（第 2/6 次）')
  })
})
