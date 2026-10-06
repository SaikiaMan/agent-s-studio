import Phaser from 'phaser'
import StudioScene from './scenes/StudioScene.js'
import { createEventSocket } from '../src/ws.js'
import './style.css'

document.querySelector('#app').innerHTML = `
  <div id="studio" aria-label="Agent Studio: Researcher, Writer, and Courier workstations">
    <header class="studio-header">
      <h1>Agent Studio</h1>
      <p>multi-agent workspace</p>
    </header>
  </div>
  <footer class="control-panel">
    <div class="panel-heading"><span class="indicator"></span> WORKFLOW CONTROL</div>
    <form id="workflow-controls">
      <label for="goal">Goal
        <input id="goal" name="goal" type="text" value="Compare practical uses of AI agents for small teams" />
      </label>
      <label for="recipient">Recipient email
        <input id="recipient" name="recipient" type="email" placeholder="you@example.com" />
      </label>
      <button type="button">Run Workflow <span aria-hidden="true">→</span></button>
    </form>
    <p class="panel-note">Set a goal. Your team is ready when you are.</p>
  </footer>
`

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'studio',
  backgroundColor: '#10151f',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: document.querySelector('#studio').clientWidth,
    height: document.querySelector('#studio').clientHeight,
  },
  scene: [StudioScene],
})

const form = document.querySelector('#workflow-controls')
const button = form.querySelector('button')
const note = document.querySelector('.panel-note')
note.setAttribute('role', 'status')
let busy = false
let scene = null
const queuedEvents = []
const sceneReady = new Promise((resolve) => {
  game.events.once('studio-ready', (readyScene) => {
    scene = readyScene
    queuedEvents.splice(0).forEach((event) => scene.handleEvent(event))
    resolve()
  })
})

function unlock(message) {
  busy = false
  button.disabled = false
  note.textContent = message
}

const socket = createEventSocket((event) => {
  if (scene) scene.handleEvent(event)
  else queuedEvents.push(event)
  if (event.type === 'error') unlock(`${event.agent}: workflow failed. Check the backend logs.`)
  else if (event.agent === 'courier' && event.type === 'done') unlock('Report delivered. Your team is ready for another goal.')
}, (status) => {
  if (status === 'disconnected') {
    note.textContent = busy
      ? 'Connection lost. Reconnecting… The workflow may still be running.'
      : 'Connecting to Agent Studio…'
  } else if (status === 'connected' && !busy) {
    note.textContent = 'Connected. Your team is ready when you are.'
  } else if (status === 'connected' && busy) {
    note.textContent = 'Connected. Waiting for workflow events…'
  }
})
socket.ensureConnected().catch(() => {})

async function startWorkflow(event) {
  event.preventDefault()
  if (busy) return
  const goal = form.elements.goal.value.trim()
  const recipient = form.elements.recipient.value.trim()
  if (!goal || !recipient) {
    note.textContent = 'Enter a goal and recipient email before running.'
    return
  }
  if (!form.reportValidity()) return

  busy = true
  button.disabled = true
  note.textContent = 'Connecting before starting the workflow…'
  try {
    await sceneReady
    await socket.ensureConnected()
    scene.resetAgentStates()
    note.textContent = 'Starting workflow…'
    const response = await fetch('http://127.0.0.1:8000/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal, recipient }),
    })
    if (!response.ok) {
      const responseBody = await response.text()
      throw Object.assign(new Error(`Backend rejected the request (${response.status}).`), {
        status: response.status,
        statusText: response.statusText,
        responseBody,
      })
    }
    // /run only acknowledges startup. Completion comes exclusively through /ws.
    if (busy) note.textContent = 'Workflow running. Follow your team in the office.'
  } catch (error) {
    console.error('[Agent Studio] Workflow request failed:', {
      url: 'http://127.0.0.1:8000/run',
      method: 'POST',
      origin: window.location.origin,
      name: error.name,
      message: error.message,
      status: error.status,
      statusText: error.statusText,
      responseBody: error.responseBody,
      cause: error.cause,
      error,
    })
    unlock(`Could not start workflow: ${error.message}`)
  }
}

button.addEventListener('click', startWorkflow)
form.addEventListener('submit', startWorkflow)

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    socket.close()
    game.destroy(true)
  })
}
