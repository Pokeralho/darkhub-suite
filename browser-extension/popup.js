'use strict'
const api = globalThis.browser ?? globalThis.chrome

const STRINGS = {
  pt: {
    loading: 'Carregando…',
    offerSave: 'Oferecer para salvar logins',
    unpair: 'Desparear',
    hostMissing: 'Não foi possível falar com o DarkHub. Abra o DarkHub Suite e, na tela Cofre de senhas, registre este navegador em "Extensão do navegador".',
    pairIntro: 'Este navegador ainda não está pareado com o cofre do DarkHub.',
    pairBtn: 'Parear com o DarkHub',
    pairWaiting: 'Confirme no DarkHub se o código abaixo é o mesmo mostrado lá:',
    pairRejected: 'Pareamento recusado no DarkHub.',
    pairDone: 'Pareado.',
    cancel: 'Cancelar',
    locked: 'O cofre está bloqueado. Desbloqueie no DarkHub e abra esta janela de novo.',
    unsupported: 'Esta página não é um site http(s).',
    none: 'Nenhum login salvo para este site.',
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
    hostMissing: 'Could not reach DarkHub. Open DarkHub Suite and, on the Password vault screen, register this browser under "Browser extension".',
    pairIntro: 'This browser is not paired with the DarkHub vault yet.',
    pairBtn: 'Pair with DarkHub',
    pairWaiting: 'Confirm in DarkHub that the code below is the same one shown there:',
    pairRejected: 'Pairing was rejected in DarkHub.',
    pairDone: 'Paired.',
    cancel: 'Cancel',
    locked: 'The vault is locked. Unlock it in DarkHub and open this window again.',
    unsupported: 'This page is not an http(s) site.',
    none: 'No saved logins for this site.',
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

function render(...nodes) {
  root.textContent = ''
  root.append(...nodes)
}

async function refresh() {
  const s = await send('popup.state').catch((e) => ({ error: e?.message }))
  document.getElementById('host').textContent = s.host || ''
  document.getElementById('offerSave').checked = s.settings?.offerSave !== false
  document.getElementById('unpair').hidden = !s.paired

  if (!s.connected) return render(el('p', { className: 'err' }, t('hostMissing')))

  if (!s.paired) {
    const p = s.pairing
    if (p?.status === 'waiting') {
      startPolling()
      return render(
        el('p', { className: 'muted' }, t('pairWaiting')),
        el('div', { className: 'code' }, p.code),
        el('div', { className: 'row' }, el('button', { className: 'btn', onclick: async () => { await send('popup.pairCancel'); refresh() } }, t('cancel')))
      )
    }
    stopPolling()
    const note = p?.status === 'rejected' ? el('p', { className: 'err' }, t('pairRejected'))
      : p?.status === 'error' ? el('p', { className: 'err' }, t('error', { e: p.error })) : null
    return render(
      el('p', { className: 'muted' }, t('pairIntro')),
      note,
      el('div', { className: 'row' }, el('button', { className: 'btn primary', onclick: async () => { await send('popup.pair'); refresh() } }, t('pairBtn')))
    )
  }
  stopPolling()

  if (!s.unlocked) return render(el('p', { className: 'muted' }, t('locked')))
  if (!/^https?:/i.test(s.url || '')) return render(el('p', { className: 'muted' }, t('unsupported')))

  const nodes = []
  if (s.error) nodes.push(el('p', { className: 'err' }, t('error', { e: s.error })))
  if (s.logins?.length) {
    const ul = el('ul', { className: 'list' })
    const status = el('p', { className: 'muted' })
    for (const l of s.logins) {
      const who = el('div', { className: 'who' }, el('div', { className: 'user' }, l.username || '—'))
      if (l.match !== 'exact') who.append(el('div', { className: 'sub' }, t('otherHost', { host: l.host })))
      const btn = el('button', {
        className: 'btn primary',
        onclick: async () => {
          btn.disabled = true
          const r = await send('popup.fill', { entryId: l.entryId }).catch(() => null)
          btn.disabled = false
          status.textContent = r?.ok ? t('filled') : r?.error === 'no_form' ? t('noForm') : t('error', { e: r?.error || '?' })
          if (r?.ok) setTimeout(() => window.close(), 400)
        }
      }, t('fill'))
      ul.append(el('li', {}, who, btn))
    }
    nodes.push(ul, status)
  } else {
    nodes.push(el('p', { className: 'muted' }, t('none')))
  }

  if (s.pendingSave) {
    const msg = el('p', { className: 'muted' })
    const card = el('div', { className: 'card' },
      el('div', {}, t(s.pendingSave.exists ? 'updatePrompt' : 'savePrompt', { host: s.pendingSave.host })),
      el('div', { className: 'sub' }, s.pendingSave.username || ''),
      el('div', { className: 'row' },
        el('button', {
          className: 'btn primary',
          onclick: async (e) => {
            e.target.disabled = true
            msg.textContent = t('saveSent')
            const r = await send('popup.save').catch(() => null)
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
