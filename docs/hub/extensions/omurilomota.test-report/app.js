// Test Report: documented hardware experiment sessions (compact/aggregated capture, <=1MB storage budget).
// Sensors API: cpu/gpu temp & load, ram load/used, net rx/tx, disk read/write/activity (no clock MHz) — clocks/frequencies/cooling are user-documented.
const t = darkhub.t
const $ = (id) => document.getElementById(id)

const SESSIONS_KEY = 'sessions'
const ACTIVE_KEY = 'active'
const SAMPLE_MS = 2000
const AGG_EVERY = 10 // samples per aggregated window (~20s)
const MAX_SESSIONS = 8
const MAX_WINDOWS = 180 // ~60 min/session at 20s windows
const MAX_MARKERS = 50
const MAX_BYTES = 950000

let hw = null
let active = null
let sessions = []
let unsubSensors = null
let sampleTimer = null
let tickTimer = null
let lastMd = ''
let lastReading = null

function now() { return Date.now() }
function fmtNum(v, d = 1) { return v == null || !isFinite(v) ? null : Number(v.toFixed(d)) }
function fmt(v, unit = '', d = 1) { return v == null || !isFinite(v) ? '--' : `${Number(v).toFixed(d)}${unit}` }
function fmtBytesPerSec(bps) {
  if (bps == null || !isFinite(bps)) return '--'
  const v = Number(bps)
  if (v >= 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB/s`
  if (v >= 1024) return `${(v / 1024).toFixed(1)} KB/s`
  return `${v.toFixed(0)} B/s`
}
function fmtBytes(b) {
  if (b == null || !isFinite(b)) return '--'
  const v = Number(b)
  if (v >= 1024 ** 3) return `${(v / 1024 ** 3).toFixed(1)} GB`
  if (v >= 1024 ** 2) return `${(v / 1024 ** 2).toFixed(0)} MB`
  return `${(v / 1024).toFixed(0)} KB`
}
function dur(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(s / 60), sec = s % 60, h = Math.floor(m / 60)
  if (h) return `${h}h ${m % 60}m ${sec}s`
  if (m) return `${m}m ${sec}s`
  return `${sec}s`
}
function esc(s) { return String(s || '').replace(/[|`\r\n]+/g, ' ').trim().slice(0, 400) }
function timeOfDay(ts) { try { return new Date(ts).toLocaleString() } catch { return '' } }
function hwLine(h) {
  if (!h) return ''
  const g = h.gpuNames && h.gpuNames.length ? h.gpuNames.join(', ') : (h.gpuVendors || []).join(', ')
  return [h.cpuVendor, g, h.ramGb ? `${h.ramGb} GB RAM` : null, h.chassis, h.osBuild ? `OS build ${h.osBuild}` : null, h.netWired === true ? t('Rede cabeada','Wired') : h.netWired === false ? t('Wi-Fi','Wi-Fi') : null, h.darkos ? 'DarkOS' : null, h.gpuDedicated === true ? t('GPU dedicada','Dedicated GPU') : h.gpuDedicated === false ? t('GPU integrada','Integrated GPU') : null].filter(Boolean).join(' · ')
}
function hwSnap(h) {
  if (!h) return ''
  return [t('CPU','CPU') + ': ' + (h.cpuVendor || '--'), t('GPU','GPU') + ': ' + ((h.gpuNames && h.gpuNames[0]) || (h.gpuVendors && h.gpuVendors[0]) || '--'), t('RAM','RAM') + ': ' + (h.ramGb ? h.ramGb + ' GB' : '--'), t('Tipo','Chassis') + ': ' + (h.chassis || '--')].join(' · ')
}

function fieldIds() {
  return ['name','workload','duration','goal','ambient','cooling','airflow','case','cpuclk','gpuclk','memclk','power','drivers','profile','notes']
}
function readForm() {
  const o = {}
  fieldIds().forEach((k) => { const el = $('s-' + k); o[k] = el ? (el.value || '').trim() : '' })
  return o
}
function clearForm() { fieldIds().forEach((k) => { const el = $('s-' + k); if (el) el.value = '' }) }

