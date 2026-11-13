import type { TabLock } from '../ports'

/**
 * A lock shared by every tab of the same origin, held for the lifetime of one task.
 * The browser releases it by itself when the tab is closed, reloaded or crashes.
 */
export const createWebTabLock = (locks: LockManager, name: string): TabLock => ({
  acquire: () =>
    new Promise((resolve) => {
      void locks.request(name, { ifAvailable: true }, (lock) => {
        if (lock === null) {
          resolve(null)
          return
        }
        return new Promise<void>((release) => resolve(release))
      })
    }),
})
