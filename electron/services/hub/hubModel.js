// DarkHub packages (modules and presets): validation, security rules, risk, hardware conditions and the translation of
// a package into the changes DarkHub's engines apply. Pure, no IO except reading the schema file.
//
// Packages come from strangers. The schema (schema/v1.json) is the contract and the same file AI tools read; on top of
// it, the rules below refuse anything that touches security, persistence or system integrity, so a community package
// can only change things DarkHub knows how to capture and restore.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020Pkg from 'ajv/dist/2020.js'
import { validateExtension, MAX_EXTENSION_BYTES } from './extensionModel.js'

const Ajv2020 = Ajv2020Pkg.default || Ajv2020Pkg
const here = path.dirname(fileURLToPath(import.meta.url)).replace(/app\.asar(?![.\w])/, 'app.asar.unpacked')
export const SCHEMA = JSON.parse(fs.readFileSync(path.join(here, 'schema', 'v1.json'), 'utf8'))
// strictRequired off: the registry item uses `not: { required: [...] }` to forbid mixing write/delete fields
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false })
const validateSchema = ajv.compile(SCHEMA)
export const MAX_PACKAGE_BYTES = 512 * 1024
export { MAX_EXTENSION_BYTES }

// ---------------------------------------------------------------- security rules

/** Registry areas no community package may write: security, persistence, other services, file handlers, updates. */
const BLOCKED_REG = [
  ['hklm\\software\\policies\\microsoft\\windows defender', 'Microsoft Defender'],
  ['hklm\\software\\microsoft\\windows defender', 'Microsoft Defender'],
  ['hklm\\software\\policies\\microsoft\\windows advanced threat protection', 'Microsoft Defender'],
  ['hklm\\system\\currentcontrolset\\control\\deviceguard', 'isolamento de núcleo (VBS/HVCI)'],
  ['hklm\\system\\currentcontrolset\\control\\lsa', 'proteção de credenciais (LSA)'],
  ['hklm\\system\\currentcontrolset\\control\\securityproviders', 'provedores de segurança'],
  ['hklm\\software\\microsoft\\windows\\currentversion\\policies\\system', 'Controle de Conta de Usuário (UAC)'],
  ['hklm\\software\\policies\\microsoft\\windowsfirewall', 'Firewall do Windows'],
  ['hklm\\system\\currentcontrolset\\services\\sharedaccess\\parameters\\firewallpolicy', 'Firewall do Windows'],
  ['hklm\\software\\policies\\microsoft\\windows\\windowsupdate', 'Windows Update'],
  ['hklm\\software\\microsoft\\windowsupdate', 'Windows Update'],
  ['hklm\\software\\microsoft\\windows nt\\currentversion\\image file execution options', 'execução de programas (IFEO)'],
  ['hklm\\software\\microsoft\\windows nt\\currentversion\\winlogon', 'inicialização da sessão (Winlogon)'],
  ['hklm\\software\\microsoft\\windows nt\\currentversion\\windows', 'carregamento de DLLs (AppInit)'],
  ['hklm\\software\\microsoft\\windows\\currentversion\\run', 'programas que iniciam com o Windows'],
  ['hkcu\\software\\microsoft\\windows\\currentversion\\run', 'programas que iniciam com o Windows'],
  ['hklm\\software\\wow6432node\\microsoft\\windows\\currentversion\\run', 'programas que iniciam com o Windows'],
  ['hklm\\software\\microsoft\\windows\\currentversion\\policies\\explorer\\run', 'programas que iniciam com o Windows'],
  ['hkcu\\software\\microsoft\\windows\\currentversion\\policies\\explorer\\run', 'programas que iniciam com o Windows'],
  ['hklm\\system\\currentcontrolset\\services', 'serviços (use um item "service")'],
  ['hklm\\software\\classes', 'associações de arquivos e extensões do Explorer'],
  ['hkcu\\software\\classes', 'associações de arquivos e extensões do Explorer'],
  // Session Manager keeps legit tuning (Memory Management, kernel timer); only its code-loading parts are blocked
  ['hklm\\system\\currentcontrolset\\control\\session manager\\knowndlls', 'carregamento de DLLs do sistema'],
  ['hklm\\system\\currentcontrolset\\control\\session manager\\appcertdlls', 'carregamento de DLLs (AppCert)'],
  ['hklm\\system\\currentcontrolset\\control\\session manager\\environment', 'variáveis de ambiente do sistema (PATH)'],
  ['hkcu\\environment', 'variáveis de ambiente (PATH)'],
  ['hklm\\software\\microsoft\\cryptography', 'criptografia do sistema'],
  ['hklm\\software\\policies\\microsoft\\systemcertificates', 'certificados'],
  ['hklm\\software\\microsoft\\systemcertificates', 'certificados'],
  ['hkcu\\software\\microsoft\\systemcertificates', 'certificados']
]
const BLOCKED_REG_NAMES = [
  ['enablesmartscreen', 'SmartScreen'], ['shellsmartscreenlevel', 'SmartScreen'], ['smartscreenenabled', 'SmartScreen'],
  ['enablelua', 'Controle de Conta de Usuário (UAC)'], ['consentpromptbehavioradmin', 'Controle de Conta de Usuário (UAC)'],
  ['bootexecute', 'programas executados no boot'], ['setupexecute', 'programas executados no boot'], ['execute', 'programas executados no boot'],
  ['pendingfilerenameoperations', 'substituição de arquivos no boot'], ['pendingfilerenameoperations2', 'substituição de arquivos no boot'],
  ['safedllsearchmode', 'busca segura de DLLs'], ['cwdillegalindllsearch', 'busca segura de DLLs']
]
/** Services packages may not touch: security, updates and what Windows needs to start or stay manageable. */
const BLOCKED_SERVICES = new Set([
  'windefend', 'wdnissvc', 'wdnisdrv', 'wdfilter', 'wdboot', 'sense', 'securityhealthservice', 'wscsvc', 'mpssvc', 'bfe',
  'wuauserv', 'usosvc', 'waasmedicsvc', 'trustedinstaller', 'appidsvc', 'cryptsvc', 'eventlog', 'rpcss', 'rpceptmapper',
  'dcomlaunch', 'lsm', 'samss', 'winmgmt', 'gpsvc', 'schedule', 'profsvc', 'power', 'plugplay', 'dhcp', 'dnscache', 'nsi',
  'brokerinfrastructure', 'systemeventsbroker', 'coremessagingregistrar', 'staterepository', 'msiserver', 'vaultsvc', 'keyiso',
  'netlogon', 'lanmanworkstation', 'mpsdrv', 'wlansvc', 'audiosrv', 'audioendpointbuilder', 'netprofm', 'nlasvc', 'smphost'
])
const BLOCKED_TASK_FOLDERS = ['\\microsoft\\windows\\windows defender\\', '\\microsoft\\windows\\windowsupdate\\', '\\microsoft\\windows\\updateorchestrator\\', '\\microsoft\\windows\\waasmedic\\', '\\microsoft\\windows\\exploitguard\\']

