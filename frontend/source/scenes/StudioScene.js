import Phaser from 'phaser'

const stations = [
  { id: 'researcher', name: 'Researcher', sheet: '017', color: 0x78cab8, accent: '#78cab8' },
  { id: 'writer', name: 'Writer', sheet: '019', color: 0xc5acf2, accent: '#c5acf2' },
  { id: 'courier', name: 'Courier', sheet: '007', color: 0xedbf7c, accent: '#edbf7c' },
]
const textStyle = { fontFamily: 'Consolas, monospace', color: '#e7edf5' }

// Pixel bounds inspected in the supplied 32×32 sheets. Furniture spans multiple tiles.
const officeFrames = {
  'office-walls': {
    floor: [320, 224, 32, 32],
    backWall: [192, 224, 32, 64],
    sideWall: [26, 128, 6, 32],
    frontWall: [32, 122, 32, 6],
    window: [320, 288, 64, 64],
  },
  'office-furniture': {
    desk: [416, 0, 64, 64],
    researcherComputer: [64, 224, 64, 64],
    writerComputer: [128, 224, 64, 64],
    courierComputer: [0, 224, 64, 64],
    chair: [384, 256, 32, 64],
    chairUp: [416, 256, 32, 64],
    shelf: [128, 32, 64, 64],
    cabinet: [320, 128, 32, 64],
    plant: [384, 0, 32, 32],
    waterCooler: [384, 320, 32, 64],
  },
}
const roomSize = { width: 576, height: 256 }
// Inspected rows: front/down, left, right, back/up; middle column is idle.
const directions = { down: 0, left: 3, right: 6, up: 9 }
class AnimationCancelled extends Error {}

export default class StudioScene extends Phaser.Scene {
  constructor() {
    super('studio')
  }

  preload() {
    this.load.image('office-walls', `${import.meta.env.BASE_URL}assets/office/Office_Walls_32x32.png`)
    this.load.image('office-furniture', `${import.meta.env.BASE_URL}assets/office/Office_Furniture_32x32.png`)
    // Three 20×32 columns, four rows; the last four sheet pixels are padding.
    // Phaser floors the column count, so the padding is never a frame.
    stations.forEach(({ id, sheet }) => {
      this.load.spritesheet(id, `${import.meta.env.BASE_URL}assets/characters/${sheet}.png`, {
        frameWidth: 20,
        frameHeight: 32,
        endFrame: 11,
      })
    })
  }