function labelUi() {
  $('subtitle').textContent = t('Relatório completo de testes: tempo, hardware, ambiente/ventilação, frequências e limites (informados), métricas capturadas, eventos e comparação.',
    'Full test report: time, hardware, environment/cooling, clocks & limits (reported), captured metrics, events and comparison.')
  $('h-new').textContent = t('Novo teste / experimento', 'New test / experiment')
  $('h-plan').textContent = t('Plano e tempo', 'Plan & timing')
  $('h-env').textContent = t('Ambiente e ventilação', 'Environment & cooling')
  $('h-freq').textContent = t('Frequências e limites', 'Frequencies & limits')
  $('h-sys').textContent = t('Sistema e observações', 'System & notes')
  $('l-name').textContent = t('Nome do teste', 'Test name')
  $('l-workload').textContent = t('Carga / benchmark / jogo', 'Workload / benchmark / game')
  $('l-duration').textContent = t('Duração planejada / janela', 'Planned duration / window')
  $('l-goal').textContent = t('Objetivo / hipótese', 'Goal / hypothesis')
  $('l-ambient').textContent = t('Temperatura ambiente', 'Ambient temperature')
  $('l-cooling').textContent = t('Refrigeração (CPU/GPU)', 'Cooling (CPU/GPU)')
  $('l-airflow').textContent = t('Ventilação / fans / curva', 'Airflow / fans / curve')
  $('l-case').textContent = t('Gabinete / posição / pasta térmica', 'Case / position / thermal paste')
  $('l-cpuclk').textContent = t('CPU: clock / boost / voltagem', 'CPU: clock / boost / voltage')
  $('l-gpuclk').textContent = t('GPU: core / memória / OC', 'GPU: core / memory / OC')
  $('l-memclk').textContent = t('RAM: frequência / timings / XMP-EXPO', 'RAM: speed / timings / XMP-EXPO')
  $('l-power').textContent = t('Limites de potência / UV', 'Power limits / UV')
  $('l-drivers').textContent = t('Drivers / SO / versão', 'Drivers / OS / version')
  $('l-profile').textContent = t('Perfil de energia / BIOS / fan', 'Power profile / BIOS / fan')
  $('l-notes').textContent = t('Observações iniciais', 'Initial notes')
  $('s-name').placeholder = t('Ex.: Stress CPU 30 min', 'e.g. CPU stress 30 min')
  $('s-workload').placeholder = t('Ex.: Cinebench R23, OCCT, jogo X 1440p', 'e.g. Cinebench R23, OCCT, game X 1440p')
  $('s-duration').placeholder = t('Ex.: 30 min / 3 loops', 'e.g. 30 min / 3 loops')
  $('s-goal').placeholder = t('Ex.: validar estabilidade após undervolt', 'e.g. validate stability after undervolt')
  $('s-ambient').placeholder = t('Ex.: 24°C, verão, AC ligado', 'e.g. 24°C, summer, AC on')
  $('s-cooling').placeholder = t('Ex.: Air cooler X / AIO 240mm / blower', 'e.g. Air cooler X / 240mm AIO / blower')
  $('s-airflow').placeholder = t('Ex.: 2 intake, 1 exhaust, 60%', 'e.g. 2 intake, 1 exhaust, 60%')
  $('s-case').placeholder = t('Ex.: mesh frontal, lateral fechada, pasta 6 meses', 'e.g. mesh front, side closed, paste 6 months')
  $('s-cpuclk').placeholder = t('Ex.: 5.2 GHz all-core, 1.25 V / PBO', 'e.g. 5.2 GHz all-core, 1.25 V / PBO')
  $('s-gpuclk').placeholder = t('Ex.: 2700 MHz core, 1050 mV, mem +500', 'e.g. 2700 MHz core, 1050 mV, mem +500')
  $('s-memclk').placeholder = t('Ex.: 6000 MT/s CL30 EXPO', 'e.g. 6000 MT/s CL30 EXPO')
  $('s-power').placeholder = t('Ex.: PL1/PL2 150W, GPU 280W, -50mV', 'e.g. PL1/PL2 150W, GPU 280W, -50mV')
  $('s-drivers').placeholder = t('Ex.: Windows 11 24H2, NVIDIA 560.xx', 'e.g. Windows 11 24H2, NVIDIA 560.xx')
  $('s-profile').placeholder = t('Ex.: Alto desempenho, fan agressivo', 'e.g. High performance, aggressive fan')
  $('s-notes').placeholder = t('Hipótese, detalhes extras, ruídos, etc.', 'Hypothesis, extra details, noise, etc.')
  $('clock-hint').textContent = t('Captura automática: temp/uso CPU/GPU, RAM, rede e disco (agregado a cada ~20s). MHz/frequências, voltagem, RPM e tipo de ventilação não vêm dos sensores — registre nos campos acima para um relatório completo.',
    'Auto-captured: CPU/GPU temp/load, RAM, network and disk (aggregated every ~20s). MHz/clocks, voltage, RPM and cooling type are not from sensors — record them above for a complete report.')
  $('btn-start').textContent = t('Iniciar captura', 'Start capture')
  $('btn-stop').textContent = t('Parar e salvar', 'Stop & save')
  $('btn-mark').textContent = t('Marcar evento', 'Mark event')
  $('mark-note').placeholder = t('Nota do marcador (ex.: throttle, pico, troca de cena)', 'Marker note (e.g. throttle, spike, scene change)')
  $('h-active').textContent = t('Sessão ativa', 'Active session')
  $('l-result').textContent = t('Resultado / conclusão', 'Result / conclusion')
  $('active-result').placeholder = t('O que aconteceu, achados e conclusão...', 'What happened, findings and conclusion...')
  $('btn-save-result').textContent = t('Salvar resultado', 'Save result')
  $('h-sessions').textContent = t('Sessões salvas', 'Saved sessions')
  $('btn-clear-all').textContent = t('Limpar tudo', 'Clear all')
  $('sessions-empty').textContent = t('Nenhuma sessão salva ainda.', 'No saved sessions yet.')
  $('h-compare').textContent = t('Comparar sessões', 'Compare sessions')
  $('l-a').textContent = t('Sessão A', 'Session A')
  $('l-b').textContent = t('Sessão B', 'Session B')
  $('btn-compare').textContent = t('Comparar', 'Compare')
  $('btn-copy-md').textContent = t('Copiar relatório (Markdown)', 'Copy report (Markdown)')
}

