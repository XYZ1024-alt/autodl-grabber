import type { Plan } from '../domain/config'
import { type Failure, type FailureKind, ok, type Result } from '../domain/result'
import { rejectionReason, selectMachines } from '../domain/select'
import type { Image, Instance, Machine, PriceQuote, Region } from '../domain/types'
import { bytesToGb, formatYuan } from '../domain/units'
import type { AutodlApi, Notifier, PendingCreateStore, TabLock } from '../ports'
import type { Log } from './log'

export type Phase =
  | 'idle'
  | 'starting'
  | 'monitoring'
  | 'paused'
  /** The create request is in flight. */
  | 'creating'
  /** A create request was sent; its result is being confirmed. */
  | 'verifying'
  | 'done'
  | 'stopped'
  | 'failed'

export type Outcome = {
  headline: string
  instance: Instance | null
  machine: Machine | null
  quote: PriceQuote | null
  /** True when an instance exists or may exist, so charges may be running. */
  mayBeBilling: boolean
}

export type RunnerState = { phase: Phase; detail: string; polls: number; outcome: Outcome | null }

export type RunnerDeps = {
  api: AutodlApi
  pending: PendingCreateStore
  lock: TabLock
  log: Log
  notify: Notifier
}

export type Runner = {
  getState: () => RunnerState
  subscribe: (listener: (state: RunnerState) => void) => () => void
  /** Resolves to null when the task started, otherwise to the reason it did not. */
  start: (plan: Plan) => Promise<string | null>
  pause: () => void
  resume: () => void
  stop: () => void
}

const ACTIVE_PHASES: Phase[] = ['starting', 'monitoring', 'paused', 'creating', 'verifying']
const CREATE_SENT_PHASES: Phase[] = ['creating', 'verifying']

/** Hosts tried per poll before waiting for the next one. */
const MAX_ATTEMPTS_PER_POLL = 3
/** Host list pages (100 hosts each) read for one region when the platform reports idle GPUs there. */
const MAX_HOST_PAGES = 10
/**
 * After a region's host list had no eligible host, it is read again only when its idle counts change
 * or this much time has passed. Keeps a region that stays "idle but unsuitable" from being re-read every poll.
 */
const FRUITLESS_RECHECK_MS = 60_000
const MAX_CONSECUTIVE_FAILURES = 6
const MAX_BACKOFF_MS = 5 * 60_000
/** Create requests with an unknown result that one task tolerates before it gives up. */
const MAX_AMBIGUOUS_CREATES = 2
const APPEAR_POLL_MS = 2_000
const APPEAR_TRIES = 30
const BOOT_POLL_MS = 5_000
const BOOT_TRIES = 18
/** Waits between instance list reads after a create request with an unknown result (about two minutes). */
const RECONCILE_DELAYS_MS = [3_000, 5_000, 10_000, 15_000, 30_000, 30_000, 30_000]
const RECONCILE_EXTRA_TRIES = 3
/** How long a stored unconfirmed create request blocks a new task. */
const PENDING_WINDOW_MS = 150_000

/** Instance states the console treats as a failed start. */
const FAILED_STATUSES = [
  'create_failed',
  'shutdown_by_starting_error',
  'shutdown_by_running_error',
  're_init_failed',
]

const FAILURE_HINTS: Record<FailureKind, string> = {
  auth: '登录已失效，请重新登录 AutoDL 后点击“继续”',
  permission: '账号权限不足',
  captcha: '平台要求验证码或人机验证，请在页面上手动完成后点击“继续”（脚本不会绕过验证）',
  balance: '余额不足，请充值后点击“继续”',
  'real-name': '需要先完成实名认证',
  'unpaid-orders': '存在多个未支付订单，请先处理',
  'sold-out': '主机的空闲 GPU 已被租完',
  'rate-limit': '请求过于频繁',
  transient: '网络或服务器暂时异常',
  ambiguous: '请求结果不明确',
  'invalid-response': '接口返回与脚本预期不符，平台可能已更新，请参照 README 检查接口',
  rejected: '平台拒绝了请求',
}

