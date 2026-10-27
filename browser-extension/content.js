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

  const MARK = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12L12 2.5M12 5.8l1.81-2.01M12 5.8l-1.81-2.01M12 12L3.77 7.25M6.63 8.9l-.83-2.57M6.63 8.9l-2.64.56M12 12l-8.23 4.75M6.63 15.1l-2.64-.56M6.63 15.1l-.83 2.57M12 12v9.5M12 18.2l-1.81 2.01M12 18.2l1.81 2.01M12 12l8.23 4.75M17.37 15.1l.83 2.57M17.37 15.1l2.64-.56M12 12l8.23-4.75M17.37 8.9l2.64.56M17.37 8.9l.83-2.57" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
  const PT = (navigator.language || '').toLowerCase().startsWith('pt')
  const tr = (pt, en) => (PT ? pt : en)

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
        :host{all:initial}
        .btn{position:absolute;width:22px;height:22px;border-radius:6px;border:1px solid oklch(0.34 0.013 255);background:oklch(0.193 0.011 255);
          display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;color:#2ee6f2;
          box-shadow:0 1px 3px oklch(0.1 0.01 255 / .5);transition:border-color 150ms cubic-bezier(.23,1,.32,1),transform 140ms cubic-bezier(.23,1,.32,1)}
        .btn:hover{border-color:oklch(0.81 0.085 228)}
        .btn:active{transform:scale(.94)}
        .btn:focus-visible{outline:1.5px solid oklch(0.81 0.085 228);outline-offset:2px}
        .menu{position:absolute;min-width:232px;max-width:320px;background:oklch(0.193 0.011 255);color:oklch(0.945 0.006 255);
          border:1px solid oklch(0.262 0.012 255);border-radius:10px;padding:4px;font:13px/1.35 "Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;
          box-shadow:0 12px 32px oklch(0.1 0.01 255 / .55);transform-origin:top left;
          transition:opacity 150ms cubic-bezier(.23,1,.32,1),transform 150ms cubic-bezier(.23,1,.32,1)}
        @starting-style{.menu{opacity:0;transform:scale(.97) translateY(-2px)}}
        .head{display:flex;align-items:center;gap:6px;padding:6px 8px 5px;color:oklch(0.67 0.014 255);font-size:11px;letter-spacing:.08em;text-transform:uppercase}
        .head svg{color:#2ee6f2}
        .item{display:flex;align-items:center;gap:9px;width:100%;text-align:left;background:none;border:0;color:inherit;padding:6px 8px;border-radius:7px;cursor:pointer;font:inherit}
        .item:hover,.item:focus-visible{background:oklch(0.225 0.012 255);outline:none}
        .av{flex:none;width:24px;height:24px;border-radius:6px;display:grid;place-items:center;background:oklch(0.158 0.010 255);
          border:1px solid oklch(0.262 0.012 255);color:oklch(0.81 0.085 228);font-weight:600;font-size:12px}
        .who{min-width:0}
        .name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .sub{color:oklch(0.55 0.015 255);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .msg{padding:8px;color:oklch(0.67 0.014 255)}
        @media (prefers-reduced-motion: reduce){.btn,.menu{transition:none}}
      </style>
      <button class="btn" part="btn" title="DarkHub Vault" aria-label="DarkHub Vault">${MARK}</button>
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

  function menuHead() {
    const h = document.createElement('div')
    h.className = 'head'
    h.innerHTML = MARK
    h.append('DarkHub Vault')
    return h
  }

  function menuMessage(text) {
    const menu = shadow.querySelector('.menu')
    menu.textContent = ''
    menu.appendChild(menuHead())
    const d = document.createElement('div')
    d.className = 'msg'
    d.textContent = text
    menu.appendChild(d)
    menu.hidden = false
  }

  const ERRORS = {
    locked: tr('Desbloqueie o cofre no DarkHub.', 'Unlock the vault in DarkHub.'),
    not_paired: tr('Abra a extensão para parear com o DarkHub.', 'Open the extension to pair with DarkHub.'),
    host_unavailable: tr('O DarkHub não está aberto.', 'DarkHub is not running.'),
    app_not_running: tr('O DarkHub não está aberto.', 'DarkHub is not running.'),
    cross_site_frame: tr('Este formulário é de outro site.', 'This form belongs to another site.')
  }
  const GENERIC = tr('Não foi possível falar com o cofre.', 'Could not reach the vault.')

  async function onIconClick(e) {
    if (!e.isTrusted || !anchorEl) return
    e.preventDefault()
    e.stopPropagation()
    const res = await api.runtime.sendMessage({ type: 'cs.query' }).catch(() => null)
    if (!res?.ok) return menuMessage(ERRORS[res?.error] || GENERIC)
    const logins = res.logins || []
    if (!logins.length) return menuMessage(tr('Nenhum login salvo para este site.', 'No saved logins for this site.'))
    const menu = shadow.querySelector('.menu')
    menu.textContent = ''
    menu.appendChild(menuHead())
    for (const l of logins) {
      const b = document.createElement('button')
      b.className = 'item'
      const label = l.username || tr('(sem usuário)', '(no username)')
      const av = document.createElement('span')
      av.className = 'av'
      av.textContent = (l.username || '?').trim().charAt(0).toUpperCase() || '?'
      const who = document.createElement('span')
      who.className = 'who'
      const name = document.createElement('div')
      name.className = 'name'
      name.textContent = label
      who.appendChild(name)
      if (l.match !== 'exact') {
        const sub = document.createElement('div')
        sub.className = 'sub'
        sub.textContent = l.host
        who.appendChild(sub)
      }
      b.append(av, who)
      b.addEventListener('mousedown', (ev) => ev.preventDefault())
      b.addEventListener('click', async (ev) => {
        if (!ev.isTrusted) return
        const target = anchorEl
        const cred = await api.runtime.sendMessage({ type: 'cs.fill', entryId: l.entryId }).catch(() => null)
        if (!cred?.ok) return menuMessage(ERRORS[cred?.error] || GENERIC)
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