function liveReadout(s) {
  if (!s) return
  lastReading = s
  $('live-cpu').textContent = `CPU ${fmt(s.cpu && s.cpu.temp, '°C', 0)} · ${fmt(s.cpu && s.cpu.load, '%', 0)}`
  $('live-gpu').textContent = `GPU ${fmt(s.gpu && s.gpu.temp, '°C', 0)} · ${fmt(s.gpu && s.gpu.load, '%', 0)}`
  const ram = s.ram ? `${fmt(s.ram.load, '%', 0)}${s.ram.usedBytes != null ? ' (' + fmtBytes(s.ram.usedBytes) + ')' : ''}` : '--'
  $('live-ram').textContent = `RAM ${ram}`
}

async function loadState() {
  sessions = (await darkhub.storage.get(SESSIONS_KEY)) || []
  if (!Array.isArray(sessions)) sessions = []
  active = await darkhub.storage.get(ACTIVE_KEY)
  if (active && active.status !== 'running') active = null
}
async function saveSessions() {
  let data = sessions.slice(0, MAX_SESSIONS)
  let json = JSON.stringify({ [SESSIONS_KEY]: data })
  while (json.length > MAX_BYTES && data.length > 1) { data.pop(); json = JSON.stringify({ [SESSIONS_KEY]: data }) }
  sessions = data
  await darkhub.storage.set(SESSIONS_KEY, sessions)
}
async function saveActive() {
  if (active) await darkhub.storage.set(ACTIVE_KEY, active)
  else await darkhub.storage.delete(ACTIVE_KEY)
}

function mStat() { return { sum: 0, n: 0, min: null, max: null } }
function pushM(m, v) {
  if (v == null || !isFinite(v)) return
  const x = Number(v)
  m.sum += x; m.n++; m.min = m.min == null ? x : Math.min(m.min, x); m.max = m.max == null ? x : Math.max(m.max, x)
}
function finM(m) { return m.n ? { avg: fmtNum(m.sum / m.n, 1), min: fmtNum(m.min, 1), max: fmtNum(m.max, 1) } : null }
function newAgg(t0) {
  return { t0, count: 0, cpuT: mStat(), cpuL: mStat(), gpuT: mStat(), gpuL: mStat(), ramL: mStat(), ramU: mStat(), netRx: mStat(), netTx: mStat(), dskR: mStat(), dskW: mStat(), dskA: mStat() }
}

function sample(s) {
  liveReadout(s)
  if (!active || active.status !== 'running') return
  if (!active.agg) active.agg = newAgg(now())
  const a = active.agg
  if (s.cpu) { pushM(a.cpuT, s.cpu.temp); pushM(a.cpuL, s.cpu.load) }
  if (s.gpu) { pushM(a.gpuT, s.gpu.temp); pushM(a.gpuL, s.gpu.load) }
  if (s.ram) { pushM(a.ramL, s.ram.load); pushM(a.ramU, s.ram.usedBytes) }
  if (s.net) { pushM(a.netRx, s.net.rxBps); pushM(a.netTx, s.net.txBps) }
  if (s.disk) { pushM(a.dskR, s.disk.readBps); pushM(a.dskW, s.disk.writeBps); pushM(a.dskA, s.disk.activity) }
  a.count++; active.samples = (active.samples || 0) + 1
  if (a.count >= AGG_EVERY) flushAgg()
}

function flushAgg() {
  if (!active || !active.agg || !active.agg.count) return
  const a = active.agg
  const w = {
    t: Math.round((a.t0 - active.startedAt) / 1000),
    cpuT: finM(a.cpuT), cpuL: finM(a.cpuL), gpuT: finM(a.gpuT), gpuL: finM(a.gpuL),
    ramL: finM(a.ramL), ramU: finM(a.ramU),
    netRx: finM(a.netRx), netTx: finM(a.netTx),
    dskR: finM(a.dskR), dskW: finM(a.dskW), dskA: finM(a.dskA)
  }
  if (!active.windows) active.windows = []
  if (active.windows.length < MAX_WINDOWS) active.windows.push(w)
  else active.windowsTruncated = true
  active.agg = newAgg(now())
}

