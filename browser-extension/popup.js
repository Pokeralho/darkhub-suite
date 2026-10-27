'use strict'
const api = globalThis.browser ?? globalThis.chrome

const STRINGS = {
  pt: {
    loading: 'Carregando…',
    offerSave: 'Oferecer para salvar logins',
    unpair: 'Desparear',
    hostMissingTitle: 'DarkHub não encontrado',
    pairTitle: 'Parear este navegador',
    lockedTitle: 'Cofre bloqueado',
    unsupportedTitle: 'Nada para preencher aqui',
    noneTitle: 'Nenhum login para este site',
    count: '{n} login(s) para este site',
    hostMissing: 'Não foi possível falar com o DarkHub. Abra o DarkHub Suite e, na tela Cofre de senhas, registre este navegador em "Extensão do navegador".',
    pairIntro: 'Este navegador ainda não está pareado com o cofre do DarkHub.',
    pairBtn: 'Parear com o DarkHub',
    pairWaiting: 'Confirme no DarkHub se o código abaixo é o mesmo mostrado lá:',
    pairRejected: 'Pareamento recusado no DarkHub.',
    pairDone: 'Pareado.',
    waitingConfirm: 'Aguardando confirmação no DarkHub…',
    cancel: 'Cancelar',
    locked: 'Desbloqueie o cofre no DarkHub e abra esta janela de novo.',
    unsupported: 'O cofre só preenche logins em sites http(s).',
    none: 'Ao entrar num site, o DarkHub pode oferecer para salvar o login.',
    fill: 'Preencher',
    filled: 'Preenchido.',
    noForm: 'Nenhum formulário de login encontrado nesta página.',
    savePrompt: 'Salvar o login usado em {host}?',
    updatePrompt: 'Atualizar a senha salva para {host}?',
    save: 'Enviar ao DarkHub',
    dismiss: 'Agora não',
    saveSent: 'Confirme no DarkHub para salvar.',
    saved: 'Login salvo no cofre.',
    notSaved: 'Não salvo.',
    otherHost: 'salvo para {host}',
    error: 'Erro: {e}'
  },
  en: {
    loading: 'Loading…',
    offerSave: 'Offer to save logins',
    unpair: 'Unpair',
    hostMissingTitle: 'DarkHub not found',
    pairTitle: 'Pair this browser',
    lockedTitle: 'Vault locked',
    unsupportedTitle: 'Nothing to fill here',
    noneTitle: 'No logins for this site',
    count: '{n} login(s) for this site',
    hostMissing: 'Could not reach DarkHub. Open DarkHub Suite and, on the Password vault screen, register this browser under "Browser extension".',
    pairIntro: 'This browser is not paired with the DarkHub vault yet.',
    pairBtn: 'Pair with DarkHub',
    pairWaiting: 'Confirm in DarkHub that the code below is the same one shown there:',
    pairRejected: 'Pairing was rejected in DarkHub.',
    pairDone: 'Paired.',
    waitingConfirm: 'Waiting for confirmation in DarkHub…',
    cancel: 'Cancel',
    locked: 'Unlock the vault in DarkHub and open this window again.',
    unsupported: 'The vault only fills logins on http(s) sites.',
    none: 'When you sign in to a site, DarkHub can offer to save the login.',
    fill: 'Fill',
    filled: 'Filled.',
    noForm: 'No login form found on this page.',
    savePrompt: 'Save the login used on {host}?',
    updatePrompt: 'Update the saved password for {host}?',
    save: 'Send to DarkHub',
    dismiss: 'Not now',
    saveSent: 'Confirm in DarkHub to save.',
    saved: 'Login saved to the vault.',
    notSaved: 'Not saved.',
    otherHost: 'saved for {host}',
    error: 'Error: {e}'
  }
}
const L = STRINGS[(navigator.language || 'en').toLowerCase().startsWith('pt') ? 'pt' : 'en']
const t = (k, vars = {}) => (L[k] || k).replace(/\{(\w+)\}/g, (_, v) => String(vars[v] ?? ''))

const root = document.getElementById('root')
let tabId = null
let pollTimer = null

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'onclick') n.addEventListener('click', v)
    else if (k === 'className') n.className = v
    else n.setAttribute(k, v)
  }
  for (const c of children) if (c != null) n.append(c)
  return n
}

function send(type, extra = {}) {
  return api.runtime.sendMessage({ type, tabId, ...extra })
}

function state(kind, title, body) {
  return el('div', { className: 'state ' + kind }, el('h1', {}, title), el('p', {}, body))
}

function render(...nodes) {
  root.textContent = ''
  root.append(...nodes)
}

