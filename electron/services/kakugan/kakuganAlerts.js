// Which tray notifications a new Kakugan dashboard deserves, compared with the previous one. Pure.
// `sent` holds the keys already notified (persisted), so the same warning never repeats.

const DAY = 86_400_000
const NEEDS = {
  needs_password: 'a Steam pediu a senha',
  needs_email_code: 'a Steam pediu o código do e-mail',
  needs_app_code: 'a Steam pediu o código do Steam Guard',
  missing: 'precisa entrar na Steam de novo (QR Code)'
}

export function kakuganAlerts(prev, dash, sent = new Set(), now = Date.now()) {
  const out = []
  const push = (key, title, body) => { if (!sent.has(key)) out.push({ key, title, body }) }

  if (prev && prev.asfOnline !== dash.asfOnline) {
    // online/offline flips are not "once ever": the key carries the time so the next flip notifies again
    out.push(dash.asfOnline
      ? { key: `asf:on:${now}`, title: 'Kakugan: farm de volta', body: 'O servidor voltou e as contas voltaram a farmar.' }
      : { key: `asf:off:${now}`, title: 'Kakugan: farm fora do ar', body: 'O servidor caiu; as horas param até ele voltar.' })
  }

  for (const p of dash.plans || []) {
    const left = new Date(p.expiresAt).getTime() - now
    if (p.active && left > 0 && left <= 3 * DAY) {
      const days = Math.max(1, Math.ceil(left / DAY))
      push(`expire:${p.id}`, `Kakugan: ${p.name} vence em ${days} dia${days > 1 ? 's' : ''}`, 'Renove no site para as contas continuarem farmando.')
    }
    if (p.kind === 'HOURS' && p.minutesTotal > 0) {
      const hoursLeft = (p.minutesTotal - p.minutesUsed) / 60
      if (hoursLeft <= 0) push(`hours:${p.id}`, 'Kakugan: as horas acabaram', `O plano ${p.name} usou todas as horas. Compre mais no site.`)
      else if (hoursLeft <= 10) push(`hourslow:${p.id}`, `Kakugan: faltam ${Math.floor(hoursLeft)} horas`, `O plano ${p.name} está quase no fim.`)
    }
    for (const a of p.accounts || []) {
      const why = NEEDS[a.state]
      if (!why) continue
      const before = prev?.plans?.flatMap((x) => x.accounts || []).find((x) => x.id === a.id)?.state
      if (before === a.state) continue
      push(`input:${a.id}:${a.state}:${now}`, `Kakugan: ${a.nickname || a.steamLogin} parou`, `${why[0].toUpperCase()}${why.slice(1)}. Abra o DarkHub para continuar.`)
    }
  }
  return out
}

/** Accounts worth pausing when a game starts (farming or about to). Pure. */
export function accountsToPause(dash) {
  return (dash?.plans || []).filter((p) => p.active).flatMap((p) => p.accounts || [])
    .filter((a) => ['online', 'connecting'].includes(a.state)).map((a) => a.id)
}
