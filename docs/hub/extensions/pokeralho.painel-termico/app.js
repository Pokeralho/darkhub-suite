// Painel térmico: reads darkhub.sensors once a second, draws the last 2 minutes and keeps the session peaks.
const t = darkhub.t
const $ = (id) => document.getElementById(id)
const WINDOW = 120 // seconds on screen
const history = [] // { cpu, gpu }
let peaks = { cpu: null, gpu: null }
let limit = 85
let alerted = false

document.title = t('Painel térmico', 'Thermal panel')
$('l-peak').textContent = t('Picos da sessão', 'Session peaks')
$('l-chart').textContent = t('Últimos 2 minutos', 'Last 2 minutes')
$('l-limit').textContent = t('Avisar quando a GPU passar de', 'Warn me when the GPU goes over')
$('reset').textContent = t('Zerar picos', 'Reset peaks')

const fmt = (v, unit) => (v == null ? '--' : `${Math.round(v)}${unit}`)

async function start() {
  peaks = (await darkhub.storage.get('peaks')) || peaks
  limit = (await darkhub.storage.get('limit')) || limit
  $('limit').value = limit
  darkhub.sensors.subscribe(update, 1000)
}

function update(s) {
  $('cpu-temp').textContent = fmt(s.cpu.temp, '°C')
  $('gpu-temp').textContent = fmt(s.gpu.temp, '°C')
  $('cpu-load').textContent = `${t('uso', 'load')} ${fmt(s.cpu.load, '%')}`
  $('gpu-load').textContent = `${s.gpu.name || 'GPU'}, ${t('uso', 'load')} ${fmt(s.gpu.load, '%')}`

  let changed = false
  for (const k of ['cpu', 'gpu']) {
    const v = s[k].temp
    if (v != null && (peaks[k] == null || v > peaks[k])) { peaks[k] = v; changed = true }
  }
  $('peaks').textContent = `${fmt(peaks.cpu, '°')} / ${fmt(peaks.gpu, '°')}`
  if (changed) darkhub.storage.set('peaks', peaks)

  if (s.gpu.temp != null && s.gpu.temp >= limit && !alerted) {
    alerted = true
    darkhub.notify(t('GPU quente', 'GPU running hot'), `${Math.round(s.gpu.temp)}°C (${t('limite', 'limit')} ${limit}°C)`)
  }
  if (s.gpu.temp != null && s.gpu.temp < limit - 5) alerted = false

  history.push({ cpu: s.cpu.temp, gpu: s.gpu.temp })
  if (history.length > WINDOW) history.shift()
  draw()
}

function draw() {
  const canvas = $('chart')
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr }
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  const lo = 20
  const hi = 105
  const y = (v) => h - ((v - lo) / (hi - lo)) * h
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1
  ctx.font = '11px system-ui'
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  for (const g of [40, 60, 80, 100]) { ctx.beginPath(); ctx.moveTo(0, y(g)); ctx.lineTo(w, y(g)); ctx.stroke(); ctx.fillText(`${g}°`, 4, y(g) - 3) }
  const line = (key, color) => {
    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    let started = false
    history.forEach((p, i) => {
      if (p[key] == null) return
      const x = (i / (WINDOW - 1)) * w
      if (started) ctx.lineTo(x, y(p[key])); else { ctx.moveTo(x, y(p[key])); started = true }
    })
    ctx.stroke()
  }
  line('cpu', getComputedStyle(document.documentElement).getPropertyValue('--dh-accent').trim() || '#7fd0ff')
  line('gpu', '#f2b766')
}

$('limit').addEventListener('change', () => {
  const v = Math.max(50, Math.min(105, Number($('limit').value) || 85))
  limit = v
  $('limit').value = v
  darkhub.storage.set('limit', v)
})
$('reset').addEventListener('click', () => {
  peaks = { cpu: null, gpu: null }
  darkhub.storage.set('peaks', peaks)
  $('peaks').textContent = '--'
  darkhub.app.toast(t('Picos zerados.', 'Peaks reset.'))
})

start().catch((e) => console.error(e.message))