function arrPick(wins, key, field) { return wins.map((w) => w[key] && w[key][field]).filter((v) => v != null) }
function avgOf(arr) { return arr.length ? fmtNum(arr.reduce((a, b) => a + b, 0) / arr.length, 1) : null }
function maxOf(arr) { return arr.length ? fmtNum(Math.max(...arr), 1) : null }
function minOf(arr) { return arr.length ? fmtNum(Math.min(...arr), 1) : null }
function stddev(arr) {
  if (arr.length < 2) return null
  const m = arr.reduce((a, b) => a + b, 0) / arr.length
  const v = arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length
  return fmtNum(Math.sqrt(v), 1)
}
function summarize(session) {
  const ws = session.windows || []
  const cpuT = arrPick(ws,'cpuT','avg'), cpuTmax = arrPick(ws,'cpuT','max')
  const gpuT = arrPick(ws,'gpuT','avg'), gpuTmax = arrPick(ws,'gpuT','max')
  const cpuL = arrPick(ws,'cpuL','avg'), gpuL = arrPick(ws,'gpuL','avg')
  const ramL = arrPick(ws,'ramL','avg'), ramU = arrPick(ws,'ramU','avg')
  const netRx = arrPick(ws,'netRx','avg'), netTx = arrPick(ws,'netTx','avg')
  const dskR = arrPick(ws,'dskR','avg'), dskW = arrPick(ws,'dskW','avg'), dskA = arrPick(ws,'dskA','avg')
  const durSec = Math.max(0, Math.round(((session.endedAt || now()) - session.startedAt) / 1000))
  return {
    durationSec: durSec, samples: session.samples || 0, windows: ws.length,
    cpuTempAvg: avgOf(cpuT), cpuTempMax: maxOf(cpuTmax), cpuTempMin: minOf(arrPick(ws,'cpuT','min')), cpuTempStd: stddev(cpuT),
    gpuTempAvg: avgOf(gpuT), gpuTempMax: maxOf(gpuTmax), gpuTempMin: minOf(arrPick(ws,'gpuT','min')), gpuTempStd: stddev(gpuT),
    cpuLoadAvg: avgOf(cpuL), cpuLoadMax: maxOf(arrPick(ws,'cpuL','max')), cpuLoadStd: stddev(cpuL),
    gpuLoadAvg: avgOf(gpuL), gpuLoadMax: maxOf(arrPick(ws,'gpuL','max')), gpuLoadStd: stddev(gpuL),
    ramLoadAvg: avgOf(ramL), ramLoadMax: maxOf(arrPick(ws,'ramL','max')), ramUsedAvg: avgOf(ramU), ramUsedMax: maxOf(arrPick(ws,'ramU','max')),
    netRxAvg: avgOf(netRx), netTxAvg: avgOf(netTx), netRxMax: maxOf(arrPick(ws,'netRx','max')), netTxMax: maxOf(arrPick(ws,'netTx','max')),
    diskReadAvg: avgOf(dskR), diskWriteAvg: avgOf(dskW), diskActAvg: avgOf(dskA),
    markers: (session.markers || []).length
  }
}

function planText(s) {
  const lines = []
  const add = (k, v) => { if (v) lines.push(`${k}: ${v}`) }
  add(t('Carga','Workload'), s.workload); add(t('Duração planejada','Planned duration'), s.duration); add(t('Objetivo','Goal'), s.goal)
  add(t('Ambiente','Ambient'), s.ambient); add(t('Refrigeração','Cooling'), s.cooling); add(t('Ventilação','Airflow'), s.airflow); add(t('Gabinete/pasta','Case/paste'), s.case)
  add(t('CPU clock/V','CPU clock/V'), s.cpuclk); add(t('GPU clock/OC','GPU clock/OC'), s.gpuclk); add(t('RAM','RAM'), s.memclk); add(t('Limites potência','Power limits'), s.power)
  add(t('Drivers/SO','Drivers/OS'), s.drivers); add(t('Perfil','Profile'), s.profile); add(t('Notas','Notes'), s.notes)
  return lines.join('\n')
}

async function startSession() {
  if (active && active.status === 'running') return
  const f = readForm()
  const name = f.name || t(`Teste ${timeOfDay(now())}`, `Test ${timeOfDay(now())}`)
  active = {
    status: 'running', name,
    ...f,
    startedAt: now(), tzOffsetMin: new Date().getTimezoneOffset(),
    samples: 0, windows: [], markers: [], agg: newAgg(now()), hw: hw || null
  }
  await saveActive(); startTimers(); renderActive(); renderControls()
  darkhub.app.toast(t('Captura iniciada.', 'Capture started.'))
}

async function stopSession() {
  if (!active || active.status !== 'running') return
  flushAgg()
  active.endedAt = now(); active.status = 'done'; active.summary = summarize(active)
  stopTimers()
  const stored = { ...active }
  delete stored.agg; delete stored.status
  sessions.unshift(stored)
  sessions = sessions.slice(0, MAX_SESSIONS)
  await saveSessions(); active = null; await saveActive()
  renderSessions(); renderComparePickers(); renderActive(); renderControls(); clearForm()
  darkhub.app.toast(t('Sessão salva.', 'Session saved.'))
}