export const describeFailure = (failure: Failure): string =>
  failure.message === ''
    ? FAILURE_HINTS[failure.kind]
    : `${FAILURE_HINTS[failure.kind]}（${failure.message}）`

/** The task as one log line, so the log records what was authorised when "start" was clicked. */
const describePlan = (plan: Plan): string =>
  [
    `GPU ${plan.gpuNames.join(' / ')} × ${plan.gpuCount} 卡`,
    `地区优先级 ${plan.regions.map((region) => region.name).join(' > ')}`,
    `镜像 ${plan.image.label}`,
    `价格上限 ${formatYuan(plan.maxHourlyMilli)}/时`,
    plan.expandGb === 0 ? '数据盘不扩容' : `数据盘额外扩容 ${plan.expandGb} GB`,
    `每 ${plan.intervalMs / 1000} 秒检查一次`,
  ].join('；')

const hostLabel = (machine: Machine): string =>
  `${machine.regionName} ${machine.alias}（${machine.id}，${machine.gpuName}）`

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const withJitter = (ms: number): number => ms * (0.9 + Math.random() * 0.2)

/** A wait that stop, pause and resume can cut short. */
const createGate = () => {
  let wake = () => {}
  return {
    /** Resolves after ms, or earlier when woken. Without ms it resolves only when woken. */
    wait: (ms?: number): Promise<void> =>
      new Promise((resolve) => {
        const timer = ms === undefined ? undefined : setTimeout(resolve, ms)
        wake = () => {
          clearTimeout(timer)
          resolve()
        }
      }),
    wake: () => wake(),
  }
}

type Task = {
  plan: Plan
  /** Instances that existed when the task started. Anything else is new. */
  knownInstanceIds: Set<string>
  release: () => void
  gate: ReturnType<typeof createGate>
  stopRequested: boolean
  pauseReason: string | null
  createInFlight: boolean
  createsSent: number
  ambiguousCreates: number
  failures: number
  /** Regions whose last host list read found no eligible host, by region id. */
  fruitless: Map<string, { signature: string; at: number }>
}

type Precheck = {
  machine: Machine | null
  online: boolean
  instanceCount: number
  quote: PriceQuote
  images: Image[]
  instances: Instance[]
}

type Step = 'finished' | 'continue'

/** What the monitoring loop does after one poll: end, poll again at once, or wait for the interval. */
type PollResult = 'finished' | 'again' | 'rest'

/** A region where the platform reports enough idle GPUs. The signature changes whenever those counts change. */
type Hit = { region: Region; gpuNames: string[]; signature: string }

