// Screenshot the renderer at real desktop resolution, using the project's own Electron (no Chrome download).
//   npm run shot -- home optimizer dashboard        -> scratch/shots/<page>.png  (needs `npm run dev` running)
//   SHOT_SIZE=1600x900 npm run shot -- home
// The renderer runs without the preload bridge, so screens show their "no backend" state; good for layout review.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const pages = process.argv.slice(2).filter((a) => !a.startsWith('-') && !a.endsWith('.cjs') && a !== '.')
const [w, h] = (process.env.SHOT_SIZE || '1366x820').split('x').map(Number)
const outDir = path.resolve(__dirname, '..', 'scratch', 'shots')

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  fs.mkdirSync(outDir, { recursive: true })
  const win = new BrowserWindow({ width: w, height: h, show: false, frame: false, webPreferences: { offscreen: true } })
  for (const page of pages.length ? pages : ['home']) {
    await win.loadURL(`http://localhost:5173/#${page}`)
    await new Promise((r) => setTimeout(r, Number(process.env.SHOT_DELAY || 1800)))
    const img = await win.webContents.capturePage()
    const file = path.join(outDir, `${page}.png`)
    fs.writeFileSync(file, img.toPNG())
    console.log(file)
  }
  app.quit()
})
