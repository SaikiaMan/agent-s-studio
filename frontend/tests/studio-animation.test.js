import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'

const sceneUrl = new URL('../source/scenes/StudioScene.js', import.meta.url)
const publicUrl = new URL('../public/', import.meta.url)
const ids = ['researcher', 'writer', 'courier']
const tick = () => new Promise((resolve) => setImmediate(resolve))

// Run the real scene code with deterministic Phaser objects/tweens, without a browser.
function createScene() {
  const frames = new Map()
  const animations = new Map()
  const finiteTweens = new Set()
  const history = []
  let scene
  function object(kind, values = []) {
    return {
      kind, values, width: 108, displayHeight: 32, x: values[0] || 0, y: values[1] || 0,
      frame: values[3], anims: { stop() {} },
      setOrigin() { return this }, setPosition(x, y) { this.x = x; this.y = y; return this },
      setScale(scale) { this.scale = scale; this.displayHeight = 32 * scale; return this },
      setFrame(frame) { this.frame = frame; return this },
      setCrop(...crop) { this.crop = crop; return this },
      play(key) { assert(animations.has(key)); this.animation = key; return this },
      setText(text) { this.text = text; return this }, setColor() { return this },
      setDepth(depth) { this.depth = depth; return this }, setFontSize() { return this }, setFillStyle() { return this },
      setStrokeStyle() { return this }, setAlpha(alpha) { this.alpha = alpha; return this },
      setVisible(visible) { this.visible = visible; return this },
      add() { return this }, destroy() { this.destroyed = true },
      fillStyle() { return this }, fillRect() { return this }, lineStyle() { return this },
      strokeRect() { return this }, lineBetween() { return this },
    }
  }
  class MockScene {
    constructor() {
      this.load = {
        image(key, path) { assert(fs.existsSync(new URL(path.slice(1), publicUrl))) },
        spritesheet(key, path, config) {
          const png = fs.readFileSync(new URL(path.slice(1), publicUrl))
          assert.equal(png.readUInt32BE(16), 64)
          assert.equal(png.readUInt32BE(20), 128)
          assert.equal(config.frameWidth, 20)
          assert.equal(config.frameHeight, 32)
        },
      }
      this.textures = { get(key) {
        if (!frames.has(key)) frames.set(key, new Map())
        return {
          has: (name) => frames.get(key).has(name),
          add(name, index, x, y, width, height) {
            const [w, h] = key === 'office-walls' ? [448, 416] : [640, 512]
            assert(x >= 0 && y >= 0 && x + width <= w && y + height <= h)
            frames.get(key).set(name, [x, y, width, height])
          },
        }
      } }
      this.anims = {
        exists: (key) => animations.has(key),
        create: (config) => animations.set(config.key, config),
      }
      this.add = Object.fromEntries(['sprite', 'text', 'rectangle', 'graphics', 'container', 'image', 'tileSprite']
        .map((kind) => [kind, (...values) => {
          if (kind === 'text' && values[2] === 'REPORT RECEIVED') {
            history.push({ receivedBy: [...scene.documents][0].carrier })
          }
          return object(kind, values)
        }]))
      this.scale = { width: 1200, gameSize: { width: 1200, height: 606 }, on() {}, off() {} }
      this.events = { once() {} }
      this.game = { events: { emit() {} } }
      this.tweens = {
        add(config) {
          const id = ids.find((id) => scene.actorPositions?.[id] === config.targets)
          if (id) history.push({ id, from: { ...config.targets }, x: config.x, y: config.y,
            duration: config.duration, animation: scene.agents[id].animation,
            crop: [...scene.agents[id].crop], chairVisible: scene.chairFronts[id].visible })
          const tween = {
            config,
            stop() { finiteTweens.delete(tween); config.onStop?.() },
            complete() {
              finiteTweens.delete(tween)
              for (const key of ['x', 'y', 'alpha', 'progress']) {
                if (key in config) config.targets[key] = config[key]
              }
              config.onUpdate?.()
              config.onComplete?.()
            },
          }
          if (config.repeat !== -1) finiteTweens.add(tween)
          return tween
        },
        killTweensOf(target) {
          for (const tween of finiteTweens) if (tween.config.targets === target) tween.stop()
        },
      }
    }
  }
  const context = { Phaser: { Scene: MockScene, Math: {
    Clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
  } }, console }
  const source = fs.readFileSync(sceneUrl, 'utf8')
    .replace("import Phaser from 'phaser'", '')
    .replaceAll('import.meta.env.BASE_URL', "'/'")
    .replace('export default class StudioScene', 'globalThis.StudioScene = class StudioScene')
  vm.runInNewContext(source, context)
  scene = new context.StudioScene()
  scene.preload()
  scene.create()
  return {
    scene, animations, history, finiteTweens,
    async flush() {
      for (let i = 0; i < 100; i++) {
        await tick()
        if (!finiteTweens.size) { await scene.eventQueue; return }
        for (const tween of [...finiteTweens]) tween.complete()
      }
      throw new Error('Visual queue did not drain')
    },
  }
}

