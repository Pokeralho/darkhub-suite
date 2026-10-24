// DarkHub Vault extension: content script (isolated world).
// Detects login forms, shows an inline fill icon next to the focused login field, fills on request and reports
// submitted credentials to the background (which only offers to save them; nothing is saved without two confirmations).
(() => {
  'use strict'
  if (window.__darkhubVault) return
  window.__darkhubVault = true

  const api = globalThis.browser ?? globalThis.chrome
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  const USER_TYPES = new Set(['text', 'email', 'tel', ''])

  function visible(el) {
    if (!el || el.disabled || el.readOnly) return false
    const r = el.getBoundingClientRect()
    if (r.width < 20 || r.height < 10) return false
    const cs = getComputedStyle(el)
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.1
  }

  function passwordFields(root = document) {
    return [...root.querySelectorAll('input[type="password"]')].filter(visible)
  }

  /** The username field that belongs to a password field: closest preceding text/email input in the same form. */
  function usernameFor(pw) {
    const scope = pw.form || document
    const inputs = [...scope.querySelectorAll('input')]
    const idx = inputs.indexOf(pw)
    for (let i = idx - 1; i >= 0; i -= 1) {
      const el = inputs[i]
      const type = (el.getAttribute('type') || '').toLowerCase()
      if (USER_TYPES.has(type) && visible(el)) return el
    }
    // Username-only first step (e.g. "identifier" pages): any visible username-like input.
    return null
  }

  function loginFieldsFrom(el) {
    if (!el || el.tagName !== 'INPUT') return null
    const type = (el.getAttribute('type') || '').toLowerCase()
    if (type === 'password') return { user: usernameFor(el), pass: el }
    if (USER_TYPES.has(type)) {
      const scope = el.form || document
      const pass = passwordFields(scope)[0] || null
      const ac = (el.getAttribute('autocomplete') || '').toLowerCase()
      const looksLikeUser = pass || /user|email|login|ident/.test(`${el.name} ${el.id} ${ac}`.toLowerCase())
      return looksLikeUser ? { user: el, pass } : null
    }
    return null
  }

  function setValue(el, value) {
    if (!el) return
    el.focus()
    valueSetter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function fillCredentials(username, password, anchor) {
    let fields = anchor ? loginFieldsFrom(anchor) : null
    if (!fields || (!fields.pass && !fields.user)) {
      const pw = passwordFields()[0]
      fields = pw ? { user: usernameFor(pw), pass: pw } : null
    }
    if (!fields) return false
    if (fields.user && username) setValue(fields.user, username)
    if (fields.pass && password) setValue(fields.pass, password)
    return true
  }

  // ------------------------------------------------------------------------------------------------------------
  // Inline icon (closed shadow root so the page cannot reach into it through the DOM).

  let host = null
  let shadow = null
  let anchorEl = null

  function ensureUi() {
    if (host) return
    host = document.createElement('darkhub-vault-ui')
    host.style.cssText = 'position:absolute;z-index:2147483647;top:0;left:0;width:0;height:0;'
    shadow = host.attachShadow({ mode: 'closed' })
    shadow.innerHTML = `
      <style>
        .btn{position:absolute;width:22px;height:22px;border-radius:6px;border:1px solid #3f3f46;background:#18181b;
          display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;box-shadow:0 1px 3px rgba(0,0,0,.4)}
        .btn:hover{border-color:#60a5fa}
        .menu{position:absolute;min-width:220px;max-width:320px;background:#18181b;color:#e4e4e7;border:1px solid #3f3f46;
          border-radius:8px;padding:4px;font:13px/1.3 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.5)}
        .item{display:block;width:100%;text-align:left;background:none;border:0;color:inherit;padding:7px 8px;border-radius:6px;cursor:pointer;font:inherit}
        .item:hover{background:#27272a}
        .sub{color:#a1a1aa;font-size:11px}
        .msg{padding:7px 8px;color:#a1a1aa}
      </style>
      <button class="btn" part="btn" title="DarkHub Vault" aria-label="DarkHub Vault">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#93c5fd" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
      </button>
      <div class="menu" hidden></div>`
    shadow.querySelector('.btn').addEventListener('mousedown', (e) => e.preventDefault())
    shadow.querySelector('.btn').addEventListener('click', onIconClick)
    document.documentElement.appendChild(host)
  }

  function hideUi() {
    if (!host) return
    shadow.querySelector('.btn').style.display = 'none'
    shadow.querySelector('.menu').hidden = true
  }

  function positionUi(el) {
    ensureUi()
    const r = el.getBoundingClientRect()
    const btn = shadow.querySelector('.btn')
    btn.style.display = 'flex'
    btn.style.left = `${window.scrollX + r.right - 26}px`
    btn.style.top = `${window.scrollY + r.top + Math.max(0, (r.height - 22) / 2)}px`
    const menu = shadow.querySelector('.menu')
    menu.style.left = `${window.scrollX + r.left}px`
    menu.style.top = `${window.scrollY + r.bottom + 4}px`
  }

  function menuMessage(text) {
    const menu = shadow.querySelector('.menu')
    menu.textContent = ''
    const d = document.createElement('div')
    d.className = 'msg'
    d.textContent = text
    menu.appendChild(d)
    menu.hidden = false
  }

  const ERRORS = {
    locked: 'Desbloqueie o cofre no DarkHub / Unlock the vault in DarkHub',
    not_paired: 'Abra a extensão para parear / Open the extension to pair',
    host_unavailable: 'DarkHub não está aberto / DarkHub is not running',
    app_not_running: 'DarkHub não está aberto / DarkHub is not running',
    cross_site_frame: 'Formulário de outro site / Form from another site'
  }

  async function onIconClick(e) {
    if (!e.isTrusted || !anchorEl) return
    e.preventDefault()
    e.stopPropagation()
    const res = await api.runtime.sendMessage({ type: 'cs.query' }).catch(() => null)
    if (!res?.ok) return menuMessage(ERRORS[res?.error] || 'DarkHub Vault: erro / error')
    const logins = res.logins || []
    if (!logins.length) return menuMessage('Nenhum login salvo para este site / No saved logins for this site')
    const menu = shadow.querySelector('.menu')
    menu.textContent = ''
    for (const l of logins) {
      const b = document.createElement('button')
      b.className = 'item'
      const name = document.createElement('div')
      name.textContent = l.username || '(sem usuário / no username)'
      b.appendChild(name)
      if (l.match !== 'exact') {
        const sub = document.createElement('div')
        sub.className = 'sub'
        sub.textContent = l.host
        b.appendChild(sub)
      }
      b.addEventListener('mousedown', (ev) => ev.preventDefault())
      b.addEventListener('click', async (ev) => {
        if (!ev.isTrusted) return
        const target = anchorEl
        const cred = await api.runtime.sendMessage({ type: 'cs.fill', entryId: l.entryId }).catch(() => null)
        if (!cred?.ok) return menuMessage(ERRORS[cred?.error] || 'DarkHub Vault: erro / error')
        if (cred.origin !== location.origin) return
        fillCredentials(cred.username, cred.password, target)
        hideUi()
      })
      menu.appendChild(b)
    }
    menu.hidden = false
  }

  document.addEventListener('focusin', (e) => {
    const el = e.target
    if (el === host) return
    const fields = loginFieldsFrom(el)
    if (fields && visible(el)) {
      anchorEl = el
      positionUi(el)
    } else {
      anchorEl = null
      hideUi()
    }
  }, true)

  document.addEventListener('mousedown', (e) => {
    if (host && e.composedPath().includes(host)) return
    if (e.target !== anchorEl && host) shadow.querySelector('.menu').hidden = true
  }, true)

  window.addEventListener('resize', () => { if (anchorEl && host) positionUi(anchorEl) })

  // ------------------------------------------------------------------------------------------------------------
  // Offer to save after a submit.

  let lastReported = ''
  function reportSubmit(form) {
    const pw = passwordFields(form || document).find((p) => p.value)
    if (!pw || !pw.value) return
    const user = usernameFor(pw)
    const key = `${user?.value || ''}\u0000${pw.value}`
    if (key === lastReported) return
    lastReported = key
    api.runtime.sendMessage({ type: 'cs.submitted', username: user?.value || '', password: pw.value }).catch(() => {})
  }

  document.addEventListener('submit', (e) => { if (e.isTrusted) reportSubmit(e.target) }, true)
  document.addEventListener('click', (e) => {
    if (!e.isTrusted) return
    const btn = e.target?.closest?.('button, input[type="submit"], input[type="button"], [role="button"]')
    if (!btn) return
    const scope = btn.form || btn.closest('form') || null
    if (passwordFields(scope || document).some((p) => p.value)) reportSubmit(scope)
  }, true)
  document.addEventListener('keydown', (e) => {
    if (e.isTrusted && e.key === 'Enter' && e.target?.type === 'password') reportSubmit(e.target.form)
  }, true)

  // ------------------------------------------------------------------------------------------------------------
  // Fill requested from the popup (top frame only; the background picked frameId 0).

  api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== api.runtime.id || msg?.type !== 'bg.fill') return false
    // The tab may have navigated since the popup looked at it: only fill the origin the password belongs to.
    if (msg.origin !== location.origin) {
      sendResponse({ ok: false, error: 'origin_changed' })
      return false
    }
    const active = document.activeElement
    const ok = fillCredentials(msg.username, msg.password, active && active.tagName === 'INPUT' ? active : null)
    sendResponse(ok ? { ok: true } : { ok: false, error: 'no_form' })
    return false
  })
})()