async function refresh() {
  const s = await send('popup.state').catch((e) => ({ error: e?.message }))
  document.getElementById('host').textContent = s.host || ''
  document.getElementById('offerSave').checked = s.settings?.offerSave !== false
  document.getElementById('unpair').hidden = !s.paired

  if (!s.connected) return render(state('error', t('hostMissingTitle'), t('hostMissing')))

  if (!s.paired) {
    const p = s.pairing
    if (p?.status === 'waiting') {
      startPolling()
      return render(
        state('', t('pairTitle'), t('pairWaiting')),
        el('div', { className: 'code', 'aria-label': String(p.code).split('').join(' ') }, ...String(p.code).split('').map((d) => el('span', { 'aria-hidden': 'true' }, d))),
        el('div', { className: 'waiting' }, el('i'), t('waitingConfirm')),
        el('div', { className: 'actions' }, el('button', { className: 'btn', onclick: async () => { await send('popup.pairCancel'); refresh() } }, t('cancel')))
      )
    }
    stopPolling()
    const note = p?.status === 'rejected' ? el('p', { className: 'status err' }, t('pairRejected'))
      : p?.status === 'error' ? el('p', { className: 'status err' }, t('error', { e: p.error })) : null
    return render(
      state('', t('pairTitle'), t('pairIntro')),
      el('div', { className: 'actions' }, el('button', { className: 'btn primary wide', onclick: async () => { await send('popup.pair'); refresh() } }, t('pairBtn'))),
      note
    )
  }
  stopPolling()

  if (!s.unlocked) return render(state('warn', t('lockedTitle'), t('locked')))
  if (!/^https?:/i.test(s.url || '')) return render(state('', t('unsupportedTitle'), t('unsupported')))

  const nodes = []
  if (s.error) nodes.push(el('p', { className: 'status err' }, t('error', { e: s.error })))
  if (s.logins?.length) {
    const ul = el('ul', { className: 'list' })
    const status = el('p', { className: 'status', role: 'status' })
    for (const l of s.logins) {
      const name = l.username || '—'
      const who = el('div', { className: 'who' }, el('div', { className: 'user', title: name }, name))
      if (l.match !== 'exact') who.append(el('div', { className: 'sub' }, t('otherHost', { host: l.host })))
      const btn = el('button', {
        className: 'btn primary',
        'aria-label': `${t('fill')}: ${name}`,
        onclick: async () => {
          btn.disabled = true
          const r = await send('popup.fill', { entryId: l.entryId }).catch(() => null)
          btn.disabled = false
          status.className = 'status ' + (r?.ok ? 'ok' : 'err')
          status.textContent = r?.ok ? t('filled') : r?.error === 'no_form' ? t('noForm') : t('error', { e: r?.error || '?' })
          if (r?.ok) setTimeout(() => window.close(), 400)
        }
      }, t('fill'))
      ul.append(el('li', {}, el('span', { className: 'avatar', 'aria-hidden': 'true' }, name.trim().charAt(0).toUpperCase() || '?'), who, btn))
    }
    nodes.push(el('p', { className: 'count' }, t('count', { n: s.logins.length })), ul, status)
  } else {
    nodes.push(state('', t('noneTitle'), t('none')))
  }

  if (s.pendingSave) {
    const msg = el('p', { className: 'status', role: 'status' })
    const card = el('div', { className: 'card' },
      el('div', { className: 'title' }, t(s.pendingSave.exists ? 'updatePrompt' : 'savePrompt', { host: s.pendingSave.host })),
      el('div', { className: 'sub' }, s.pendingSave.username || ''),
      el('div', { className: 'actions' },
        el('button', {
          className: 'btn primary',
          onclick: async (e) => {
            e.currentTarget.disabled = true
            msg.className = 'status'
            msg.textContent = t('saveSent')
            const r = await send('popup.save').catch(() => null)
            msg.className = 'status ' + (r?.ok && r.saved ? 'ok' : 'err')
            msg.textContent = r?.ok ? (r.saved ? t('saved') : t('notSaved')) : t('error', { e: r?.error || '?' })
          }
        }, t('save')),
        el('button', { className: 'btn', onclick: async () => { await send('popup.dismissSave'); refresh() } }, t('dismiss'))
      ),
      msg
    )
    nodes.push(card)
  }
  render(...nodes)
}

function startPolling() {
  if (!pollTimer) pollTimer = setInterval(refresh, 1000)
}
function stopPolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
}

document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.getAttribute('data-i18n')) })
document.getElementById('offerSave').addEventListener('change', (e) => send('popup.setOfferSave', { value: e.target.checked }))
document.getElementById('unpair').addEventListener('click', async () => { await send('popup.unpair'); refresh() })

api.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
  tabId = tabs[0]?.id ?? null
  refresh()
})