test('directional rows, selected characters, scale, and initial positions stay correct', () => {
  const { scene, animations } = createScene()
  for (const id of ids) {
    assert.equal(scene.agents[id].values[2], id)
    assert.equal(scene.agents[id].frame, 1)
    assert.equal(scene.agents[id].scale, 3)
    for (const [direction, start] of Object.entries({ down: 0, left: 3, right: 6, up: 9 })) {
      const frames = animations.get(`${id}-walk-${direction}`).frames
      assert.deepEqual(Array.from(frames, (frame) => frame.frame), [start, start + 1, start + 2, start + 1])
    }
  }
})

test('a fast backend burst plays sequentially, physically hands off, and delivers', async () => {
  const { scene, history, flush } = createScene()
  let active = 0
  let maxActive = 0
  const process = scene.processEvent.bind(scene)
  scene.processEvent = async (...args) => {
    maxActive = Math.max(maxActive, ++active)
    try { return await process(...args) } finally { active-- }
  }
  for (const [id, tool] of [['researcher', 'research'], ['writer', 'save_file'], ['courier', 'send_email']]) {
    for (const type of ['spawn', 'working', 'tool_start', 'tool_end', 'done']) {
      scene.handleEvent({ agent: id, type, tool })
    }
    if (id !== 'courier') scene.handleEvent({ agent: id, type: 'handoff' })
  }
  await flush()
  assert.equal(maxActive, 1)
  assert.deepEqual(history.filter((entry) => entry.receivedBy).map((entry) => entry.receivedBy), ['writer', 'courier'])
  assert.equal(scene.workstations.researcher.status.text, 'DONE \u2713')
  assert.equal(scene.workstations.writer.status.text, 'DONE \u2713')
  assert.equal(scene.workstations.courier.status.text, 'DELIVERED \u2713')
  for (const id of ids) {
    assert.equal(scene.actorPositions[id].x, scene.agentPositions[id].idlePosition.x)
    assert.equal(scene.actorPositions[id].y, scene.agentPositions[id].idlePosition.y)
    assert.equal(scene.agents[id].frame, 1)
  }
  for (const move of history.filter((entry) => entry.id)) {
    assert(move.duration <= 350)
    const courierReturn = move.id === 'courier'
      && move.x === scene.agentPositions.courier.idlePosition.x
      && move.y === scene.agentPositions.courier.idlePosition.y
    assert(move.x === move.from.x || move.y === move.from.y || courierReturn, 'handoff routes should use the clear aisle')
    assert.deepEqual(move.crop, [], 'walking must restore all legs')
    assert.equal(move.chairVisible, false, 'chair foreground must not follow a walking agent')
    const direction = move.x > move.from.x ? 'right' : move.x < move.from.x ? 'left'
      : move.y > move.from.y ? 'down' : 'up'
    assert.equal(move.animation, `${move.id}-walk-${direction}`)
  }
  assert.equal(scene.documents.size, 0)
  assert.equal(scene.pendingAnimations.size, 0)
})

test('reset cancels a handoff and queued stale events without corrupting the next run', async () => {
  const { scene, finiteTweens, flush } = createScene()
  scene.handleEvent({ agent: 'researcher', type: 'handoff' })
  scene.handleEvent({ agent: 'writer', type: 'working' })
  await tick()
  assert(finiteTweens.size > 0)
  const oldDocument = [...scene.documents][0]
  scene.resetAgentStates()
  assert(oldDocument.destroyed)
  assert.equal(finiteTweens.size, 0)
  scene.handleEvent({ agent: 'researcher', type: 'working' })
  scene.handleEvent({ agent: 'researcher', type: 'error' })
  await flush()
  assert.equal(scene.workstations.writer.status.text, 'idle')
  assert.equal(scene.workstations.researcher.status.text, 'ERROR !')
  assert.equal(scene.agents.researcher.frame, 10)
  assert.equal(scene.documents.size, 0)
  assert.equal(scene.agentEffects.researcher.pulse, null)
})

