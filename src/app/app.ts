import { safeParse } from 'valibot'
import { parseJson } from '../autodl/http'
import { buildPlan, type Draft, DraftSchema, defaultDraft } from '../domain/config'
import type { Catalog } from '../domain/types'
import type { AutodlApi, PendingCreateStore } from '../ports'
import type { Log } from '../runner/log'
import { describeFailure, type Phase, type Runner, type RunnerState } from '../runner/runner'
import { loadCatalog } from './catalog'

export type AppState = {
  draft: Draft
  catalog: Catalog | null
  /** Why the catalog is missing, when it is. */
  catalogError: string | null
  /** True while the catalog is being fetched. */
  busy: boolean
  errors: string[]
  runner: RunnerState
  /** An earlier create request was never confirmed. */
  pendingCreate: boolean
}

export type AppDeps = {
  api: AutodlApi
  runner: Runner
  pending: PendingCreateStore
  log: Log
  storage: Storage
  /** Whether the browser can guarantee that only one tab runs a task. */
  tabLockSupported: boolean
  /** Asks for permission to show desktop notifications. Called from a click. */
  requestNotifications: () => void
}

export type App = {
  getState: () => AppState
  subscribe: (listener: (state: AppState, previous: AppState) => void) => () => void
  updateDraft: (patch: Partial<Draft>) => void
  reloadCatalog: () => Promise<void>
  /**
   * Validates the draft and starts the task at once. This click is the user's authorisation:
   * a matching host is created and powered on without asking again.
   */
  start: () => Promise<void>
  pause: () => void
  resume: () => void
  stop: () => void
  clearPendingCreate: () => void
}

const ACTIVE_PHASES: Phase[] = ['starting', 'monitoring', 'paused', 'creating', 'verifying']

export const isActive = (phase: Phase): boolean => ACTIVE_PHASES.includes(phase)

const DRAFT_KEY = 'autodl-grabber:draft'

const loadDraft = (storage: Storage): Draft => {
  const parsed = parseJson(storage.getItem(DRAFT_KEY) ?? 'null')
  const draft = parsed.ok ? safeParse(DraftSchema, parsed.value) : null
  return draft?.success ? draft.output : defaultDraft()
}

export const createApp = (deps: AppDeps): App => {
  const { api, runner, pending, log, storage } = deps
  let state: AppState = {
    draft: loadDraft(storage),
    catalog: null,
    catalogError: null,
    busy: false,
    errors: [],
    runner: runner.getState(),
    pendingCreate: pending.load() !== null,
  }
  const listeners = new Set<(state: AppState, previous: AppState) => void>()

  const set = (patch: Partial<AppState>) => {
    const previous = state
    state = { ...state, ...patch }
    for (const listener of listeners) listener(state, previous)
  }

  runner.subscribe((next) => set({ runner: next, pendingCreate: pending.load() !== null }))

  const idle = () => !isActive(state.runner.phase) && !state.busy

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    updateDraft: (patch) => {
      if (!idle()) return
      const draft = { ...state.draft, ...patch }
      storage.setItem(DRAFT_KEY, JSON.stringify(draft))
      set({ draft, errors: [] })
    },

    reloadCatalog: async () => {
      if (!idle()) return
      set({ busy: true, catalog: null, catalogError: null, errors: [] })
      const loaded = await loadCatalog(api)
      if (!loaded.ok) {
        const reason = describeFailure(loaded.failure)
        log.add('error', `读取地区、GPU 和镜像列表失败：${reason}`)
        set({ busy: false, catalogError: reason })
        return
      }
      for (const warning of loaded.value.warnings) log.add('warn', warning)
      set({ busy: false, catalog: loaded.value.catalog })
    },

    start: async () => {
      // The runner enters "starting" synchronously, so a second click finds the app no longer idle.
      if (!idle()) return
      if (state.catalog === null) {
        set({ errors: ['地区、GPU 和镜像列表尚未加载，请先点击“刷新列表”'] })
        return
      }
      if (!deps.tabLockSupported) {
        set({ errors: ['当前浏览器不支持 Web Locks，无法保证多标签页不重复创建，已拒绝启动'] })
        return
      }
      const built = buildPlan(state.draft, state.catalog)
      if (!built.ok) {
        set({ errors: built.errors })
        return
      }
      set({ errors: [] })
      deps.requestNotifications()
      const refusal = await runner.start(built.plan)
      if (refusal !== null) set({ errors: [refusal], pendingCreate: pending.load() !== null })
    },

    pause: () => runner.pause(),
    resume: () => runner.resume(),
    stop: () => runner.stop(),

    clearPendingCreate: () => {
      if (!idle()) return
      pending.clear()
      log.add('warn', '已按你的确认清除“未确认的创建请求”标记')
      set({ pendingCreate: false, errors: [] })
    },
  }
}
