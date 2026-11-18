(function () {
  const canvas = document.getElementById('paths')
  const ctx = canvas.getContext('2d')
  const pinsEl = document.getElementById('pins')
  const counterEl = document.getElementById('counter')
  const hud = document.getElementById('cursorHud')
  const coordText = document.getElementById('coordText')
  const bar = document.getElementById('bar')
  const undoBtn = document.getElementById('undoBtn')
  const cancelBtn = document.getElementById('cancelBtn')
  const doneBtn = document.getElementById('doneBtn')

  const params = new URLSearchParams(window.location.search)
  const originX = Number(params.get('ox')) || 0
  const originY = Number(params.get('oy')) || 0

  let seq = 0
  const points = []
  let hover = null

  function resize() {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    draw()
  }
  window.addEventListener('resize', resize)
  resize()

  function send(msg) {
    document.title = 'dh-points:' + msg
  }

  function updateUi() {
    counterEl.textContent = points.length === 1 ? '1 ponto' : points.length + ' pontos'
    undoBtn.disabled = points.length === 0
    doneBtn.disabled = points.length === 0
    pinsEl.innerHTML = ''
    for (let i = 0; i < points.length; i++) {
      const p = points[i]
      const el = document.createElement('div')
      el.className = 'pin'
      el.style.left = p.vx + 'px'
      el.style.top = p.vy + 'px'
      el.textContent = '#' + (i + 1)
      el.setAttribute('data-coords', Math.round(originX + p.vx) + ', ' + Math.round(originY + p.vy))
      pinsEl.appendChild(el)
    }
    draw()
  }

  function drawCurvedSegment(x1, y1, x2, y2, sign, dashed) {
    const dx = x2 - x1
    const dy = y2 - y1
    const dist = Math.hypot(dx, dy)
    if (dist < 2) return
    const mx = (x1 + x2) / 2
    const my = (y1 + y2) / 2
    const arc = Math.min(34, dist * 0.07) * sign
    const cx = mx + (-dy / dist) * arc
    const cy = my + (dx / dist) * arc

    ctx.beginPath()
    ctx.setLineDash(dashed ? [6, 5] : [])
    ctx.moveTo(x1, y1)
    ctx.quadraticCurveTo(cx, cy, x2, y2)
    ctx.stroke()
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (points.length === 0) return

    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgba(96, 165, 250, 0.85)'
    for (let i = 1; i < points.length; i++) {
      drawCurvedSegment(points[i - 1].vx, points[i - 1].vy, points[i].vx, points[i].vy, i % 2 === 1 ? 1 : -1, false)
    }

    // Linha tracejada fechando o ciclo de volta ao Ponto #1
    if (points.length >= 2) {
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.65)'
      drawCurvedSegment(points[points.length - 1].vx, points[points.length - 1].vy, points[0].vx, points[0].vy, -1, true)
    }

    // Prévia até o cursor atual
    if (hover && points.length >= 1) {
      ctx.strokeStyle = 'rgba(161, 161, 170, 0.45)'
      drawCurvedSegment(points[points.length - 1].vx, points[points.length - 1].vy, hover.x, hover.y, points.length % 2 === 1 ? 1 : -1, true)
    }
  }

  bar.addEventListener('mousedown', function (e) { e.stopPropagation() })
  bar.addEventListener('click', function (e) { e.stopPropagation() })

  undoBtn.addEventListener('click', function () {
    if (points.length === 0) return
    points.pop()
    send('undo:' + (++seq))
    updateUi()
  })

  cancelBtn.addEventListener('click', function () {
    send('cancel')
  })

  doneBtn.addEventListener('click', function () {
    if (points.length === 0) return
    send('done:' + points.length)
  })

  window.addEventListener('mousemove', function (e) {
    hover = { x: e.clientX, y: e.clientY }
    hud.hidden = false
    hud.style.left = Math.min(window.innerWidth - 110, e.clientX + 16) + 'px'
    hud.style.top = Math.min(window.innerHeight - 36, e.clientY + 16) + 'px'
    coordText.textContent = Math.round(originX + e.clientX) + ', ' + Math.round(originY + e.clientY)
    draw()
  })

  window.addEventListener('mousedown', function (e) {
    if (bar.contains(e.target)) return
    if (e.button === 2) {
      e.preventDefault()
      if (points.length > 0) {
        points.pop()
        send('undo:' + (++seq))
        updateUi()
      } else {
        send('cancel')
      }
      return
    }
    if (e.button === 0) {
      points.push({ vx: e.clientX, vy: e.clientY })
      send('add:' + (++seq) + ':' + Math.round(e.clientX) + ':' + Math.round(e.clientY))
      updateUi()
    }
  })

  window.addEventListener('contextmenu', function (e) { e.preventDefault() })

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      send('cancel')
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (points.length > 0) send('done:' + points.length)
      else send('cancel')
    } else if (e.key === 'Backspace' || (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey))) {
      e.preventDefault()
      if (points.length > 0) {
        points.pop()
        send('undo:' + (++seq))
        updateUi()
      }
    }
  })
})()
