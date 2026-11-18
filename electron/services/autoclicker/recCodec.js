// Codec binário de macros (.rec de 20 bytes) e extrator/compilador compatível com TinyTask 1.77.
// Estrutura de cada registro little-endian (0x14 = 20 bytes):
//   +0x00 uint32 eventType   (0x000 sentinel, 0x100 KeyDown, 0x101 KeyUp, 0x200 MouseMove,
//                             0x201/0x202 LButtonDown/Up, 0x204/0x205 RButtonDown/Up, 0x207/0x208 MButtonDown/Up)
//   +0x04 uint32 param1      (mouse: X | teclado: (scanCode << 8) | vk)
//   +0x08 uint32 param2      (mouse: Y | teclado: scanCode)
//   +0x0c uint32 timestampMs (tick em milissegundos)
//   +0x10 uint32 hwnd        (handle da janela em foco no instante da captura)

export const REC_RECORD_BYTES = 20
export const TINYTASK_BASE_SIZE = 36352

export const EVENT_TYPES = {
  SENTINEL: 0x000,
  KEY_DOWN: 0x100,
  KEY_UP: 0x101,
  MOUSE_MOVE: 0x200,
  LBUTTON_DOWN: 0x201,
  LBUTTON_UP: 0x202,
  RBUTTON_DOWN: 0x204,
  RBUTTON_UP: 0x205,
  MBUTTON_DOWN: 0x207,
  MBUTTON_UP: 0x208
}

function decodeTinyTaskSpeed(rawCode) {
  if (!Number.isFinite(rawCode) || rawCode < 0) return 1
  if (rawCode === 0) return 1
  if (rawCode === 1) return 0.5
  return Math.min(100, Math.max(1, rawCode))
}

function encodeTinyTaskSpeed(speedMultiplier) {
  const s = Number(speedMultiplier)
  if (!Number.isFinite(s) || s <= 0) return 0
  if (Math.abs(s - 0.5) < 0.01) return 1
  if (Math.abs(s - 1) < 0.01) return 0
  return Math.min(99999, Math.max(2, Math.round(s)))
}

function findTinyTaskBaseAnchor(buf) {
  const anchor = Buffer.from('36352\0', 'ascii')
  return buf.indexOf(anchor)
}

/**
 * Inspeciona um executável PE do TinyTask (compilado ou base) e retorna metadados + fatia .rec se houver.
 */
export function inspectTinyTaskExeBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 512 || buf[0] !== 0x4d || buf[1] !== 0x5a) {
    return { isPe: false, isTinyTask: false }
  }
  const anchorOffset = findTinyTaskBaseAnchor(buf)
  if (anchorOffset < 0 || anchorOffset + 26 > buf.length) {
    return { isPe: true, isTinyTask: false }
  }
  const baseSizeStr = buf.subarray(anchorOffset, anchorOffset + 5).toString('ascii')
  const baseSize = Number.parseInt(baseSizeStr, 10) || TINYTASK_BASE_SIZE
  const loopsField = buf.subarray(anchorOffset + 12, anchorOffset + 17).toString('ascii')
  const speedField = buf.subarray(anchorOffset + 20, anchorOffset + 25).toString('ascii')
  const isCompiled = buf.length > baseSize
  const loopsParsed = /^\d+$/.test(loopsField.trim()) ? Number.parseInt(loopsField.trim(), 10) : null
  const speedParsed = /^\d+$/.test(speedField.trim()) ? decodeTinyTaskSpeed(Number.parseInt(speedField.trim(), 10)) : null

  return {
    isPe: true,
    isTinyTask: true,
    isCompiled,
    baseSize,
    totalBytes: buf.length,
    payloadBytes: isCompiled ? buf.length - baseSize : 0,
    loopsField,
    speedField,
    embeddedLoops: loopsParsed,
    embeddedSpeed: speedParsed,
    payload: isCompiled ? buf.subarray(baseSize) : null
  }
}

/**
 * Lê um Buffer contendo um arquivo .rec puro ou um .exe compilado pelo TinyTask.
 */
