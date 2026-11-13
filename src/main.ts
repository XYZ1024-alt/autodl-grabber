import { createApp, isActive } from './app/app'
import { createAutodlApi } from './autodl/api'
import type { Notifier, TabLock } from './ports'
import { createWebTabLock } from './runner/lock'
import { createLog } from './runner/log'
import { createStoredPending } from './runner/pending'
import { createRunner } from './runner/runner'
import { mountPanel } from './ui/panel'

const HOST_ID = 'autodl-grabber'
/** Pages for renting an instance. Elsewhere (the instance list) the panel starts collapsed. */
const RENT_PATHS = ['/create', '/market']
const TASK_LOCK = 'autodl-grabber:task'
const PENDING_KEY = 'autodl-grabber:pending-create'

const notify: Notifier = (title, body) => {
  if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body })
}

const requestNotifications = () => {
  if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission()
}

const mount = () => {
  const log = createLog()
  const tabLockSupported = 'locks' in navigator
  // Without Web Locks the app refuses to start a task (see createApp); this lock is then never reached.
  const lock: TabLock = tabLockSupported
    ? createWebTabLock(navigator.locks, TASK_LOCK)
    : { acquire: async () => () => {} }

  const api = createAutodlApi({ fetch: window.fetch.bind(window), storage: window.localStorage })
  const pending = createStoredPending(window.localStorage, PENDING_KEY)
  const runner = createRunner({ api, pending, lock, log, notify })
  const app = createApp({
    api,
    runner,
    pending,
    log,
    storage: window.localStorage,
    tabLockSupported,
    requestNotifications,
  })

  mountPanel(app, log, HOST_ID, !RENT_PATHS.some((prefix) => window.location.pathname.startsWith(prefix)))
  log.add('info', '脚本已加载。刷新页面后配置会保留，但不会自动恢复任务。')
  if (pending.load() !== null) log.add('warn', '检测到上一次任务有未确认的创建请求，请先到控制台核对实例列表')
  // Browsers slow down or suspend timers of hidden tabs, which delays monitoring.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isActive(app.getState().runner.phase))
      log.add(
        'warn',
        '本标签页已转入后台，浏览器可能大幅延迟或暂停监测。请让本页保持在前台可见（建议单独开一个窗口）',
      )
  })
  void app.reloadCatalog()
}

if (document.getElementById(HOST_ID) === null) mount()
