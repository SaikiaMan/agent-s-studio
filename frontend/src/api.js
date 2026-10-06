// Local Vite talks directly to FastAPI; deployed pages use same-origin Services.
const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
export const API_BASE_URL = local
  ? 'http://127.0.0.1:8000'
  : `${window.location.origin}/api`

export const WORKFLOW_URL = `${API_BASE_URL}/run`
const socketUrl = new URL(`${API_BASE_URL}/ws`)
socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:'
export const WS_URL = socketUrl.href