export function parseRecBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) {
    throw new Error('Arquivo de macro vazio.')
  }

  let sourceKind = 'rec'
  let embeddedLoops = null
  let embeddedSpeed = null
  let payload = buf

  if (buf.length >= 2 && buf[0] === 0x4d && buf[1] === 0x5a) {
    const exeInfo = inspectTinyTaskExeBuffer(buf)
    if (!exeInfo.isTinyTask) {
      throw new Error('Este executável não é um arquivo de macro compatível com TinyTask.')
    }
    if (!exeInfo.isCompiled || !exeInfo.payload || exeInfo.payload.length < REC_RECORD_BYTES) {
      throw new Error('Este executável é apenas o programa base (sem macro compilada embutida).')
    }
    sourceKind = 'tinytask-exe'
    embeddedLoops = exeInfo.embeddedLoops
    embeddedSpeed = exeInfo.embeddedSpeed
    payload = exeInfo.payload
  }

  if (payload.length < REC_RECORD_BYTES || payload.length % REC_RECORD_BYTES !== 0) {
    throw new Error(`Formato .rec inválido: tamanho (${payload.length} bytes) não é múltiplo de 20 bytes.`)
  }

  const totalRecords = payload.length / REC_RECORD_BYTES
  const events = []
  let keyEvents = 0
  let mouseClicks = 0
  let mouseMoves = 0

  for (let i = 0; i < totalRecords; i++) {
    const off = i * REC_RECORD_BYTES
    const eventType = payload.readUInt32LE(off)
    const param1 = payload.readUInt32LE(off + 4)
    const param2 = payload.readUInt32LE(off + 8)
    const timestampMs = payload.readUInt32LE(off + 12)
    const hwnd = payload.readUInt32LE(off + 16)

    if (eventType === 0) {
      // Sentinela inicial (header) é ignorada; sentinelas finais encerram a sequência útil
      if (events.length > 0) break
      continue
    }

    events.push({ eventType, param1, param2, timestampMs, hwnd })
    if (eventType === EVENT_TYPES.KEY_DOWN || eventType === EVENT_TYPES.KEY_UP) keyEvents++
    else if (eventType === EVENT_TYPES.MOUSE_MOVE) mouseMoves++
    else if (eventType >= EVENT_TYPES.LBUTTON_DOWN && eventType <= EVENT_TYPES.MBUTTON_UP) mouseClicks++
  }

  let durationMs = 0
  if (events.length >= 2) {
    const first = events[0].timestampMs
    const last = events[events.length - 1].timestampMs
    durationMs = last >= first ? last - first : 0
  }

  return {
    sourceKind,
    events,
    summary: {
      eventCount: events.length,
      keyEvents,
      mouseClicks,
      mouseMoves,
      durationMs,
      embeddedLoops,
      embeddedSpeed
    }
  }
}

/**
 * Serializa uma lista de eventos para o formato binário .rec de 20 bytes (com 3 registros sentinelas finais).
 */
export function serializeRecBuffer(events = []) {
  const list = Array.isArray(events) ? events.filter((e) => e && Number(e.eventType) > 0) : []
  const sentinelCount = 3
  const out = Buffer.alloc((list.length + sentinelCount) * REC_RECORD_BYTES, 0)

  for (let i = 0; i < list.length; i++) {
    const ev = list[i]
    const off = i * REC_RECORD_BYTES
    out.writeUInt32LE(Number(ev.eventType) >>> 0, off)
    out.writeUInt32LE(Number(ev.param1) >>> 0, off + 4)
    out.writeUInt32LE(Number(ev.param2) >>> 0, off + 8)
    out.writeUInt32LE(Number(ev.timestampMs) >>> 0, off + 12)
    out.writeUInt32LE(Number(ev.hwnd || 0) >>> 0, off + 16)
  }

  return out
}

/**
 * Compila um arquivo .exe standalone usando um binário TinyTask 1.77 como template base:
 * aplica patch nos slots '@@@@@' (loops) e '$$$$$' (velocidade), zera o CheckSum PE e anexa o payload .rec.
 */
