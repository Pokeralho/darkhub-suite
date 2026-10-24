// Pure helpers for the Startup manager: StartupApproved values (the bytes Task Manager writes), boot events, matching.

/**
 * Task Manager stores each Run/Startup-folder item's state in ...\Explorer\StartupApproved\{Run,Run32,StartupFolder}:
 * 12 bytes, first byte even (02/06) = enabled, odd (03/07) = disabled; bytes 4..11 = FILETIME of when it was disabled.
 * No value at all means enabled.
 */
export function decodeApproved(bytes) {
  if (!bytes || !bytes.length) return { enabled: true, disabledAt: null }
  const enabled = (bytes[0] & 1) === 0
  let disabledAt = null
  if (!enabled && bytes.length >= 12) {
    let ft = 0n
    for (let i = 11; i >= 4; i--) ft = (ft << 8n) | BigInt(bytes[i])
    // FILETIME: 100 ns ticks since 1601-01-01
    if (ft > 0n) disabledAt = Number(ft / 10000n - 11644473600000n)
  }
  return { enabled, disabledAt }
}

export function encodeApproved(enabled, now = Date.now()) {
  const out = new Array(12).fill(0)
  out[0] = enabled ? 0x02 : 0x03
  if (!enabled) {
    let ft = (BigInt(Math.trunc(now)) + 11644473600000n) * 10000n
    for (let i = 4; i < 12; i++) { out[i] = Number(ft & 0xffn); ft >>= 8n }
  }
  return out
}

/** Executable path from a Run command line: quoted path, or the longest prefix ending in .exe. */
export function exeFromCommand(cmd) {
  const s = String(cmd || '').trim()
  if (!s) return ''
  if (s.startsWith('"')) return s.slice(1, s.indexOf('"', 1) > 0 ? s.indexOf('"', 1) : undefined)
  const m = s.match(/^(.+?\.(exe|bat|cmd|com|lnk|vbs|ps1))(\s|$)/i)
  return m ? m[1] : s.split(/\s+/)[0]
}

const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))

/**
 * Diagnostics-Performance events (already reduced to { id, time, data } by the PowerShell side):
 * 100 = a boot (BootTime / MainPathBootTime / BootPostBootTime, ms); 101 = an app that slowed a boot (FileName,
 * TotalTime, DegradationTime). Returns boots newest first and per-file degradations.
 */
export function parseBootEvents(events) {
  const boots = []
  const slow = []
  for (const e of events || []) {
    const d = e.data || {}
    if (e.id === 100) {
      boots.push({ at: e.time, totalMs: num(d.BootTime), mainPathMs: num(d.MainPathBootTime), postBootMs: num(d.BootPostBootTime) })
    } else if (e.id === 101) {
      slow.push({ at: e.time, file: String(d.FileName || d.Name || ''), name: String(d.FriendlyName || d.Name || ''), totalMs: num(d.TotalTime), degradationMs: num(d.DegradationTime) })
    }
  }
  boots.sort((a, b) => b.at - a.at)
  slow.sort((a, b) => b.at - a.at)
  return { boots, slow }
}

const baseName = (p) => String(p || '').split(/[\\/]/).pop().toLowerCase()

/** Measured impact for a startup item: the latest 101 event whose file matches its executable. Never estimated. */
export function impactFor(item, slow) {
  const exe = baseName(item.exe)
  if (!exe) return null
  const hits = slow.filter((s) => baseName(s.file) === exe)
  if (!hits.length) return null
  const avg = Math.round(hits.reduce((a, h) => a + (h.degradationMs || 0), 0) / hits.length)
  return { lastMs: hits[0].degradationMs, avgMs: avg, count: hits.length, lastAt: hits[0].at }
}

/** Items that Windows or security software needs: changing them asks for a stronger confirmation. */
export function sensitivity(item) {
  const s = `${item.name} ${item.exe} ${item.publisher || ''}`.toLowerCase()
  // word boundaries: short vendor names like "eset" or "avg" also appear inside other words (OneDriveSetup)
  if (/securityhealth|windows defender|msmpeng|antivirus|kaspersky|\beset\b|egui\.exe|bitdefender|\bavast|\bavg(ui)?\b|malwarebytes|norton|sophos/.test(s)) return 'security'
  if (/\\windows\\system32\\|microsoft windows|ctfmon|explorer\.exe/.test(s)) return 'system'
  return null
}