async function addMarker() {
  if (!active || active.status !== 'running') return
  const note = ($('mark-note').value || '').trim()
  if (!active.markers) active.markers = []
  if (active.markers.length >= MAX_MARKERS) { darkhub.app.toast(t('Limite de marcadores atingido.', 'Marker limit reached.')); return }
  active.markers.push({ t: Math.round((now() - active.startedAt) / 1000), note: note || t('Marcador', 'Marker') })
  $('mark-note').value = ''; await saveActive(); renderActive()
}

async function saveResultNote() {
  if (!active) return
  active.result = ($('active-result').value || '').trim()
  await saveActive(); darkhub.app.toast(t('Resultado salvo.', 'Result saved.'))
}

function startTimers() {
  stopTimers()
  if (unsubSensors) try { unsubSensors() } catch {}
  try { unsubSensors = darkhub.sensors.subscribe(sample, SAMPLE_MS) } catch { unsubSensors = null }
  sampleTimer = setInterval(async () => { if (!unsubSensors) { try { sample(await darkhub.sensors.read()) } catch {} } }, SAMPLE_MS)
  tickTimer = setInterval(() => { renderActiveTick(); persistActiveLight() }, 5000)
}
function stopTimers() {
  if (sampleTimer) clearInterval(sampleTimer); sampleTimer = null
  if (tickTimer) clearInterval(tickTimer); tickTimer = null
  if (unsubSensors) { try { unsubSensors() } catch {} unsubSensors = null }
}
let lastPersist = 0
async function persistActiveLight() { if (active && active.status === 'running' && now() - lastPersist > 15000) { lastPersist = now(); await saveActive() } }

function renderControls() {
  const running = !!(active && active.status === 'running')
  $('btn-start').disabled = running; $('btn-stop').disabled = !running; $('btn-mark').disabled = !running
  $('capture-status').textContent = running
    ? t(`Capturando a cada ~2s, agregado em janelas ~20s (até ${MAX_WINDOWS} janelas).`, `Capturing every ~2s, aggregated into ~20s windows (up to ${MAX_WINDOWS}).`)
    : t('Preencha o máximo de contexto (tempo, ambiente, ventilação, frequências) para um relatório completo.', 'Fill as much context as possible (time, environment, cooling, clocks) for a complete report.')
  $('capture-status').className = 'dh-help ' + (running ? 'status-ok' : '')
}

function renderActive() {
  const card = $('active-card')
  if (!active || active.status !== 'running') { card.hidden = true; return }
  card.hidden = false
  $('active-result').value = active.result || ''
  $('hw-snap').textContent = hwSnap(active.hw) || t('Hardware: indisponível', 'Hardware: unavailable')
  $('active-plan').textContent = planText(active)
  renderActiveTick(); renderMarkers()
}
function renderMarkers() {
  const ml = $('active-markers'); if (!ml) return; ml.textContent = ''
  ;(active && active.markers ? active.markers : []).slice().reverse().forEach((m) => {
    const d = document.createElement('div'); d.className = 'marker'; d.textContent = `+${dur(m.t * 1000)} — ${m.note}`; ml.appendChild(d)
  })
}
function renderActiveTick() {
  if (!active || active.status !== 'running') return
  $('active-elapsed').textContent = `${t('Início','Start')}: ${timeOfDay(active.startedAt)} · ${t('Decorrido','Elapsed')}: ${dur(now() - active.startedAt)}`
  const s = summarize(active)
  $('active-summary').textContent = t(
    `Amostras ${s.samples} · janelas ${s.windows} · CPU máx ${fmt(s.cpuTempMax,'°C',1)} (média ${fmt(s.cpuTempAvg,'°C',1)}) · GPU máx ${fmt(s.gpuTempMax,'°C',1)} (média ${fmt(s.gpuTempAvg,'°C',1)}) · RAM máx ${fmt(s.ramLoadMax,'%',0)} · Disco ${fmt(s.diskActAvg,'%',0)} atv.`,
    `Samples ${s.samples} · windows ${s.windows} · CPU max ${fmt(s.cpuTempMax,'°C',1)} (avg ${fmt(s.cpuTempAvg,'°C',1)}) · GPU max ${fmt(s.gpuTempMax,'°C',1)} (avg ${fmt(s.gpuTempAvg,'°C',1)}) · RAM max ${fmt(s.ramLoadMax,'%',0)} · Disk ${fmt(s.diskActAvg,'%',0)} act.`)
}