export function compileTinyTaskExe(templateBuf, recPayloadBuf, { speed = 1, loops = 1, continuous = false } = {}) {
  const info = inspectTinyTaskExeBuffer(templateBuf)
  if (!info.isTinyTask) {
    throw new Error('O executável base informado não é um stub TinyTask compatível.')
  }
  if (!Buffer.isBuffer(recPayloadBuf) || recPayloadBuf.length < REC_RECORD_BYTES || recPayloadBuf.length % REC_RECORD_BYTES !== 0) {
    throw new Error('Payload .rec inválido para compilação.')
  }

  const stub = Buffer.from(templateBuf.subarray(0, info.baseSize))
  const anchorOffset = findTinyTaskBaseAnchor(stub)

  const effectiveLoops = continuous ? 99999 : Math.min(99999, Math.max(1, Math.trunc(Number(loops) || 1)))
  const effectiveSpeedCode = encodeTinyTaskSpeed(speed)

  const loopsStr = String(effectiveLoops).padStart(5, '0').slice(0, 5)
  const speedStr = String(effectiveSpeedCode).padStart(5, '0').slice(0, 5)

  stub.write(loopsStr, anchorOffset + 12, 5, 'ascii')
  stub.write(speedStr, anchorOffset + 20, 5, 'ascii')

  // Zera o campo CheckSum do cabeçalho opcional PE (e_lfanew -> 'PE\0\0' + 0x58)
  const eLfanew = stub.readUInt32LE(0x3c)
  if (eLfanew > 0 && eLfanew + 0x5c <= stub.length && stub.subarray(eLfanew, eLfanew + 4).equals(Buffer.from('PE\0\0', 'ascii'))) {
    stub.writeUInt32LE(0, eLfanew + 0x58)
  }

  return Buffer.concat([stub, recPayloadBuf])
}

const WAYPOINT_BUTTONS = ['left', 'right', 'middle', 'double']

