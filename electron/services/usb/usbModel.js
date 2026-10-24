// USB ports screen: turns the PnP device list into "what is plugged into which port", and decides which actions are
// allowed. Pure.

/** "Port_#0006.Hub_#0003" → { port: 6, hub: 3 } */
export function parseLocation(loc) {
  const m = /Port_#0*(\d+)\.Hub_#0*(\d+)/i.exec(String(loc || ''))
  return m ? { port: Number(m[1]), hub: Number(m[2]) } : null
}

const isController = (d) => /^PCI\\/i.test(d.instanceId) || /host controller|controlador de host/i.test(d.name || '')
const isHub = (d) => /^USB\\ROOT_HUB/i.test(d.instanceId) || /\bhub\b/i.test(d.name || '')
const INPUT_CLASSES = new Set(['keyboard', 'mouse', 'input'])

/**
 * Groups devices into ports. Every USB\VID_ device with a port location is a "port device"; HID/keyboard/mouse/disk
 * children are attached to it through the parent chain.
 * @param {Array<{instanceId, name, class, status, problemCode, location, parent}>} list
 */
export function buildPorts(list) {
  const byId = new Map(list.map((d) => [d.instanceId.toUpperCase(), d]))
  const portOf = (d) => {
    let cur = d
    for (let i = 0; cur && i < 8; i++) {
      if (/^USB\\VID_/i.test(cur.instanceId) && parseLocation(cur.location)) return cur
      cur = cur.parent ? byId.get(String(cur.parent).toUpperCase()) : null
    }
    return null
  }
  const ports = new Map()
  for (const d of list) {
    if (isController(d) || isHub(d)) continue
    const top = portOf(d)
    if (!top) continue
    const key = top.instanceId.toUpperCase()
    if (!ports.has(key)) ports.set(key, { ...top, ...parseLocation(top.location), children: [] })
    if (d !== top) ports.get(key).children.push(d)
  }
  const out = [...ports.values()].map((p) => {
    const classes = new Set([p.class, ...p.children.map((c) => c.class)].map((c) => String(c || '').toLowerCase()))
    const allNames = [p.name, p.busName, ...p.children.map((c) => `${c.name} ${c.busName || ''}`)].join(' ')
    // gaming mice also expose a keyboard interface (macros) and keyboards a mouse one: both together = 'input'
    const kind = /controlador de jogo|game ?controller|gamepad|xbox|dualsense|dualshock|wireless controller/i.test(allNames) ? 'gamepad'
      : classes.has('keyboard') && classes.has('mouse') ? 'input' : classes.has('keyboard') ? 'keyboard' : classes.has('mouse') ? 'mouse'
      : classes.has('diskdrive') || /USBSTOR/i.test(p.children.map((c) => c.instanceId).join()) ? 'storage'
      : classes.has('camera') || classes.has('image') ? 'camera' : classes.has('media') || classes.has('audioendpoint') ? 'audio' : classes.has('ports') ? 'serial' : classes.has('hidclass') ? 'hid' : 'other'
    // the most descriptive name: a child's friendly name beats "USB Composite Device"
    // the device's own product string (what it reports on the bus) beats Windows' generic driver names
    const generic = /composite|composto|dispositivo de entrada usb|usb input device|hid-compliant|compat[ií]vel com hid|dispositivo de teclado hid|hid keyboard device|usb mass storage|armazenamento em massa/i
    const name = (p.busName && !generic.test(p.busName) && p.busName) || (!generic.test(p.name) && p.name) || p.children.map((c) => c.busName || c.name).find((n) => n && !generic.test(n)) || p.name
    return { instanceId: p.instanceId, name, kind, port: p.port, hub: p.hub, status: p.status,
      // Windows problem code 22 = CM_PROB_DISABLED (turned off by the user)
      enabled: Number(p.problemCode) !== 22, problemCode: Number(p.problemCode) || 0, children: p.children.map((c) => ({ instanceId: c.instanceId, name: c.name, class: c.class })) }
  })
  return out.sort((a, b) => a.hub - b.hub || a.port - b.port)
}

/** Controllers and hubs are never disabled from this screen: that could cut the keyboard and mouse at once. */
export function canToggle(device) {
  if (!device?.instanceId) return { ok: false, reason: 'invalid' }
  if (isController({ instanceId: device.instanceId, name: device.name }) || isHub({ instanceId: device.instanceId, name: device.name })) return { ok: false, reason: 'controller' }
  return { ok: true, input: INPUT_CLASSES.has(String(device.kind || '').toLowerCase()) }
}

/** USB history: storage devices Windows has seen, newest first. */
export function parseHistory(rows) {
  return (rows || [])
    .map((r) => ({ name: r.name || r.instanceId, instanceId: r.instanceId, serial: String(r.instanceId).split('\\').pop(), firstAt: r.firstAt ?? null, lastArrivalAt: r.lastArrivalAt ?? null, lastRemovalAt: r.lastRemovalAt ?? null, present: Boolean(r.present) }))
    .sort((a, b) => (b.lastArrivalAt || 0) - (a.lastArrivalAt || 0))
}
