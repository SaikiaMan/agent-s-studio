import { WS_URL } from './api.js'

const AGENTS = new Set(['researcher', 'writer', 'courier'])
const TYPES = new Set(['spawn', 'working', 'tool_start', 'tool_end', 'handoff', 'done', 'error'])

export function createEventSocket(onEvent, onStatus = () => {}) {
  let socket = null
  let pending = null
  let reconnectTimer = null
  let retryDelay = 1000
  let stopped = false

  function reconnect() {
    if (stopped || reconnectTimer) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      ensureConnected().catch(() => {})
    }, retryDelay)
    retryDelay = Math.min(retryDelay * 2, 10000)
  }

  function ensureConnected() {
    if (stopped) return Promise.reject(new Error('Event connection is closed.'))
    if (socket?.readyState === WebSocket.OPEN) return Promise.resolve()
    if (pending) return pending
    clearTimeout(reconnectTimer)
    reconnectTimer = null
    onStatus('connecting')

    pending = new Promise((resolve, reject) => {
      const connection = new WebSocket(WS_URL)
      socket = connection
      const timeout = setTimeout(() => {
        reject(new Error('Timed out connecting to Agent Studio.'))
        connection.close()
      }, 8000)

      connection.onopen = () => {
        clearTimeout(timeout)
        retryDelay = 1000
        onStatus('connected')
        resolve()
      }
      connection.onmessage = ({ data }) => {
        if (stopped || socket !== connection) return
        let event
        try {
          event = JSON.parse(data)
        } catch {
          console.warn('[Agent Studio] Invalid JSON event:', data)
          return
        }
        console.log('[Agent Studio] Event:', event)
        if (!event || !AGENTS.has(event.agent) || !TYPES.has(event.type)) {
          console.warn('[Agent Studio] Unsupported event:', event)
          return
        }
        onEvent(event)
      }
      connection.onerror = () => connection.close()
      connection.onclose = () => {
        clearTimeout(timeout)
        reject(new Error('Unable to connect to Agent Studio.'))
        if (socket !== connection) return
        socket = null
        if (!stopped) {
          onStatus('disconnected')
          reconnect()
        }
      }
    }).finally(() => { pending = null })
    return pending
  }

  return {
    ensureConnected,
    close() {
      stopped = true
      clearTimeout(reconnectTimer)
      socket?.close()
    },
  }
}