test('tool bubbles wait for desk arrival and clear after fast tool_end events', async () => {
  for (const [id, tool, label] of [
    ['researcher', 'research', 'RESEARCHING'],
    ['writer', 'save_file', 'SAVING REPORT'],
    ['courier', 'send_email', 'SENDING EMAIL'],
  ]) {
    const { scene, finiteTweens, flush } = createScene()
    scene.handleEvent({ agent: id, type: 'working' })
    scene.handleEvent({ agent: id, type: 'tool_start', tool })
    for (let i = 0; i < 8; i++) {
      await tick()
      if (scene.agentEffects[id].bubble?.values[2] === label) break
      for (const tween of [...finiteTweens]) tween.complete()
    }
    const bubble = scene.agentEffects[id].bubble
    assert.equal(bubble.values[2], label)
    assert.equal(scene.actorPositions[id].y, scene.agentPositions[id].seatPosition.y)
    assert.equal(scene.actorPositions[id].x, scene.agentPositions[id].seatPosition.x)
    assert.equal(scene.actorPositions[id].x, scene.chairs[id].x + 16)
    assert.equal(scene.actorPositions[id].x, scene.agentPositions[id].workPosition.x)
    assert.equal(scene.actorPositions[id].y, scene.chairs[id].y + 40)
    assert.deepEqual(scene.chairFronts[id].crop, [0, 22, 32, 42])
    assert.equal(scene.agents[id].frame, 10)
    assert.deepEqual(scene.agents[id].crop, [0, 0, 20, 26])
    assert.equal(scene.chairFronts[id].visible, true)
    assert.equal(scene.chairs[id].frame, 'chairUp')
    assert.equal(scene.chairFronts[id].frame, 'chairUp')
    scene.handleEvent({ agent: id, type: 'tool_end', tool })
    await flush()
    assert(bubble.destroyed)
    assert.equal(scene.agentEffects[id].bubble, null)
    assert.equal(scene.seatedAgents.has(id), true)
    assert.equal(scene.agents[id].frame, 10)
  }
})

test('handoff recipient sits in the unchanged chair and reset restores the normal sprite', async () => {
  const { scene, flush } = createScene()
  scene.handleEvent({ agent: 'researcher', type: 'working' })
  scene.handleEvent({ agent: 'researcher', type: 'handoff' })
  await flush()
  assert.equal(scene.seatedAgents.has('researcher'), false)
  assert.equal(scene.seatedAgents.has('writer'), true)
  assert.equal(scene.actorPositions.writer.x, 288)
  assert.equal(scene.actorPositions.writer.y, 148)
  assert.deepEqual(scene.agents.writer.crop, [0, 0, 20, 26])
  scene.scale.width = 360
  scene.layout({ width: 360, height: 340 })
  const { top, scale } = scene.roomTransform
  assert(Math.abs(scene.agents.writer.y - 18 - (top + 138 * scale)) < 1e-9)
  assert.equal(scene.agents.writer.scale, 3)
  scene.resetAgentStates()
  for (const id of ids) {
    assert.deepEqual(scene.agents[id].crop, [])
    assert.equal(scene.agents[id].depth, 2)
    assert.equal(scene.chairFronts[id].visible, false)
    assert.equal(scene.chairs[id].frame, 'chair')
    assert.equal(scene.agents[id].frame, 1)
  }
})

test('resize preserves world movement rather than teleporting agents to idle', async () => {
  const { scene, flush } = createScene()
  scene.handleEvent({ agent: 'writer', type: 'working' })
  await tick()
  const before = { ...scene.actorPositions.writer }
  scene.scale.width = 360
  scene.layout({ width: 360, height: 340 })
  assert.equal(scene.actorPositions.writer.x, before.x)
  assert.equal(scene.actorPositions.writer.y, before.y)
  await flush()
  assert.equal(scene.actorPositions.writer.y, scene.agentPositions.writer.seatPosition.y)
  assert.equal(scene.agents.writer.frame, 10)
  assert.equal(scene.agents.writer.scale, 3)
})