function renderSessions() {
  const list = $('sessions-list'); list.textContent = ''
  $('sessions-empty').style.display = sessions.length ? 'none' : 'block'
  sessions.forEach((s) => {
    const row = document.createElement('div'); row.className = 'session-row'
    const main = document.createElement('div'); main.className = 'session-main'
    const left = document.createElement('div')
    const title = document.createElement('div'); title.className = 'session-title'; title.textContent = s.name
    const meta = document.createElement('div'); meta.className = 'session-meta'
    const sum = s.summary || {}
    meta.textContent = `${timeOfDay(s.startedAt)} · ${dur((sum.durationSec||0)*1000)} · CPU↑ ${fmt(sum.cpuTempMax,'°C',1)} · GPU↑ ${fmt(sum.gpuTempMax,'°C',1)} · RAM↑ ${fmt(sum.ramLoadMax,'%',0)}`
    left.append(title, meta)
    const bits = [s.workload, s.cooling, s.ambient, s.cpuclk || s.gpuclk].filter(Boolean).join(' · ')
    if (bits) { const n = document.createElement('div'); n.className = 'small'; n.textContent = bits; left.appendChild(n) }
    if (s.result) { const r = document.createElement('div'); r.className = 'small'; r.textContent = t('Resultado: ', 'Result: ') + s.result; left.appendChild(r) }
    const actions = document.createElement('div'); actions.className = 'session-actions'
    const del = document.createElement('button'); del.className = 'dh-btn'; del.type = 'button'; del.textContent = t('Excluir', 'Delete')
    del.onclick = async () => { sessions = sessions.filter((x) => x.id !== s.id && x.startedAt !== s.startedAt); await saveSessions(); renderSessions(); renderComparePickers(); $('compare-out').textContent=''; $('compare-actions').hidden=true }
    actions.appendChild(del)
    main.append(left, actions); row.appendChild(main); list.appendChild(row)
  })
}

function renderComparePickers() {
  const sel = [$('cmp-a'), $('cmp-b')]
  const prev = sel.map((s) => s.value)
  sel.forEach((s) => { s.textContent = '' })
  const opt0 = (s) => { const o = document.createElement('option'); o.value = ''; o.textContent = t('Selecione…', 'Select…'); s.appendChild(o) }
  sel.forEach(opt0)
  sessions.forEach((s) => sel.forEach((el) => { const o = document.createElement('option'); o.value = s.id || String(s.startedAt); o.textContent = `${s.name} (${new Date(s.startedAt).toLocaleDateString()})`; el.appendChild(o) }))
  if (sessions[0]) sel[0].value = prev[0] || (sessions[0].id || String(sessions[0].startedAt))
  if (sessions[1]) sel[1].value = prev[1] || (sessions[1].id || String(sessions[1].startedAt))
}

function sid(s) { return s ? (s.id || String(s.startedAt)) : '' }
function delta(a, b, lowerBetter = true) {
  if (a == null || b == null) return { text: '--', cls: 'delta-neutral' }
  const d = fmtNum(b - a, 1)
  if (d === 0) return { text: '0', cls: 'delta-neutral' }
  const better = lowerBetter ? d < 0 : d > 0
  return { text: (d > 0 ? '+' : '') + d, cls: better ? 'delta-good' : 'delta-bad' }
}
function rowMetric(label, av, bv, unit, lowerBetter = true, fmtFn) {
  const tr = document.createElement('tr')
  const de = delta(av, bv, lowerBetter)
  const f = fmtFn || ((v) => fmt(v, unit, 1))
  ;[label, f(av), f(bv), de.text + (de.text !== '--' && unit ? '' : '')].forEach((txt, i) => {
    const td = document.createElement(i ? 'td' : 'th'); if (!i) td.scope = 'row'; td.textContent = txt; if (i === 3) td.className = de.cls; tr.appendChild(td)
  })
  return tr
}

function ctxBlock(label, s) {
  const sum = s.summary || {}
  const lines = [
    [t('Início','Start'), timeOfDay(s.startedAt)], [t('Fim','End'), s.endedAt ? timeOfDay(s.endedAt) : '-'], [t('Duração','Duration'), dur((sum.durationSec||0)*1000)],
    [t('HW','HW'), hwLine(s.hw) || '-'], [t('Carga','Workload'), s.workload], [t('Objetivo','Goal'), s.goal],
    [t('Ambiente','Ambient'), s.ambient], [t('Refrigeração','Cooling'), s.cooling], [t('Ventilação','Airflow'), s.airflow], [t('Gabinete/pasta','Case/paste'), s.case],
    [t('CPU clock/V','CPU clock/V'), s.cpuclk], [t('GPU clock/OC','GPU clock/OC'), s.gpuclk], [t('RAM','RAM'), s.memclk], [t('Potência/limites','Power/limits'), s.power],
    [t('Drivers/SO','Drivers/OS'), s.drivers], [t('Perfil','Profile'), s.profile], [t('Notas','Notes'), s.notes],
    [t('Marcadores','Markers'), (s.markers&&s.markers.length)?s.markers.map(m=>`+${dur(m.t*1000)} ${m.note}`).join('; '):null],
    [t('Resultado','Result'), s.result]
  ].filter(([,v]) => v).map(([k,v]) => `${k}: ${v}`)
  const d = document.createElement('div'); d.className = 'ctx-block'
  const b = document.createElement('b'); b.textContent = `${label}: ${s.name}`
  d.appendChild(b); d.appendChild(document.createTextNode('\n' + lines.join('\n')))
  return d
}