  create() {
    Object.entries(officeFrames).forEach(([key, frames]) => {
      const texture = this.textures.get(key)
      Object.entries(frames).forEach(([name, bounds]) => {
        if (!texture.has(name)) texture.add(name, 0, ...bounds)
      })
    })
    this.office = this.add.container(0, 0)
    this.buildOffice()
    this.title = this.add.text(0, 0, 'Agent Studio', {
      ...textStyle, fontSize: '32px', fontStyle: 'bold',
    })
    this.subtitle = this.add.text(0, 0, 'multi-agent workspace', {
      ...textStyle, fontSize: '13px', color: '#8794a9',
    })

    stations.forEach(({ id }) => {
      Object.entries(directions).forEach(([direction, start]) => {
        const key = `${id}-walk-${direction}`
        if (!this.anims.exists(key)) {
          this.anims.create({
            key,
            frames: [start, start + 1, start + 2, start + 1].map((frame) => ({ key: id, frame })),
            frameRate: 10,
            repeat: -1,
          })
        }
      })
    })
    // Preserve the selected sheets, initial front-facing frame, and crisp 3× scale.
    this.agents = Object.fromEntries(stations.map(({ id }) => [id,
      this.add.sprite(0, 0, id, 1).setOrigin(0.5, 1).setScale(3),
    ]))
    this.workstations = Object.fromEntries(stations.map((station) => [station.id, {
      name: this.add.text(0, 0, station.name, {
        ...textStyle, fontSize: '14px', color: station.accent,
        backgroundColor: '#10151f', padding: { x: 4, y: 2 },
      })
        .setOrigin(0.5),
      status: this.add.text(0, 0, 'idle', {
        ...textStyle, fontSize: '12px', color: station.accent,
        backgroundColor: '#10151f', padding: { x: 4, y: 2 },
      }).setOrigin(0.5),
    }]))

    this.agentEffects = Object.fromEntries(stations.map(({ id, color }) => [id, {
      highlight: this.add.rectangle(0, 0, 68, 104, color, 0.08)
        .setStrokeStyle(2, color).setDepth(1).setVisible(false),
      pulse: null,
      bubble: null,
    }]))
    Object.values(this.agents).forEach((sprite) => sprite.setDepth(2))
    this.seatedAgents = new Set()
    // The existing chair backrest/front overlaps the seated character's lower body.
    this.chairFronts = Object.fromEntries(stations.map(({ id }) => [id,
      this.add.image(0, 0, 'office-furniture', 'chair').setOrigin(0)
        .setCrop(0, 22, 32, 42).setDepth(2.5).setVisible(false),
    ]))
    Object.values(this.workstations).forEach(({ name, status }) => {
      name.setDepth(3)
      status.setDepth(3)
    })
    this.documents = new Set()
    this.animationEpoch = 0
    this.pendingAnimations = new Set()
    this.eventQueue = Promise.resolve()
    // Room coordinates stay fixed even when the responsive canvas resizes.
    this.agentPositions = Object.fromEntries(stations.map(({ id }, index) => [id, {
      idlePosition: { x: 128 + index * 160, y: 184 },
      workPosition: { x: 128 + index * 160, y: 160 },
      // Align the body with this chair's backrest, immediately at the desk edge.
      seatPosition: { x: this.chairs[id].x + 16, y: this.chairs[id].y + 40 },
      handoffPosition: { x: index === 0 ? 208 : 368, y: 214 },
    }]))
    this.actorPositions = Object.fromEntries(stations.map(({ id }) => [id,
      { ...this.agentPositions[id].idlePosition },
    ]))

    this.layout(this.scale.gameSize)
    this.scale.on('resize', this.layout, this)
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.layout, this)
      this.animationEpoch++
      for (const cancel of [...this.pendingAnimations]) cancel()
      // Phaser owns destruction of scene objects and tweens on shutdown.
      this.documents.clear()
    })
    this.game.events.emit('studio-ready', this)
  }

  clearAgentEffect(id) {
    const effect = this.agentEffects[id]
    effect.pulse?.stop()
    effect.pulse = null
    effect.bubble?.destroy()
    effect.bubble = null
    effect.highlight.setVisible(false).setAlpha(1)
  }

  resetAgentStates() {
    this.animationEpoch++
    for (const cancel of [...this.pendingAnimations]) cancel()
    this.eventQueue = Promise.resolve()
    stations.forEach(({ id, accent }) => {
      this.clearAgentEffect(id)
      this.workstations[id].status.setText('idle').setColor(accent)
      this.standUp(id)
      this.agents[id].anims.stop()
      this.agents[id].setFrame(1)
      Object.assign(this.actorPositions[id], this.agentPositions[id].idlePosition)
    })
    this.documents.forEach((document) => {
      this.tweens.killTweensOf(document)
      document.destroy()
    })
    this.documents.clear()
    this.syncActors()
  }

  showWorking(id, color) {
    const effect = this.agentEffects[id]
    effect.highlight.setFillStyle(color, 0.08).setStrokeStyle(2, color).setVisible(true)
    if (!effect.pulse) {
      effect.highlight.setAlpha(0.3)
      effect.pulse = this.tweens.add({
        targets: effect.highlight,
        alpha: 0.85,
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    }
  }

  handleEvent(event) {
    const epoch = this.animationEpoch
    // Nothing here awaits or controls Python: the socket only appends visual work.
    this.eventQueue = this.eventQueue.then(() => {
      if (epoch === this.animationEpoch) return this.processEvent(event, epoch)
    }).catch((error) => {
      if (!(error instanceof AnimationCancelled)) {
        console.error('[Agent Studio] Visual animation failed:', event, error)
      }
    })
    return this.eventQueue
  }

  async processEvent(event, epoch) {
    const station = stations.find(({ id }) => id === event.agent)
    if (!station) return
    const { id, color, accent } = station
    const effect = this.agentEffects[id]
    const status = this.workstations[id].status

    switch (event.type) {
      case 'spawn':
        this.clearAgentEffect(id)
        status.setText('READY').setColor(accent)
        effect.highlight.setFillStyle(color, 0.08).setStrokeStyle(2, color)
          .setAlpha(0.65).setVisible(true)
        break
      case 'working':
        status.setText('WORKING...').setColor(accent)
        this.showWorking(id, color)
        await this.sitAtWorkstation(id, epoch)
        if (id === 'writer') this.showBubble(id, 'WRITING...')
        break
      case 'tool_start': {
        await this.sitAtWorkstation(id, epoch)
        this.showWorking(id, color)
        const labels = { research: 'RESEARCHING', save_file: 'SAVING REPORT', send_email: 'SENDING EMAIL' }
        this.showBubble(id, labels[event.tool] || 'USING TOOL')
        // Keep fast tool calls legible even if tool_end is already queued.
        await this.pause(250, epoch)
        break
      }
      case 'tool_end':
        await this.sitAtWorkstation(id, epoch)
        effect.bubble?.destroy()
        effect.bubble = null
        break
      case 'done':
        this.clearAgentEffect(id)
        status.setText(id === 'courier' ? 'DELIVERED ✓' : 'DONE ✓').setColor(accent)
        if (id === 'courier') {
          await this.showDelivery(epoch)
          await this.pause(250, epoch)
          await this.walkTo(id, this.agentPositions[id].idlePosition, epoch)
          this.face(id, 'down')
        }
        break
      case 'error':
        this.clearAgentEffect(id)
        status.setText('ERROR !').setColor('#ff8888')
        effect.highlight.setFillStyle(0xff6666, 0.12).setStrokeStyle(2, 0xff6666)
          .setAlpha(0.9).setVisible(true)
        break
      case 'handoff':
        await this.showHandoff(id, epoch)
        break
    }
  }

  showBubble(id, message) {
    const effect = this.agentEffects[id]
    effect.bubble?.destroy()
    effect.bubble = this.add.text(0, 0, message, {
      ...textStyle, fontSize: '12px',
      color: stations.find((station) => station.id === id).accent,
      backgroundColor: '#10151f', padding: { x: 6, y: 5 },
    }).setOrigin(0.5, 1).setDepth(10)
    this.positionAgentEffect(id)
  }

  face(id, direction) {
    this.agents[id].anims.stop()
    this.agents[id].setFrame(directions[direction] + 1)
  }

  async sitAtWorkstation(id, epoch) {
    if (this.seatedAgents.has(id)) return
    const { workPosition, seatPosition } = this.agentPositions[id]
    await this.walkTo(id, workPosition, epoch)
    await this.walkTo(id, { x: seatPosition.x, y: workPosition.y }, epoch)
    await this.walkTo(id, seatPosition, epoch)
    if (epoch !== this.animationEpoch) throw new AnimationCancelled()
    this.face(id, 'up')
    // Hide six source-pixel rows of legs without changing sprite scale or shape.
    this.agents[id].setCrop(0, 0, 20, 26).setDepth(2)
    this.seatedAgents.add(id)
    this.chairs[id].setFrame('chairUp')
    this.chairFronts[id].setFrame('chairUp').setVisible(true)
    this.syncActors()
  }

  standUp(id) {
    this.seatedAgents.delete(id)
    this.agents[id].setCrop().setDepth(2)
    this.chairs[id].setFrame('chair')
    this.chairFronts[id].setFrame('chair').setVisible(false)
    this.syncActors()
  }

  animate(config, epoch) {
    if (epoch !== this.animationEpoch) return Promise.reject(new AnimationCancelled())
    return new Promise((resolve, reject) => {
      let settled = false
      let tween
      const finish = (cancelled) => {
        if (settled) return
        settled = true
        this.pendingAnimations.delete(cancel)
        if (cancelled) reject(new AnimationCancelled())
        else resolve()
      }
      const cancel = () => {
        tween?.stop()
        finish(true)
      }
      this.pendingAnimations.add(cancel)
      tween = this.tweens.add({
        ...config,
        onComplete: () => finish(false),
        onStop: () => finish(true),
      })
    })
  }

  pause(duration, epoch) {
    return this.animate({ targets: { progress: 0 }, progress: 1, duration }, epoch)
  }

  async walkTo(id, destination, epoch) {
    if (epoch !== this.animationEpoch) throw new AnimationCancelled()
    const position = this.actorPositions[id]
    const dx = destination.x - position.x
    const dy = destination.y - position.y
    const distance = Math.hypot(dx, dy)
    if (distance < 0.1) return
    this.standUp(id)
    const direction = Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')
    this.agents[id].play(`${id}-walk-${direction}`, true)
    await this.animate({
      targets: position,
      x: destination.x,
      y: destination.y,
      duration: Phaser.Math.Clamp(distance / 420 * 1000, 120, 350),
      ease: 'Linear',
      onUpdate: () => this.syncActors(),
    }, epoch)
    if (epoch !== this.animationEpoch) throw new AnimationCancelled()
    this.face(id, direction)
    this.syncActors()
  }

  async walkViaAisle(id, destination, epoch) {
    const position = this.actorPositions[id]
    await this.walkTo(id, { x: position.x, y: 214 }, epoch)
    await this.walkTo(id, { x: destination.x, y: 214 }, epoch)
    await this.walkTo(id, destination, epoch)
  }

  syncActors() {
    if (!this.roomTransform) return
    const { left, top, scale } = this.roomTransform
    stations.forEach(({ id }) => {
      const position = this.actorPositions[id]
      // Preserve the sitting crop offset as the body moves up onto the backrest.
      const seatedOffset = this.seatedAgents.has(id) ? 18 - 10 * scale : 0
      this.agents[id].setPosition(left + position.x * scale, top + position.y * scale + seatedOffset)
      this.chairFronts[id].setPosition(left + this.chairs[id].x * scale, top + this.chairs[id].y * scale)
        .setScale(scale)
      this.positionAgentEffect(id)
    })
    this.documents.forEach((document) => {
      if (!document.carrier) return
      const carrier = this.agents[document.carrier]
      document.setPosition(carrier.x + 24, carrier.y - 44)
    })
  }

  update() {
    this.syncActors()
  }

  positionAgentEffect(id) {
    const sprite = this.agents[id]
    const effect = this.agentEffects[id]
    effect.highlight.setPosition(sprite.x, sprite.y - sprite.displayHeight / 2)
    if (effect.bubble) {
      const halfWidth = effect.bubble.width / 2 + 4
      effect.bubble.setPosition(
        Phaser.Math.Clamp(sprite.x, halfWidth, this.scale.width - halfWidth),
        sprite.y - sprite.displayHeight - 10,
      )
    }
  }

  async showHandoff(id, epoch) {
    const nextId = { researcher: 'writer', writer: 'courier' }[id]
    if (!nextId) return
    const page = this.add.graphics()
    page.fillStyle(0xe7edf5).fillRect(-7, -10, 14, 20)
    page.lineStyle(1, 0x34445b).strokeRect(-7, -10, 14, 20)
    page.fillStyle(0x34445b)
    for (let y = -4; y <= 4; y += 4) page.fillRect(-4, y, 8, 1)
    const document = this.add.container(0, 0, [page])
      .setScale(2).setDepth(20)
    document.carrier = id
    this.documents.add(document)
    this.syncActors()
    const meeting = this.agentPositions[id].handoffPosition
    // Leave room for two 60px-wide characters, including on narrow screens.
    const offset = Math.max(16, 34 / this.roomTransform.scale)
    try {
      await Promise.all([
        this.walkViaAisle(id, { x: meeting.x - offset, y: meeting.y }, epoch),
        this.walkViaAisle(nextId, { x: meeting.x + offset, y: meeting.y }, epoch),
      ])
      this.face(id, 'right')
      this.face(nextId, 'left')
      document.carrier = nextId
      this.syncActors()
      this.showBubble(nextId, 'REPORT RECEIVED')
      await this.pause(300, epoch)
      this.agentEffects[nextId].bubble?.destroy()
      this.agentEffects[nextId].bubble = null
      await Promise.all([
        this.walkViaAisle(id, this.agentPositions[id].idlePosition, epoch),
        this.walkViaAisle(nextId, this.agentPositions[nextId].workPosition, epoch),
      ])
      this.face(id, 'down')
      await this.sitAtWorkstation(nextId, epoch)
    } finally {
      if (this.documents.delete(document)) document.destroy()
    }
  }

  async showDelivery(epoch) {
    const sprite = this.agents.courier
    const ink = this.add.graphics()
    ink.fillStyle(0xe7edf5).fillRect(-10, -7, 20, 14)
    ink.lineStyle(1, 0x34445b).strokeRect(-10, -7, 20, 14)
    ink.lineBetween(-10, -7, 0, 1).lineBetween(0, 1, 10, -7)
    const envelope = this.add.container(sprite.x + 20, sprite.y - 60, [ink])
      .setScale(2).setDepth(20)
    this.documents.add(envelope)
    try {
      await this.animate({
        targets: envelope,
        x: Math.min(this.scale.width - 24, envelope.x + 100),
        y: envelope.y - 64,
        alpha: 0,
        duration: 500,
        ease: 'Sine.easeOut',
      }, epoch)
    } finally {
      if (this.documents.delete(envelope)) envelope.destroy()
    }
  }

  buildOffice() {
    const tile = (x, y, width, height, frame) => {
      this.office.add(this.add.tileSprite(x, y, width, height, 'office-walls', frame)
        .setOrigin(0))
    }
    const furniture = (x, y, frame, texture = 'office-furniture') => {
      const image = this.add.image(x, y, texture, frame).setOrigin(0)
      this.office.add(image)
      return image
    }

    tile(0, 64, roomSize.width, roomSize.height - 64, 'floor')
    tile(0, 0, roomSize.width, 64, 'backWall')
    tile(0, 64, 6, roomSize.height - 64, 'sideWall')
    tile(roomSize.width - 6, 64, 6, roomSize.height - 64, 'sideWall')
    tile(0, roomSize.height - 6, roomSize.width, 6, 'frontWall')

    furniture(176, 0, 'window', 'office-walls')
    furniture(336, 0, 'window', 'office-walls')
    furniture(16, 8, 'shelf')
    furniture(528, 12, 'cabinet')
    furniture(80, 22, 'plant')
    furniture(472, 22, 'plant')
    furniture(20, 92, 'waterCooler')
    furniture(524, 114, 'plant')

    // No partitions: the lower floor and gaps between desks form a shared aisle.
    this.chairs = {}
    stations.forEach(({ id }, index) => {
      const x = 128 + index * 160
      furniture(x - 32, 72, 'desk')
      furniture(x - 32, 52, `${id}Computer`)
      // Center the 32px chair under the desk; seated characters follow its center.
      this.chairs[id] = furniture(x - 16, 108, 'chair')
    })
  }

  layout({ width, height }) {
    const narrow = width < 600
    const margin = narrow ? 16 : Math.min(64, Math.round(width * 0.05))
    const top = 122
    const scale = Math.min(
      (width - margin * 2) / roomSize.width,
      (height - top - 24) / roomSize.height,
      2,
    )
    const left = Math.round((width - roomSize.width * scale) / 2)
    const roomTop = Math.round(top + (height - top - 24 - roomSize.height * scale) / 2)

    this.title.setPosition(margin, 28).setFontSize(narrow ? 26 : 32)
    this.subtitle.setPosition(margin, 72)
    this.office.setPosition(left, roomTop).setScale(scale)
    this.roomTransform = { left, top: roomTop, scale }

    stations.forEach((station, index) => {
      const centerX = Math.round(left + (128 + index * 160) * scale)
      const feetY = Math.round(roomTop + 184 * scale)
      const workstation = this.workstations[station.id]
      workstation.name.setPosition(centerX, feetY + 18).setFontSize(narrow ? 11 : 14)
      workstation.status.setPosition(centerX, feetY + 40)
    })
    this.syncActors()
  }
}