export function normalizeWaypoint(raw = {}, index = 0) {
  const x = Number.isFinite(Number(raw.x)) ? Math.max(-32768, Math.min(32767, Math.round(Number(raw.x)))) : 0
  const y = Number.isFinite(Number(raw.y)) ? Math.max(-32768, Math.min(32767, Math.round(Number(raw.y)))) : 0
  const button = WAYPOINT_BUTTONS.includes(raw.button) ? raw.button : 'left'
  const moveMs = Number.isFinite(Number(raw.moveMs)) ? Math.max(0, Math.min(30000, Math.round(Number(raw.moveMs)))) : 180
  const waitMs = Number.isFinite(Number(raw.waitMs)) ? Math.max(10, Math.min(600000, Math.round(Number(raw.waitMs)))) : 250
  const holdMs = Number.isFinite(Number(raw.holdMs)) ? Math.max(12, Math.min(5000, Math.round(Number(raw.holdMs)))) : 32
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim().slice(0, 40) : `pt-${index + 1}`
  const label = typeof raw.label === 'string' ? raw.label.trim().slice(0, 48) : ''
  return {
    id,
    label,
    enabled: raw.enabled !== false,
    x,
    y,
    button,
    moveMs,
    waitMs,
    holdMs
  }
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function appendGlideFrames(events, fromX, fromY, toX, toY, startTs, durationMs, arcSign = 1, humanArc = true) {
  const dur = Math.max(0, Math.round(durationMs))
  const dx = toX - fromX
  const dy = toY - fromY
  const dist = Math.hypot(dx, dy)

  if (dur <= 8 || dist < 2) {
    const endTs = startTs + dur
    events.push({
      eventType: EVENT_TYPES.MOUSE_MOVE,
      param1: toX >>> 0,
      param2: toY >>> 0,
      timestampMs: endTs >>> 0,
      hwnd: 0
    })
    return endTs
  }

  // Passo de 8 ms (~125 Hz) com curva Bézier quadrática suave + ease-in-out cúbico para simular mão real
  const stepMs = 8
  const steps = Math.max(2, Math.round(dur / stepMs))
  const midX = (fromX + toX) / 2
  const midY = (fromY + toY) / 2
  const arcMag = humanArc ? Math.min(36, dist * 0.07) * arcSign : 0
  const nx = dist > 0 ? -dy / dist : 0
  const ny = dist > 0 ? dx / dist : 0
  const ctrlX = midX + nx * arcMag
  const ctrlY = midY + ny * arcMag

  let lastX = fromX
  let lastY = fromY

  for (let s = 1; s <= steps; s++) {
    const rawT = s / steps
    const e = easeInOutCubic(rawT)
    const inv = 1 - e
    const px = s === steps ? toX : Math.round(inv * inv * fromX + 2 * inv * e * ctrlX + e * e * toX)
    const py = s === steps ? toY : Math.round(inv * inv * fromY + 2 * inv * e * ctrlY + e * e * toY)
    const ts = startTs + Math.round(rawT * dur)

    if (s === steps || px !== lastX || py !== lastY) {
      lastX = px
      lastY = py
      events.push({
        eventType: EVENT_TYPES.MOUSE_MOVE,
        param1: px >>> 0,
        param2: py >>> 0,
        timestampMs: ts >>> 0,
        hwnd: 0
      })
    }
  }

  return startTs + dur
}

function buttonCodes(button) {
  if (button === 'right') return [EVENT_TYPES.RBUTTON_DOWN, EVENT_TYPES.RBUTTON_UP]
  if (button === 'middle') return [EVENT_TYPES.MBUTTON_DOWN, EVENT_TYPES.MBUTTON_UP]
  return [EVENT_TYPES.LBUTTON_DOWN, EVENT_TYPES.LBUTTON_UP]
}

/**
 * Converte uma lista ordenada de pontos (waypoints) em uma sequência de eventos .rec com
 * movimento real interpolado entre os pontos e fechamento suave de ciclo de volta ao Ponto #1.
 */
export function compileWaypointsToEvents(waypoints = [], { humanArc = true, loopClosure = true } = {}) {
  const active = (Array.isArray(waypoints) ? waypoints : [])
    .map((p, i) => normalizeWaypoint(p, i))
    .filter((p) => p.enabled)

  if (active.length === 0) return []

  const events = []
  let ts = 0

  // Posiciona no Ponto #1 no início do ciclo
  const first = active[0]
  events.push({
    eventType: EVENT_TYPES.MOUSE_MOVE,
    param1: first.x >>> 0,
    param2: first.y >>> 0,
    timestampMs: 0,
    hwnd: 0
  })

  for (let i = 0; i < active.length; i++) {
    const pt = active[i]
    if (i > 0) {
      const prev = active[i - 1]
      const arcSign = i % 2 === 1 ? 1 : -1
      ts = appendGlideFrames(events, prev.x, prev.y, pt.x, pt.y, ts, pt.moveMs, arcSign, humanArc)
    }

    const [downEvt, upEvt] = buttonCodes(pt.button)
    const xU32 = pt.x >>> 0
    const yU32 = pt.y >>> 0

    events.push({ eventType: downEvt, param1: xU32, param2: yU32, timestampMs: ts >>> 0, hwnd: 0 })
    ts += pt.holdMs
    events.push({ eventType: upEvt, param1: xU32, param2: yU32, timestampMs: ts >>> 0, hwnd: 0 })

    if (pt.button === 'double') {
      ts += 45
      events.push({ eventType: downEvt, param1: xU32, param2: yU32, timestampMs: ts >>> 0, hwnd: 0 })
      ts += pt.holdMs
      events.push({ eventType: upEvt, param1: xU32, param2: yU32, timestampMs: ts >>> 0, hwnd: 0 })
    }

    ts += pt.waitMs

    // No último ponto, fecha o ciclo deslizando suavemente de volta ao Ponto #1 para que o próximo loop não teleporte
    if (i === active.length - 1) {
      if (loopClosure && active.length > 1 && first.moveMs > 0) {
        ts = appendGlideFrames(events, pt.x, pt.y, first.x, first.y, ts, first.moveMs, -1, humanArc)
      } else {
        // Âncora temporal final para preservar integralmente o waitMs do último ponto antes de reiniciar o loop
        events.push({
          eventType: EVENT_TYPES.MOUSE_MOVE,
          param1: (active.length > 1 ? first.x : pt.x) >>> 0,
          param2: (active.length > 1 ? first.y : pt.y) >>> 0,
          timestampMs: ts >>> 0,
          hwnd: 0
        })
      }
    }
  }

  return events
}
