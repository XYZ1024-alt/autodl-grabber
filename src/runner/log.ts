export type LogLevel = 'info' | 'warn' | 'error'

export type LogEntry = { at: number; level: LogLevel; text: string }

export type Log = {
  add: (level: LogLevel, text: string) => void
  entries: () => readonly LogEntry[]
  clear: () => void
  subscribe: (listener: () => void) => () => void
}

const HIDDEN = '[已隐藏]'
/** Three dot-separated base64url segments: the shape of the AutoDL login token (a JWT). */
const JWT = /[\w-]{12,}\.[\w-]{12,}\.[\w-]{12,}/g
const SECRET_FIELD = /(authorization|token|cookie|passw(?:or)?d|secret)(["'\s:=]+)([^\s"',;&}]+)/gi

/** Removes credentials from text before it is shown. Messages from the platform pass through here too. */
export const redact = (text: string): string =>
  text
    .replace(JWT, HIDDEN)
    .replace(SECRET_FIELD, (_match, name: string, separator: string) => `${name}${separator}${HIDDEN}`)

export const createLog = (limit = 300): Log => {
  let entries: LogEntry[] = []
  const listeners = new Set<() => void>()
  const publish = () => {
    for (const listener of listeners) listener()
  }
  return {
    add: (level, text) => {
      entries = [...entries, { at: Date.now(), level, text: redact(text) }].slice(-limit)
      publish()
    },
    entries: () => entries,
    clear: () => {
      entries = []
      publish()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
