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

  // Magnifier: the screen pixels around the cursor at 10x, drawn from the lossless backdrop with no smoothing, so the
  // edge of small text can be hit exactly. (The page is file:// so the canvas is write-only: no pixel colour readout.)
  const loupe = document.getElementById('loupe')
  const lcv = document.getElementById('loupeCanvas')
  const linfo = document.getElementById('loupeInfo')
  const lctx = lcv.getContext('2d')
  const CELLS = 15
  const VIEW = 150
  lcv.width = lcv.height = Math.round(VIEW * ratio)
  function drawLoupe(cx, cy) {
    if (!img.naturalWidth) return
    const sx = img.naturalWidth / window.innerWidth
    const sy = img.naturalHeight / window.innerHeight
    const px = Math.min(img.naturalWidth - 1, Math.floor(cx * sx))
    const py = Math.min(img.naturalHeight - 1, Math.floor(cy * sy))
    const half = (CELLS - 1) / 2
    const cell = lcv.width / CELLS
    lctx.imageSmoothingEnabled = false
    lctx.fillStyle = '#000'
    lctx.fillRect(0, 0, lcv.width, lcv.height)
    // clip the source to the image so the edges of the screen still draw
    const x0 = Math.max(0, px - half), y0 = Math.max(0, py - half)
    const x1 = Math.min(img.naturalWidth, px + half + 1), y1 = Math.min(img.naturalHeight, py + half + 1)
    lctx.drawImage(img, x0, y0, x1 - x0, y1 - y0, (x0 - (px - half)) * cell, (y0 - (py - half)) * cell, (x1 - x0) * cell, (y1 - y0) * cell)
    lctx.strokeStyle = 'rgba(255,255,255,0.07)'
    lctx.lineWidth = 1
    lctx.beginPath()
    for (let i = 1; i < CELLS; i++) {
      const v = Math.round(i * cell) + 0.5
      lctx.moveTo(v, 0); lctx.lineTo(v, lcv.height); lctx.moveTo(0, v); lctx.lineTo(lcv.width, v)
    }
    lctx.stroke()
    lctx.strokeStyle = '#8fd3f4'
    lctx.lineWidth = Math.max(1, ratio)
    lctx.strokeRect(half * cell + 0.5, half * cell + 0.5, cell - 1, cell - 1)
    linfo.textContent = 'x ' + px + '  y ' + py + (box && start ? '   ' + Math.round(box.w * ratio) + ' × ' + Math.round(box.h * ratio) : '')
    // beside the cursor, flipped near the right/bottom edges
    const w = loupe.offsetWidth || VIEW + 2, h = loupe.offsetHeight || VIEW + 20
    let lx = cx + 22, ly = cy + 22
    if (lx + w > window.innerWidth - 4) lx = cx - 22 - w
    if (ly + h > window.innerHeight - 4) ly = cy - 22 - h
    loupe.style.transform = 'translate(' + Math.max(4, lx) + 'px,' + Math.max(4, ly) + 'px)'
    loupe.hidden = false
  }

  window.addEventListener('mousedown', (e) => {
    if (e.button === 2) { cancel(); return }
    if (e.button !== 0) return
    start = { x: e.clientX, y: e.clientY }
    draw(start.x, start.y, start.x, start.y)
    drawLoupe(e.clientX, e.clientY)
  })
  window.addEventListener('mousemove', (e) => {
    if (start) draw(start.x, start.y, e.clientX, e.clientY)
    drawLoupe(e.clientX, e.clientY)
  })
  document.addEventListener('mouseleave', () => { loupe.hidden = true })
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
