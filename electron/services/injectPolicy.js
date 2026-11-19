// Targets the DLL injector (injector:inject) never touches, whatever the page sends: Windows' own critical/protected
// processes (a crash there is a bluescreen or a broken session) and anti-cheat services and drivers (injecting into
// them gets the user's game accounts banned). Pure, no IO.
export const INJECT_REFUSED = new Set([
  'system', 'idle', 'registry', 'memory compression', 'secure system', 'smss', 'csrss', 'wininit', 'winlogon', 'services',
  'lsass', 'lsaiso', 'svchost', 'fontdrvhost', 'dwm', 'msmpeng', 'nissrv', 'securityhealthservice',
  'easyanticheat', 'easyanticheat_eos', 'eaanticheat.gameservice', 'beservice', 'beservice_x64', 'battleye', 'vgc', 'vgtray', 'vgk',
  'faceit', 'faceitclient', 'faceitservice', 'faceit_ac', 'esportal', 'ricochet', 'gameguard', 'xigncode', 'nprotect', 'mhyprot2'
])

/** Null when `processName` may be targeted, else the reason (pt-BR) it is refused. */
export function injectTargetRefusal(processName) {
  const raw = String(processName ?? '').trim()
  const n = raw.toLowerCase().replace(/\.exe$/, '')
  if (!n || n.length > 260 || /[\\/:*?"<>|\0-\x1f]/.test(n)) return 'Nome de processo inválido.'
  if (INJECT_REFUSED.has(n) || /anti.?cheat|^eac|^ace-/.test(n)) return `Injeção em "${raw}" recusada: é um processo protegido do Windows ou de anti-cheat.`
  return null
}
