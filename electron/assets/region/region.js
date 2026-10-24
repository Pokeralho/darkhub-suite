// Region selection over the frozen screen. Reports through document.title (see RegionPicker.js); no Node access.
(function () {
  const img = document.getElementById('shot')
  const shade = document.getElementById('shade')
  const sel = document.getElementById('sel')
  const dim = document.getElementById('dim')
  const hint = document.getElementById('hint')
  const src = new URLSearchParams(location.search).get('img') || ''
  if (src.startsWith('file:')) img.src = src
  if (!/^pt/i.test(navigator.language || '')) hint.textContent = 'Drag to select an area · click or Enter for the whole screen · Esc cancels'

  const report = (v) => { document.title = 'dh-region:' + v }
  const cancel = () => report('cancel')
  const ratio = window.devicePixelRatio || 1
  let start = null
  let box = null

  function draw(x0, y0, x1, y1) {
    const x = Math.min(x0, x1), y = Math.min(y0, y1), w = Math.abs(x1 - x0), h = Math.abs(y1 - y0)
    box = { x, y, w, h }
    sel.hidden = false
    shade.classList.add('off')
    hint.classList.add('hide')
    sel.style.left = x + 'px'; sel.style.top = y + 'px'; sel.style.width = w + 'px'; sel.style.height = h + 'px'
    dim.textContent = Math.round(w * ratio) + ' × ' + Math.round(h * ratio)
    dim.classList.toggle('inside', y < 26)
  }

  window.addEventListener('mousedown', (e) => {
    if (e.button === 2) { cancel(); return }
    if (e.button !== 0) return
    start = { x: e.clientX, y: e.clientY }
    draw(start.x, start.y, start.x, start.y)
  })
  window.addEventListener('mousemove', (e) => { if (start) draw(start.x, start.y, e.clientX, e.clientY) })
  window.addEventListener('mouseup', (e) => {
    if (e.button !== 0 || !start) return
    start = null
    if (!box || box.w < 3 || box.h < 3) { report('full'); return } // a click, not a drag: the whole screen
    report([box.x, box.y, box.w, box.h, window.innerWidth, window.innerHeight].map((n) => Math.round(n * 100) / 100).join(','))
  })
  window.addEventListener('contextmenu', (e) => { e.preventDefault(); cancel() })
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); cancel() }
    else if (e.key === 'Enter') { e.preventDefault(); report('full') }
  })
})()