function compare() {
  const a = sessions.find((s) => sid(s) === $('cmp-a').value)
  const b = sessions.find((s) => sid(s) === $('cmp-b').value)
  const out = $('compare-out'); out.textContent = ''; $('compare-actions').hidden = true; lastMd = ''
  if (!a || !b || sid(a) === sid(b)) { out.textContent = t('Selecione duas sessões diferentes.', 'Select two different sessions.'); return }
  const sa = a.summary || {}, sb = b.summary || {}
  const table = document.createElement('table'); table.className = 'cmp'
  const thead = document.createElement('thead'); const hr = document.createElement('tr')
  ;[t('Métrica (capturada)','Metric (captured)'), a.name, b.name, 'Δ (B-A)'].forEach((h) => { const th = document.createElement('th'); th.textContent = h; hr.appendChild(th) })
  thead.appendChild(hr); table.appendChild(thead)
  const tb = document.createElement('tbody')
  tb.append(
    rowMetric(t('Duração (s)','Duration (s)'), sa.durationSec, sb.durationSec, 's', false),
    rowMetric(t('CPU temp máx (°C)','CPU temp max (°C)'), sa.cpuTempMax, sb.cpuTempMax, '°C', true),
    rowMetric(t('CPU temp média (°C)','CPU temp avg (°C)'), sa.cpuTempAvg, sb.cpuTempAvg, '°C', true),
    rowMetric(t('CPU uso médio (%)','CPU load avg (%)'), sa.cpuLoadAvg, sb.cpuLoadAvg, '%', true),
    rowMetric(t('GPU temp máx (°C)','GPU temp max (°C)'), sa.gpuTempMax, sb.gpuTempMax, '°C', true),
    rowMetric(t('GPU temp média (°C)','GPU temp avg (°C)'), sa.gpuTempAvg, sb.gpuTempAvg, '°C', true),
    rowMetric(t('GPU uso médio (%)','GPU load avg (%)'), sa.gpuLoadAvg, sb.gpuLoadAvg, '%', true),
    rowMetric(t('RAM uso máx (%)','RAM load max (%)'), sa.ramLoadMax, sb.ramLoadMax, '%', true),
    rowMetric(t('RAM usada média','RAM used avg'), sa.ramUsedAvg, sb.ramUsedAvg, '', true, fmtBytes),
    rowMetric(t('Disco atividade média (%)','Disk activity avg (%)'), sa.diskActAvg, sb.diskActAvg, '%', true),
    rowMetric(t('Rede RX média','Net RX avg'), sa.netRxAvg, sb.netRxAvg, '', false, fmtBytesPerSec),
    rowMetric(t('Rede TX média','Net TX avg'), sa.netTxAvg, sb.netTxAvg, '', false, fmtBytesPerSec),
  )
  table.appendChild(tb); out.appendChild(table)
  const ctx = document.createElement('div'); ctx.className = 'ctx'
  ;[ctxBlock('A', a), ctxBlock('B', b)].forEach((n) => ctx.appendChild(n))
  out.appendChild(ctx)
  const meta = document.createElement('p'); meta.className = 'dh-help'
  meta.textContent = t('Capturado: temp/uso CPU/GPU, RAM, rede e disco (agregado ~20s). Frequências/voltagem/RPM/ventilação são informadas no relato. Δ < 0 em temp/uso = B menor.',
    'Captured: CPU/GPU temp/load, RAM, network and disk (~20s aggregates). Clocks/voltage/RPM/cooling are reported fields. Δ < 0 in temp/load = B lower.')
  out.appendChild(meta)
  lastMd = buildMarkdown(a, b, sa, sb)
  $('compare-actions').hidden = false
}

function mdBlock(label, s) {
  const sum = s.summary || {}
  const kv = (k,v) => v ? `- ${k}: ${esc(v)}` : null
  return [
    `### ${label}: ${esc(s.name)}`,
    kv(t('Início','Start'), timeOfDay(s.startedAt)),
    kv(t('Fim','End'), s.endedAt ? timeOfDay(s.endedAt) : ''),
    kv(t('Duração','Duration'), dur((sum.durationSec||0)*1000)),
    kv('Hardware', hwLine(s.hw)),
    kv(t('Carga/benchmark','Workload'), s.workload),
    kv(t('Duração planejada','Planned duration'), s.duration),
    kv(t('Objetivo','Goal'), s.goal),
    kv(t('Ambiente','Ambient'), s.ambient),
    kv(t('Refrigeração','Cooling'), s.cooling),
    kv(t('Ventilação/fans','Airflow/fans'), s.airflow),
    kv(t('Gabinete/pasta térmica','Case/thermal paste'), s.case),
    kv(t('CPU clock/boost/voltagem','CPU clock/boost/voltage'), s.cpuclk),
    kv(t('GPU clock/memória/OC','GPU clock/memory/OC'), s.gpuclk),
    kv(t('RAM frequência/timings','RAM speed/timings'), s.memclk),
    kv(t('Limites de potência/UV','Power limits/UV'), s.power),
    kv(t('Drivers/SO','Drivers/OS'), s.drivers),
    kv(t('Perfil energia/BIOS/fan','Power/BIOS/fan profile'), s.profile),
    kv(t('Notas iniciais','Initial notes'), s.notes),
    kv(t('Marcadores','Markers'), (s.markers&&s.markers.length)?s.markers.map(m=>`+${dur(m.t*1000)} ${esc(m.note)}`).join('; '):''),
    kv(t('Resultado/conclusão','Result/conclusion'), s.result),
  ].filter(Boolean).join('\n')
}