const lower = (s) => String(s || '').toLowerCase()
const under = (p, prefix) => p === prefix || p.startsWith(`${prefix}\\`)

const pathOf = (instancePath) => instancePath.replace(/^\//, '').replace(/\//g, '.') || '(raiz)'

/**
 * Validates a package (JSON text or object) against the schema and the security rules.
 * builtins: Map id -> entry for DarkHub's own tweaks ('tweak:x': { kind: 'tweak', title, risk, securityRelated }) and
 * operations ('op:x': { kind: 'op', title, risk, securityRelated, reversible, packageUse: 'yes'|'official'|'no' }).
 * official: the package came signed as official from the Hub: security items are allowed (never scripts).
 * Returns { ok, pkg, errors: [{ path, message }], risk }.
 */
export function validatePackage(input, builtins = new Map(), { official = false } = {}) {
  let pkg = input
  if (typeof input === 'string') {
    const bytes = Buffer.byteLength(input, 'utf8')
    if (bytes > MAX_EXTENSION_BYTES + 64 * 1024) return { ok: false, errors: [{ path: '(arquivo)', message: 'Pacote maior que 2 MB.' }] }
    try { pkg = JSON.parse(input.replace(/^﻿/, '')) } catch (e) { return { ok: false, errors: [{ path: '(arquivo)', message: `JSON inválido: ${e.message}` }] } }
    if (pkg?.type !== 'extension' && bytes > MAX_PACKAGE_BYTES) return { ok: false, errors: [{ path: '(arquivo)', message: 'Pacote maior que 512 KB.' }] }
  }
  if (!validateSchema(pkg)) {
    // oneOf branches produce a lot of noise: keep the most specific messages
    let errs = (validateSchema.errors || []).filter((e) => e.keyword !== 'oneOf' && e.keyword !== 'not' && e.keyword !== 'if')
    // a field that may be text or an object (name, description) fails both branches: keep the real problem, not "must be object"
    const specific = new Set(errs.filter((e) => e.keyword !== 'type').map((e) => e.instancePath))
    errs = errs.filter((e) => e.keyword !== 'type' || !specific.has(e.instancePath))
    // an item is one of use/op/registry/service/task: ignore what the other kinds would have wanted
    const KINDS = ['use', 'op', 'registry', 'service', 'task']
    const at = (ptr) => ptr.split('/').slice(1).reduce((o, k) => (o == null ? o : o[k.replace(/~1/g, '/').replace(/~0/g, '~')]), pkg)
    errs = errs.filter((e) => {
      if (!/^\/items\/\d+$/.test(e.instancePath)) return true
      const kind = KINDS.find((k) => at(e.instancePath)?.[k] !== undefined)
      if (!kind) return true
      if (e.keyword === 'required') return !KINDS.includes(e.params.missingProperty)
      if (e.keyword === 'additionalProperties') return !KINDS.includes(e.params.additionalProperty) || e.params.additionalProperty !== kind
      return true
    })
    // several allowed types for one field: one message
    const types = new Map()
    errs = errs.filter((e) => { if (e.keyword !== 'type') return true; const k = e.instancePath; if (types.has(k)) { types.get(k).params.type += `,${e.params.type}`; return false } types.set(k, e); return true })
    const TYPE = { string: 'texto', object: 'objeto', integer: 'número inteiro', number: 'número', array: 'lista', boolean: 'true ou false' }
    const seen = new Set()
    const errors = []
    for (const e of errs.length ? errs : validateSchema.errors) {
      const p = e.params || {}
      const msg = e.keyword === 'additionalProperties' ? `campo não permitido: "${p.additionalProperty}"`
        : e.keyword === 'enum' ? `valor deve ser um de: ${p.allowedValues.join(', ')}`
          : e.keyword === 'required' ? `falta o campo "${p.missingProperty}"`
            : e.keyword === 'pattern' ? 'formato inválido'
              : e.keyword === 'type' ? `tipo errado: esperado ${String(p.type).split(',').map((x) => TYPE[x] || x).join(' ou ')}`
                : e.keyword === 'minLength' ? `texto curto demais (mínimo ${p.limit} caracteres)`
                  : e.keyword === 'maxLength' ? `texto longo demais (máximo ${p.limit} caracteres)`
                    : e.keyword === 'minimum' ? `valor menor que ${p.limit}`
                      : e.keyword === 'maximum' ? `valor maior que ${p.limit}`
                        : e.keyword === 'minItems' ? `precisa de pelo menos ${p.limit} item(ns)`
                          : e.keyword === 'maxItems' ? `no máximo ${p.limit} itens`
                            : e.keyword === 'const' ? `deve ser ${JSON.stringify(p.allowedValue)}` : e.message
      const key = `${e.instancePath}|${msg}`
      if (!seen.has(key)) { seen.add(key); errors.push({ path: pathOf(e.instancePath), message: msg }) }
      if (errors.length >= 25) break
    }
    return { ok: false, pkg, errors }
  }

  if (pkg.type === 'extension') {
    const x = validateExtension(pkg)
    if (x.errors.length) return { ok: false, pkg, errors: x.errors }
    return { ok: true, pkg, errors: [], risk: x.risk, findings: x.findings }
  }
  const errors = []
  pkg.items.forEach((it, i) => {
    const at = `items.${i}`
    if (it.use) {
      const id = it.use.slice('darkhub:'.length)
      const b = builtins.get(id)
      if (!b || b.internal || b.kind === 'op') errors.push({ path: at, message: `ajuste do DarkHub desconhecido: "${it.use}" (lista em docs/hub/BUILTIN.md)` })
      else if (b.securityRelated && !official) errors.push({ path: at, message: `"${it.use}" mexe em segurança e só pode estar em pacotes oficiais.` })
    }
    if (it.op) {
      const id = it.op.slice('darkhub:'.length)
      const b = builtins.get(id)
      if (!b || b.kind !== 'op') errors.push({ path: at, message: `operação do DarkHub desconhecida: "${it.op}" (lista em docs/hub/BUILTIN.md)` })
      else if (b.packageUse === 'no') errors.push({ path: at, message: `"${it.op}" não pode estar em pacotes: muda o sistema sem ter como desfazer.` })
      else if ((b.packageUse === 'official' || b.securityRelated) && !official) errors.push({ path: at, message: `"${it.op}" só pode estar em pacotes oficiais.` })
    }
    if (official) return
    if (it.registry) {
      const p = lower(it.registry.path)
      const hit = BLOCKED_REG.find(([prefix]) => under(p, prefix))
      if (hit) errors.push({ path: at, message: `pacotes não podem alterar ${hit[1]} (${it.registry.path}).` })
      const nameHit = it.registry.name != null && BLOCKED_REG_NAMES.find(([n]) => lower(it.registry.name) === n)
      if (nameHit) errors.push({ path: at, message: `pacotes não podem alterar ${nameHit[1]}.` })
      if (it.registry.type === 'dword' && typeof it.registry.value === 'number' && it.registry.value > 0xffffffff) errors.push({ path: at, message: 'dword vai até 4294967295.' })
      if (['dword', 'qword'].includes(it.registry.type) && typeof it.registry.value !== 'number') errors.push({ path: at, message: `${it.registry.type} precisa de um número.` })
      if (['string', 'expandString'].includes(it.registry.type) && typeof it.registry.value !== 'string') errors.push({ path: at, message: `${it.registry.type} precisa de um texto.` })
      if (it.registry.type === 'multiString' && !Array.isArray(it.registry.value)) errors.push({ path: at, message: 'multiString precisa de uma lista de textos.' })
      if (it.registry.type === 'binary' && !(typeof it.registry.value === 'string' && /^([0-9a-fA-F]{2})*$/.test(it.registry.value))) errors.push({ path: at, message: 'binary precisa de hexadecimal, ex.: "00ff10".' })
    }
    if (it.service && BLOCKED_SERVICES.has(lower(it.service.name))) errors.push({ path: at, message: `o serviço ${it.service.name} é essencial ou de segurança e não pode ser alterado por pacotes.` })
    if (it.task) {
      const folder = lower(it.task.path)
      if (BLOCKED_TASK_FOLDERS.some((f) => folder.startsWith(f))) errors.push({ path: at, message: `tarefas de ${it.task.path} são de segurança ou atualização e não podem ser alteradas.` })
    }
  })
  if (errors.length) return { ok: false, pkg, errors }
  return { ok: true, pkg, errors: [], risk: computeRisk(pkg, builtins) }
}

/** low: only per-user settings; medium: machine-wide changes, services, tasks; high: deletes keys or disables 5+ services. */
export function computeRisk(pkg, builtins = new Map()) {
  let level = 0
  let disabled = 0
  for (const it of pkg.items || []) {
    if (it.use || it.op) { const b = builtins.get((it.use || it.op).slice(8)); level = Math.max(level, b?.risk === 'high' ? 2 : b?.risk === 'medium' ? 1 : 0) }
    if (it.registry) { if (it.registry.deleteKey) level = 2; else if (/^HKLM\\/i.test(it.registry.path)) level = Math.max(level, 1) }
    if (it.service) { level = Math.max(level, 1); if (it.service.startType === 'disabled') disabled++ }
    if (it.task) level = Math.max(level, 1)
  }
  if (disabled >= 5) level = 2
  return ['low', 'medium', 'high'][level]
}

// ---------------------------------------------------------------- hardware conditions

/**
 * hw: { osBuild, cpuVendor, gpuVendors: [], gpuDedicated, chassis, ramGb, netWired, darkos } (from HubService).
 * Returns null when the condition matches, or the first mismatch as text.
 */
export function conditionMismatch(cond, hw) {
  if (!cond) return null
  const num = (v, m) => {
    if (v == null || !Number.isFinite(Number(v))) return false
    if (typeof m === 'number') return Number(v) === m
    if (Array.isArray(m)) return m.includes(Number(v))
    return (m.gte == null || v >= m.gte) && (m.lte == null || v <= m.lte) && (m.gt == null || v > m.gt) && (m.lt == null || v < m.lt)
  }
  const anyOf = (have, m) => { const want = Array.isArray(m) ? m : [m]; const list = Array.isArray(have) ? have : [have]; return list.some((h) => want.includes(h)) }
  const checks = {
    'os.build': (m) => num(hw?.osBuild, m),
    'cpu.vendor': (m) => anyOf(hw?.cpuVendor, m),
    'gpu.vendor': (m) => anyOf(hw?.gpuVendors || [], m),
    'gpu.dedicated': (m) => Boolean(hw?.gpuDedicated) === m,
    chassis: (m) => anyOf(hw?.chassis, m),
    'ram.gb': (m) => num(hw?.ramGb, m),
    'net.wired': (m) => Boolean(hw?.netWired) === m,
    darkos: (m) => Boolean(hw?.darkos) === m
  }
  for (const [k, m] of Object.entries(cond)) {
    if (!checks[k](m)) return `${k} ${JSON.stringify(m)}`
  }
  return null
}

const LAPTOP_CHASSIS = new Set([8, 9, 10, 11, 12, 14, 18, 21, 30, 31, 32])
const DESKTOP_CHASSIS = new Set([3, 4, 5, 6, 7, 13, 15, 16, 35, 36])

/** Hardware facts the conditions use, from one CIM query (see HubService). Pure. */
export function hardwareFromRaw(raw = {}, darkos = false) {
  const gpus = (Array.isArray(raw.gpus) ? raw.gpus : raw.gpus ? [raw.gpus] : []).map(String)
  const vendors = [...new Set(gpus.map((n) => (/nvidia|geforce|quadro|rtx|gtx/i.test(n) ? 'nvidia' : /radeon|amd/i.test(n) ? 'amd' : /intel|arc/i.test(n) ? 'intel' : null)).filter(Boolean))]
  const chassisTypes = (Array.isArray(raw.chassis) ? raw.chassis : raw.chassis != null ? [raw.chassis] : []).map(Number)
  const laptop = chassisTypes.some((c) => LAPTOP_CHASSIS.has(c)) || (Number(raw.battery) > 0 && !chassisTypes.some((c) => DESKTOP_CHASSIS.has(c)))
  return {
    osBuild: Number(raw.build) || null,
    cpuVendor: /intel/i.test(raw.cpu || '') ? 'intel' : /amd/i.test(raw.cpu || '') ? 'amd' : null,
    gpuVendors: vendors,
    gpuNames: gpus,
    gpuDedicated: gpus.some((n) => /nvidia|geforce|quadro|rtx|gtx|radeon\s*(rx|pro|vii)|arc\s*a\d/i.test(n)),
    chassis: laptop ? 'laptop' : 'desktop',
    ramGb: raw.ram ? Math.round(Number(raw.ram) / 1073741824) : null,
    netWired: Boolean(raw.wired),
    darkos: Boolean(darkos)
  }
}

// ---------------------------------------------------------------- resolving a package into steps

const REG_TYPE = { dword: 'REG_DWORD', qword: 'REG_QWORD', string: 'REG_SZ', expandString: 'REG_EXPAND_SZ', multiString: 'REG_MULTI_SZ', binary: 'REG_BINARY' }
const SERVICE_START = { automatic: 2, automaticDelayed: 2, manual: 3, disabled: 4 }
export const serviceKey = (name) => `HKLM\\SYSTEM\\CurrentControlSet\\Services\\${name}`

/** One package item as an engine step. */
export function stepOf(it, index) {
  if (it.use) return { index, kind: 'tweak', id: it.use.slice('darkhub:'.length), note: it.note }
  if (it.op) return { index, kind: 'op', id: it.op.slice('darkhub:'.length), note: it.note }
  if (it.registry) return { index, kind: 'registry', ...it.registry, note: it.note }
  if (it.service) return { index, kind: 'service', ...it.service, note: it.note }
  return { index, kind: 'task', ...it.task, note: it.note }
}

/**
 * The steps that apply on this PC, and the ones skipped by an `if`, keeping the package order. Operations that only
 * wrap built-in tweaks become those tweaks (same snapshot and "already on" handling as `use`).
 */
export function resolvePackage(pkg, hw, builtins = new Map()) {
  const notFor = conditionMismatch(pkg.when, hw)
  const steps = []
  const skipped = []
  ;(pkg.items || []).forEach((it, index) => {
    const miss = conditionMismatch(it.if, hw)
    const step = stepOf(it, index)
    if (miss) { skipped.push({ index, step, reason: miss }); return }
    const tweaks = step.kind === 'op' ? builtins.get(step.id)?.tweakIds : null
    if (tweaks?.length) for (const id of tweaks) steps.push({ index, kind: 'tweak', id, via: step.id, note: it.note })
    else steps.push(step)
  })
  return { applicable: !notFor, notFor, steps, skipped }
}

/** Registry changes (DeepTweaksEngine format) for the registry and service steps; tasks and tweaks go elsewhere. */
export function toChangeSet(steps) {
  const changes = []
  const stopServices = []
  for (const s of steps) {
    if (s.kind === 'registry') {
      if (s.deleteKey) changes.push({ key: s.path, deleteKey: true })
      else if (s.delete) changes.push({ key: s.path, name: s.name, deleteValue: true })
      else changes.push({ key: s.path, name: s.name, type: REG_TYPE[s.type], data: s.type === 'multiString' ? s.value.join('|') : String(s.value) })
    } else if (s.kind === 'service') {
      changes.push({ key: serviceKey(s.name), name: 'Start', type: 'REG_DWORD', data: String(SERVICE_START[s.startType]) })
      if (s.startType === 'automatic' || s.startType === 'automaticDelayed') changes.push({ key: serviceKey(s.name), name: 'DelayedAutostart', type: 'REG_DWORD', data: s.startType === 'automaticDelayed' ? '1' : '0' })
      if (s.stop) stopServices.push(s.name)
    }
  }
  return { changes, stopServices }
}

/** Registry entries a package writes, used to refuse two installed packages fighting over the same value. */
export function touchedEntries(steps) {
  return toChangeSet(steps).changes.map((c) => `${lower(c.key)}|${lower(c.name ?? '*')}`)
}

// ---------------------------------------------------------------- describing steps for people

const T = {
  'pt-BR': {
    tweak: 'Ajuste do DarkHub', op: 'Operação do DarkHub', once: 'ação única (não é desfeita)', reg: 'Registro', svc: 'Serviço', task: 'Tarefa agendada', del: 'apagar o valor', delKey: 'apagar a chave inteira',
    start: { automatic: 'iniciar automaticamente', automaticDelayed: 'iniciar automaticamente (atrasado)', manual: 'iniciar só quando pedido (manual)', disabled: 'desativado' },
    stop: 'e parar agora', enabled: 'habilitada', disabled: 'desabilitada', defaultValue: '(Padrão)'
  },
  'en-US': {
    tweak: 'DarkHub tweak', op: 'DarkHub operation', once: 'one-time action (not undone)', reg: 'Registry', svc: 'Service', task: 'Scheduled task', del: 'delete the value', delKey: 'delete the whole key',
    start: { automatic: 'start automatically', automaticDelayed: 'start automatically (delayed)', manual: 'start on demand (manual)', disabled: 'disabled' },
    stop: 'and stop it now', enabled: 'enabled', disabled: 'disabled', defaultValue: '(Default)'
  }
}

export function describeStep(s, lang = 'pt-BR', builtins = new Map()) {
  const t = T[lang] || T['pt-BR']
  if (s.kind === 'tweak') return { group: t.tweak, title: builtins.get(s.id)?.title || s.id, target: '' }
  if (s.kind === 'op') { const b = builtins.get(s.id); return { group: t.op, title: b?.title || s.id, target: b && !b.reversible ? t.once : '' } }
  if (s.kind === 'registry') {
    const target = s.deleteKey ? t.delKey : s.delete ? t.del : `${s.type} = ${Array.isArray(s.value) ? s.value.join(' | ') : s.value}`
    return { group: t.reg, title: s.deleteKey ? s.path : `${s.path}\\${s.name === '' ? t.defaultValue : s.name}`, target }
  }
  if (s.kind === 'service') return { group: t.svc, title: s.name, target: `${t.start[s.startType]}${s.stop ? ` ${t.stop}` : ''}` }
  return { group: t.task, title: `${s.path}${s.name}`, target: s.state === 'enabled' ? t.enabled : t.disabled }
}

const pick = (text, lang) => (typeof text === 'string' ? text : text?.[lang] || text?.['pt-BR'] || text?.['en-US'] || '')
export const textOf = pick

/** A preset made from the DarkHub tweaks and reversible operations active on this PC ("Create a preset from my PC"). */
export function presetFromState({ id, name, github, activeIds, activeOps = [], builtins, appVersion }) {
  const items = [
    ...activeIds.filter((tid) => { const b = builtins.get(tid); return b && b.kind !== 'op' && !b.internal && !b.securityRelated }).map((tid) => ({ use: `darkhub:${tid}` })),
    ...activeOps.filter((oid) => builtins.get(oid)?.packageUse === 'yes').map((oid) => ({ op: `darkhub:${oid}` }))
  ]
  return {
    $schema: 'https://darkhub.ink/schema/v1.json',
    schemaVersion: 1,
    type: 'preset',
    id,
    version: '1.0.0',
    name: { 'pt-BR': name },
    description: { 'pt-BR': 'Ajustes do DarkHub aplicados neste PC, exportados pelo próprio DarkHub.' },
    author: { github },
    minApp: appVersion,
    items
  }
}
