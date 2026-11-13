import { array, number, object, safeParse, string } from 'valibot'
import { parseJson } from '../autodl/http'
import type { PendingCreateStore } from '../ports'

const PendingSchema = object({ sentAt: number(), machineId: string(), knownInstanceIds: array(string()) })

/**
 * Remembers across reloads that a create request was sent and not yet confirmed, so a later task
 * cannot create a second instance before the first result is known. Holds no credentials.
 */
export const createStoredPending = (storage: Storage, key: string): PendingCreateStore => ({
  load: () => {
    const parsed = parseJson(storage.getItem(key) ?? 'null')
    const pending = parsed.ok ? safeParse(PendingSchema, parsed.value) : null
    return pending?.success ? pending.output : null
  },
  save: (pending) => storage.setItem(key, JSON.stringify(pending)),
  clear: () => storage.removeItem(key),
})