function buildMarkdown(a, b, sa, sb) {
  const L = (k,av,bv,fmtter,unit,lower) => {
    const f = fmtter || ((v)=>fmt(v,unit,1))
    const d = (av!=null&&bv!=null) ? (fmtNum(bv-av,1)>0?'+':'')+fmtNum(bv-av,1)+(unit||'') : '--'
    return `| ${k} | ${f(av)} | ${f(bv)} | ${d} |`
  }
  return [
    `# Test Report — ${t('Relatório de teste/diagnóstico','Test/diagnostic report')}`,
    ``,
    mdBlock('A', a),
    ``,
    mdBlock('B', b),
    ``,
    `## ${t('Métricas capturadas (sensores, agregado ~20s)','Captured metrics (sensors, ~20s aggregates)')}`,
    `| ${t('Métrica','Metric')} | A | B | Δ (B-A) |`,
    `|---|---:|---:|---:|`,
    L(t('Duração (s)','Duration (s)'), sa.durationSec, sb.durationSec, null, 's'),
    L(t('CPU temp máx (°C)','CPU temp max (°C)'), sa.cpuTempMax, sb.cpuTempMax, null, '°C'),
    L(t('CPU temp média (°C)','CPU temp avg (°C)'), sa.cpuTempAvg, sb.cpuTempAvg, null, '°C'),
    L(t('CPU uso médio (%)','CPU load avg (%)'), sa.cpuLoadAvg, sb.cpuLoadAvg, null, '%'),
    L(t('GPU temp máx (°C)','GPU temp max (°C)'), sa.gpuTempMax, sb.gpuTempMax, null, '°C'),
    L(t('GPU temp média (°C)','GPU temp avg (°C)'), sa.gpuTempAvg, sb.gpuTempAvg, null, '°C'),
    L(t('GPU uso médio (%)','GPU load avg (%)'), sa.gpuLoadAvg, sb.gpuLoadAvg, null, '%'),
    L(t('RAM uso máx (%)','RAM load max (%)'), sa.ramLoadMax, sb.ramLoadMax, null, '%'),
    L(t('RAM usada média','RAM used avg'), sa.ramUsedAvg, sb.ramUsedAvg, fmtBytes, ''),
    L(t('Disco atividade média (%)','Disk activity avg (%)'), sa.diskActAvg, sb.diskActAvg, null, '%'),
    L(t('Rede RX média','Net RX avg'), sa.netRxAvg, sb.netRxAvg, fmtBytesPerSec, ''),
    L(t('Rede TX média','Net TX avg'), sa.netTxAvg, sb.netTxAvg, fmtBytesPerSec, ''),
    ``,
    t('_Auto-capturado: temp/uso CPU/GPU, RAM, rede e disco. Frequências (MHz), voltagem, RPM e ventilação são campos informados. Δ < 0 em temp/uso = B menor._',
      '_Auto-captured: CPU/GPU temp/load, RAM, network and disk. Clocks (MHz), voltage, RPM and cooling are reported fields. Δ < 0 in temp/load = B lower._')
  ].join('\n')
}

async function copyMd() {
  if (!lastMd) return
  try { await darkhub.clipboard.writeText(lastMd); darkhub.app.toast(t('Relatório copiado.', 'Report copied.')) }
  catch (e) { console.error(e.message) }
}

async function clearAll() {
  sessions = []; active = null; stopTimers();
  await saveSessions(); await saveActive();
  renderSessions(); renderComparePickers(); renderActive(); renderControls();
  $('compare-out').textContent = ''; $('compare-actions').hidden = true
  darkhub.app.toast(t('Dados removidos.', 'Data cleared.'))
}

async function init() {
  labelUi()
  try { hw = await darkhub.hardware.info() } catch (e) { console.error(e.message) }
  await loadState()
  if (active && active.status === 'running') startTimers()
  renderControls(); renderActive(); renderSessions(); renderComparePickers()
  try { liveReadout(await darkhub.sensors.read()) } catch {}
  $('btn-start').addEventListener('click', () => startSession().catch((e) => console.error(e.message)))
  $('btn-stop').addEventListener('click', () => stopSession().catch((e) => console.error(e.message)))
  $('btn-mark').addEventListener('click', () => addMarker().catch((e) => console.error(e.message)))
  $('btn-save-result').addEventListener('click', () => saveResultNote().catch((e) => console.error(e.message)))
  $('btn-compare').addEventListener('click', compare)
  $('btn-copy-md').addEventListener('click', () => copyMd())
  $('btn-clear-all').addEventListener('click', () => clearAll().catch((e) => console.error(e.message)))
  window.addEventListener('beforeunload', () => { if (active && active.status === 'running') saveActive() })
}

init().catch((e) => console.error(e.message))