export const createRunner = ({ api, pending, lock, log, notify }: RunnerDeps): Runner => {
  let state: RunnerState = { phase: 'idle', detail: '', polls: 0, outcome: null }
  let current: Task | null = null
  const listeners = new Set<(state: RunnerState) => void>()

  const set = (patch: Partial<RunnerState>) => {
    state = { ...state, ...patch }
    for (const listener of listeners) listener(state)
  }

  const finish = (task: Task, phase: 'done' | 'stopped' | 'failed', outcome: Outcome): Step => {
    task.release()
    current = null
    const { headline } = outcome
    set({ phase, detail: headline, outcome })
    log.add(phase === 'failed' ? 'error' : 'info', headline)
    if (phase !== 'stopped') notify(phase === 'done' ? 'AutoDL 抢机完成' : 'AutoDL 抢机任务已停止', headline)
    return 'finished'
  }

  const pauseTask = (task: Task, reason: string) => {
    task.pauseReason = reason
    log.add('warn', `已暂停：${reason}`)
    notify('AutoDL 抢机已暂停', reason)
  }

  /** Temporary failures back off and retry a limited number of times; everything else pauses. */
  const onReadFailure = async (task: Task, failure: Failure) => {
    const text = describeFailure(failure)
    if (failure.kind !== 'transient' && failure.kind !== 'rate-limit') {
      pauseTask(task, text)
      return
    }
    task.failures += 1
    if (task.failures > MAX_CONSECUTIVE_FAILURES) {
      pauseTask(task, `连续 ${task.failures} 次请求失败：${text}`)
      return
    }
    const delay = Math.min(task.plan.intervalMs * 2 ** task.failures, MAX_BACKOFF_MS)
    log.add(
      'warn',
      `${text}，${Math.round(delay / 1000)} 秒后重试（第 ${task.failures}/${MAX_CONSECUTIVE_FAILURES} 次）`,
    )
    await task.gate.wait(delay)
  }

  const strangerOutcome = (instances: Instance[]): Outcome => ({
    headline: `发现任务启动后新出现的实例 ${instances.map((instance) => instance.uuid).join('、')}，为避免重复创建已停止。请到控制台核对，该实例可能正在计费。`,
    instance: instances[0] ?? null,
    machine: null,
    quote: null,
    mayBeBilling: true,
  })

  /** Reads the instance list until a matching instance shows up. */
  const findInstance = async (match: (instance: Instance) => boolean, tries: number, intervalMs: number) => {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      const listed = await api.listInstances()
      const found = listed.ok ? listed.value.find(match) : undefined
      if (found !== undefined) return found
      await sleep(intervalMs)
    }
    return null
  }

  /** Follows a new instance until it runs, fails to start, or the wait runs out. Returns its latest state. */
  const waitForBoot = async (created: Instance): Promise<Instance> => {
    let latest = created
    const settled = () => latest.status === 'running' || FAILED_STATUSES.includes(latest.status)
    for (let attempt = 0; attempt < BOOT_TRIES && !settled(); attempt += 1) {
      await sleep(BOOT_POLL_MS)
      const listed = await api.listInstances()
      latest =
        (listed.ok ? listed.value.find((instance) => instance.uuid === created.uuid) : undefined) ?? latest
    }
    return latest
  }

  /** An instance exists. Check its disk, wait for it to boot and end the task. */
  const conclude = async (
    task: Task,
    machine: Machine,
    quote: PriceQuote,
    created: Instance,
  ): Promise<Step> => {
    pending.clear()
    set({ phase: 'verifying', detail: `实例 ${created.uuid} 已创建，正在确认磁盘与开机状态` })
    log.add('info', `实例 ${created.uuid} 已出现在实例列表`)
    const expected = task.plan.criteria.expandBytes
    if (created.expandBytes !== expected)
      return finish(task, 'failed', {
        headline: `实例 ${created.uuid} 已创建，但数据盘扩容与设置不符（设置 ${bytesToGb(expected)} GB，实际 ${bytesToGb(created.expandBytes)} GB）。任务已停止，不会创建其他实例。该实例可能正在计费，请到控制台处理。`,
        instance: created,
        machine,
        quote,
        mayBeBilling: true,
      })

    const booted = await waitForBoot(created)
    if (booted.status === 'running')
      return finish(task, 'done', {
        headline: `抢机成功：实例 ${booted.uuid} 已创建并开机，正在计费。`,
        instance: booted,
        machine,
        quote,
        mayBeBilling: true,
      })
    if (FAILED_STATUSES.includes(booted.status))
      return finish(task, 'failed', {
        headline: `实例 ${booted.uuid} 已创建，但开机失败（状态 ${booted.status}）。任务已停止。实例及付费数据盘可能仍在计费，请到控制台处理。`,
        instance: booted,
        machine,
        quote,
        mayBeBilling: true,
      })
    return finish(task, 'done', {
      headline: `实例 ${booted.uuid} 已创建，当前状态 ${booted.status}，尚未确认进入运行中，请到控制台查看。实例可能正在计费。`,
      instance: booted,
      machine,
      quote,
      mayBeBilling: true,
    })
  }

  /** The platform confirmed the create request. Wait for the instance to appear. */
  const verify = async (task: Task, machine: Machine, quote: PriceQuote, uuid: string): Promise<Step> => {
    set({ phase: 'verifying', detail: `平台已受理，等待实例 ${uuid} 出现` })
    log.add('info', `平台返回创建成功，实例 ID ${uuid}`)
    const created = await findInstance((instance) => instance.uuid === uuid, APPEAR_TRIES, APPEAR_POLL_MS)
    if (created !== null) return conclude(task, machine, quote, created)
    return finish(task, 'failed', {
      headline: `平台返回创建成功（实例 ID ${uuid}），但 ${(APPEAR_TRIES * APPEAR_POLL_MS) / 1000} 秒内实例列表中没有出现该实例。任务已停止，不会重复创建。请到控制台核对，可能正在计费。`,
      instance: null,
      machine,
      quote,
      mayBeBilling: true,
    })
  }

  /** The create request has an unknown result. Find out from the instance list; never resend blindly. */
  const reconcile = async (task: Task, machine: Machine, quote: PriceQuote): Promise<Step> => {
    set({ phase: 'verifying', detail: '创建请求结果不明确，正在核对实例列表' })
    log.add('warn', '创建请求超时或返回不明确。不会重复提交，先核对实例列表（约 2 分钟）')
    let lastReadOk = false
    for (let round = 0; round < RECONCILE_DELAYS_MS.length + RECONCILE_EXTRA_TRIES; round += 1) {
      await sleep(RECONCILE_DELAYS_MS[round] ?? 30_000)
      const listed = await api.listInstances()
      lastReadOk = listed.ok
      if (!listed.ok) {
        log.add('warn', `核对时读取实例列表失败：${describeFailure(listed.failure)}`)
        continue
      }
      const fresh = listed.value.filter((instance) => !task.knownInstanceIds.has(instance.uuid))
      const mine = fresh.find((instance) => instance.machineId === machine.id)
      if (mine !== undefined) return conclude(task, machine, quote, mine)
      if (fresh.length > 0) return finish(task, 'failed', strangerOutcome(fresh))
      if (round >= RECONCILE_DELAYS_MS.length - 1) break
    }
    if (!lastReadOk)
      return finish(task, 'failed', {
        headline:
          '创建请求结果不明确，且无法读取实例列表完成核对。任务已停止，不会重复创建。请到控制台核对是否已创建实例，可能正在计费。',
        instance: null,
        machine,
        quote,
        mayBeBilling: true,
      })
    pending.clear()
    task.ambiguousCreates += 1
    if (task.ambiguousCreates >= MAX_AMBIGUOUS_CREATES)
      return finish(task, 'failed', {
        headline: `创建请求已 ${task.ambiguousCreates} 次结果不明确，核对后均未发现新实例。为安全起见任务已停止，请检查网络后重新启动。`,
        instance: null,
        machine,
        quote,
        mayBeBilling: false,
      })
    log.add('info', '核对完成：实例列表中没有出现新实例，确认本次创建未成功')
    set({ phase: 'monitoring', detail: '已确认上次创建未成功，继续监测' })
    return 'continue'
  }

  const submit = async (task: Task, machine: Machine, quote: PriceQuote): Promise<Step> => {
    if (task.createInFlight) throw new Error('a create request is already in flight')
    task.createInFlight = true
    task.createsSent += 1
    pending.save({ sentAt: Date.now(), machineId: machine.id, knownInstanceIds: [...task.knownInstanceIds] })
    set({ phase: 'creating', detail: `正在创建：${hostLabel(machine)}` })
    log.add(
      'info',
      `已发出创建请求：${hostLabel(machine)}，${task.plan.gpuCount} 卡，数据盘扩容 ${task.plan.expandGb} GB`,
    )
    const created = await api.createInstance({
      machineId: machine.id,
      gpuCount: task.plan.gpuCount,
      image: task.plan.image,
      expandBytes: task.plan.criteria.expandBytes,
    })
    task.createInFlight = false
    if (created.ok) return verify(task, machine, quote, created.value)
    if (created.failure.kind === 'ambiguous') return reconcile(task, machine, quote)
    // Any other answer is a definite refusal: nothing was created.
    pending.clear()
    set({ phase: 'monitoring', detail: '创建请求被平台拒绝，未创建实例' })
    if (created.failure.kind === 'sold-out')
      log.add('info', `${hostLabel(machine)} 已被租完，未创建实例，继续监测`)
    else pauseTask(task, `创建请求被拒绝，未创建实例：${describeFailure(created.failure)}`)
    return 'continue'
  }

  const precheck = async (task: Task, listed: Machine): Promise<Result<Precheck>> => {
    const { plan } = task
    const [machine, online, instanceCount, quote, images, instances] = await Promise.all([
      api.getMachine(listed.id, listed.regionSign),
      api.isMachineOnline(listed.id),
      api.countInstances(),
      api.previewPrice({
        machineId: listed.id,
        gpuCount: plan.gpuCount,
        expandBytes: plan.criteria.expandBytes,
      }),
      api.listImages(plan.image.kind),
      api.listInstances(),
    ])
    if (!machine.ok) return machine
    if (!online.ok) return online
    if (!instanceCount.ok) return instanceCount
    if (!quote.ok) return quote
    if (!images.ok) return images
    if (!instances.ok) return instances
    return ok({
      machine: machine.value,
      online: online.value,
      instanceCount: instanceCount.value,
      quote: quote.value,
      images: images.value,
      instances: instances.value,
    })
  }

  /** Re-reads everything about one listed host and, when it all still holds, creates the instance. */
  const attempt = async (task: Task, listed: Machine): Promise<Step> => {
    const { plan } = task
    const expandBytes = plan.criteria.expandBytes
    log.add('info', `发现候选主机 ${hostLabel(listed)}，开始创建前核对`)
    const checked = await precheck(task, listed)
    if (!checked.ok) {
      await onReadFailure(task, checked.failure)
      return 'continue'
    }
    const { machine, online, instanceCount, quote, images, instances } = checked.value

    const strangers = instances.filter((instance) => !task.knownInstanceIds.has(instance.uuid))
    if (strangers.length > 0) return finish(task, 'failed', strangerOutcome(strangers))

    const skip = (reason: string): Step => {
      log.add('info', `${hostLabel(listed)} 核对未通过：${reason}，继续监测`)
      return 'continue'
    }
    const hold = (reason: string): Step => {
      pauseTask(task, reason)
      return 'continue'
    }
    if (machine === null) return skip('主机已不在列表中')
    const reason = rejectionReason(machine, plan.criteria)
    if (reason !== null) return skip(reason)
    if (!online) return skip('主机正在下架维护')
    const { instanceLimit } = api.getSession()
    if (instanceCount >= instanceLimit)
      return hold(`实例数量已达上限（${instanceCount}/${instanceLimit}），无法创建`)
    if (quote.expandBytes !== expandBytes)
      return hold(
        `平台价格预览中的扩容大小（${bytesToGb(quote.expandBytes)} GB）与设置（${plan.expandGb} GB）不一致，未创建实例`,
      )
    if (quote.hourlyMilli > plan.maxHourlyMilli)
      return hold(
        `价格超限：${hostLabel(machine)} 实际价格 ${formatYuan(quote.hourlyMilli)}/时，高于上限 ${formatYuan(plan.maxHourlyMilli)}/时，未创建实例`,
      )
    if (!images.some((image) => image.uuid === plan.image.uuid)) return hold('所选镜像已不存在，未创建实例')
    if (task.stopRequested || task.pauseReason !== null) return 'continue'

    log.add(
      'info',
      `核对通过：${hostLabel(machine)}，${formatYuan(quote.hourlyMilli)}/时，数据盘扩容 ${plan.expandGb} GB（${formatYuan(quote.diskDailyMilli)}/日）`,
    )
    return submit(task, machine, quote)
  }

  /** Reads the hosts of one region for the models reported idle there and returns the eligible ones, best first. */
  const candidatesIn = async (task: Task, { region, gpuNames }: Hit): Promise<Result<Machine[]>> => {
    const { plan } = task
    log.add('info', `${region.name} 的 ${gpuNames.join('、')} 有空闲 GPU，读取主机列表`)
    const listed = await api.listMachines({
      regionSigns: region.signs,
      gpuNames,
      gpuCount: plan.gpuCount,
      maxPages: MAX_HOST_PAGES,
    })
    if (!listed.ok) return listed
    const { machines, total, complete } = listed.value
    if (!complete)
      log.add(
        'warn',
        `${region.name} 共有 ${total} 台匹配主机，超过单次读取上限，只检查了前 ${machines.length} 台`,
      )
    const { eligible, rejected } = selectMachines(machines, plan.criteria)
    const idle = rejected.filter((item) => item.machine.gpuIdle > 0)
    log.add(
      'info',
      `${region.name}：${eligible.length + idle.length} 台主机有空闲 GPU，${eligible.length} 台符合全部条件`,
    )
    for (const { machine, reason } of idle.slice(0, 3))
      log.add('info', `  跳过 ${hostLabel(machine)}：${reason}`)
    if (eligible.length === 0)
      log.add('info', `  ${region.name} 的空闲数量不变时，${FRUITLESS_RECHECK_MS / 1000} 秒后再复查主机列表`)
    return ok(eligible)
  }

  /** One round of monitoring: a cheap idle count first, host lists only where it reports idle GPUs. */
  const poll = async (task: Task): Promise<PollResult> => {
    const { plan } = task
    const interrupted = () => task.stopRequested || task.pauseReason !== null
    const counts = await api.countIdleGpus(plan.regions)
    if (interrupted()) return 'again'
    if (!counts.ok) {
      await onReadFailure(task, counts.failure)
      return 'again'
    }
    task.failures = 0
    set({ polls: state.polls + 1 })
    const idleOf = (region: Region, gpuName: string) =>
      counts.value.find((count) => count.regionId === region.id && count.gpuName === gpuName)?.idle ?? 0
    // plan.regions is in priority order, so the preferred region is read and tried first.
    const hits: Hit[] = plan.regions
      .map((region) => {
        const gpuNames = plan.gpuNames.filter((name) => idleOf(region, name) >= plan.gpuCount)
        return {
          region,
          gpuNames,
          signature: gpuNames.map((name) => `${name}=${idleOf(region, name)}`).join(','),
        }
      })
      .filter((hit) => hit.gpuNames.length > 0)
    log.add(
      'info',
      hits.length === 0
        ? `第 ${state.polls} 次检查：所选地区和型号暂无足够的空闲 GPU`
        : `第 ${state.polls} 次检查：平台显示 ${hits.map((hit) => hit.region.name).join('、')} 有空闲 GPU`,
    )

    let attempts = 0
    for (const hit of hits) {
      const last = task.fruitless.get(hit.region.id)
      if (last?.signature === hit.signature && Date.now() - last.at < FRUITLESS_RECHECK_MS) continue
      const eligible = await candidatesIn(task, hit)
      if (interrupted()) return 'again'
      if (!eligible.ok) {
        await onReadFailure(task, eligible.failure)
        return 'again'
      }
      if (eligible.value.length === 0)
        task.fruitless.set(hit.region.id, { signature: hit.signature, at: Date.now() })
      else task.fruitless.delete(hit.region.id)
      for (const machine of eligible.value) {
        if (attempts >= MAX_ATTEMPTS_PER_POLL) return 'rest'
        attempts += 1
        if ((await attempt(task, machine)) === 'finished') return 'finished'
        if (interrupted()) return 'again'
      }
    }
    return 'rest'
  }

  const run = async (task: Task) => {
    const { plan } = task
    for (;;) {
      if (task.stopRequested) {
        finish(task, 'stopped', {
          headline: task.createsSent > 0 ? '已发出的创建请求经核对没有生成实例。' : '未创建实例。',
          instance: null,
          machine: null,
          quote: null,
          mayBeBilling: false,
        })
        return
      }
      if (task.pauseReason !== null) {
        set({ phase: 'paused', detail: task.pauseReason })
        await task.gate.wait()
        continue
      }
      set({ phase: 'monitoring', detail: `每 ${plan.intervalMs / 1000} 秒检查一次` })
      const result = await poll(task)
      if (result === 'finished') return
      if (result === 'rest' && !task.stopRequested && task.pauseReason === null)
        await task.gate.wait(withJitter(plan.intervalMs))
    }
  }

  /** A create request from an earlier task that was never confirmed blocks a new task until it is resolved. */
  const pendingBlock = (instances: Instance[]): string | null => {
    const stored = pending.load()
    if (stored === null) return null
    const fresh = instances.filter((instance) => !stored.knownInstanceIds.includes(instance.uuid))
    if (fresh.length > 0)
      return `上一次任务发出的创建请求可能已成功：实例列表中出现了新实例 ${fresh.map((instance) => instance.uuid).join('、')}（可能正在计费）。请先到控制台核对，再点击“我已核对，清除标记”后启动。`
    const remaining = PENDING_WINDOW_MS - (Date.now() - stored.sentAt)
    if (remaining > 0)
      return `上一次创建请求的结果仍在核对期内，请约 ${Math.ceil(remaining / 1000)} 秒后再启动`
    pending.clear()
    return null
  }

  const start = async (plan: Plan): Promise<string | null> => {
    if (ACTIVE_PHASES.includes(state.phase)) return '任务已在运行中'
    set({ phase: 'starting', detail: '', polls: 0, outcome: null })
    const refuse = (message: string) => {
      // The panel shows the reason as a start error; repeating it as the status would say it twice.
      set({ phase: 'idle', detail: '' })
      log.add('warn', `未能启动：${message}`)
      return message
    }
    const session = api.getSession()
    if (!session.loggedIn) return refuse('未检测到登录状态，请先登录 AutoDL')
    if (!session.canCreate) return refuse('当前子账号没有容器实例权限，无法创建实例')
    const release = await lock.acquire()
    if (release === null) return refuse('另一个标签页正在运行抢机任务，本页不会重复启动')
    const instances = await api.listInstances()
    const blocked = instances.ok
      ? pendingBlock(instances.value)
      : `无法读取实例列表：${describeFailure(instances.failure)}`
    if (!instances.ok || blocked !== null) {
      release()
      return refuse(blocked ?? '无法读取实例列表')
    }

    const task: Task = {
      plan,
      knownInstanceIds: new Set(instances.value.map((instance) => instance.uuid)),
      release,
      gate: createGate(),
      stopRequested: false,
      pauseReason: null,
      createInFlight: false,
      createsSent: 0,
      ambiguousCreates: 0,
      failures: 0,
      fruitless: new Map(),
    }
    current = task
    log.add('info', `任务开始：${describePlan(plan)}。当前已有 ${task.knownInstanceIds.size} 个实例`)
    void run(task).catch((error: Error) => {
      finish(task, 'failed', {
        headline: `脚本内部错误，任务已停止：${error.message}${task.createsSent > 0 ? '。创建请求已发出过，请到控制台核对，可能正在计费。' : ''}`,
        instance: null,
        machine: null,
        quote: null,
        mayBeBilling: task.createsSent > 0,
      })
    })
    return null
  }

  const createAlreadySent = () => CREATE_SENT_PHASES.includes(state.phase)

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    start,
    pause: () => {
      if (current === null || current.pauseReason !== null || current.stopRequested) return
      if (createAlreadySent()) {
        log.add('warn', '创建请求已发出，无法暂停；将继续核对结果，任务结束后不会再创建')
        return
      }
      current.pauseReason = '已手动暂停'
      log.add('info', '已手动暂停监测')
      current.gate.wake()
    },
    resume: () => {
      if (current === null || current.pauseReason === null) return
      current.pauseReason = null
      current.failures = 0
      log.add('info', '继续监测')
      current.gate.wake()
    },
    stop: () => {
      if (current === null || current.stopRequested) return
      current.stopRequested = true
      if (createAlreadySent())
        log.add('warn', '已收到停止指令。创建请求已发出，无法保证撤销；将继续核对结果，但不会再发起新的创建')
      else log.add('info', '已收到停止指令，取消后续监测与重试')
      current.gate.wake()
    },
  }
}
