// Windows components that custom ISOs (DarkOS included) often remove and that are hard to bring back by hand.
// kind: capability (Features on Demand, from Windows Update), feature (optional feature; Windows Update or the ISO's
// sources\sxs), store (Microsoft Store app through winget msstore), special (Microsoft Store itself, winget).
// msstore ids were checked with `winget search/show --source msstore` on 2026-10-24.

export const COMPONENTS = Object.freeze([
  // media
  { id: 'wmp-legacy', group: 'media', kind: 'capability', name: 'Media.WindowsMediaPlayer', label: 'Windows Media Player (clássico)' },
  { id: 'mediaplayback', group: 'media', kind: 'feature', name: 'MediaPlayback', label: 'Recursos de mídia (Media Features)' },
  { id: 'media-player', group: 'media', kind: 'store', storeId: '9WZDNCRFJ3PT', appx: 'Microsoft.ZuneMusic', label: 'Media Player (novo)' },
  { id: 'photos', group: 'media', kind: 'store', storeId: '9WZDNCRFJBH4', appx: 'Microsoft.Windows.Photos', label: 'Fotos' },
  { id: 'camera', group: 'media', kind: 'store', storeId: '9WZDNCRFJBBG', appx: 'Microsoft.WindowsCamera', label: 'Câmera' },
  { id: 'codec-av1', group: 'media', kind: 'store', storeId: '9MVZQVXJBQ9V', appx: 'Microsoft.AV1VideoExtension', label: 'Extensão de vídeo AV1' },
  { id: 'codec-vp9', group: 'media', kind: 'store', storeId: '9N4D0MSMP0PT', appx: 'Microsoft.VP9VideoExtensions', label: 'Extensão de vídeo VP9' },
  { id: 'codec-heif', group: 'media', kind: 'store', storeId: '9PMMSR1CGPWG', appx: 'Microsoft.HEIFImageExtension', label: 'Extensão de imagem HEIF' },
  { id: 'codec-webmedia', group: 'media', kind: 'store', storeId: '9N5TDP8VCMHS', appx: 'Microsoft.WebMediaExtensions', label: 'Extensões de mídia da Web (Ogg, Vorbis, Theora)' },
  { id: 'codec-raw', group: 'media', kind: 'store', storeId: '9NCTDW2W1BH8', appx: 'Microsoft.RawImageExtension', label: 'Extensão de imagem RAW' },
  // everyday apps
  { id: 'calculator', group: 'apps', kind: 'store', storeId: '9WZDNCRFHVN5', appx: 'Microsoft.WindowsCalculator', label: 'Calculadora' },
  { id: 'notepad', group: 'apps', kind: 'store', storeId: '9MSMLRH6LZF3', appx: 'Microsoft.WindowsNotepad', label: 'Bloco de Notas' },
  { id: 'notepad-legacy', group: 'apps', kind: 'capability', name: 'Microsoft.Windows.Notepad.System', label: 'Bloco de Notas clássico (notepad.exe)' },
  { id: 'paint', group: 'apps', kind: 'store', storeId: '9PCFS5B6T72H', appx: 'Microsoft.Paint', label: 'Paint' },
  { id: 'snipping', group: 'apps', kind: 'store', storeId: '9MZ95KL8MR0L', appx: 'Microsoft.ScreenSketch', label: 'Ferramenta de Captura' },
  { id: 'terminal', group: 'apps', kind: 'store', storeId: '9N0DX20HK701', appx: 'Microsoft.WindowsTerminal', label: 'Terminal do Windows' },
  { id: 'clock', group: 'apps', kind: 'store', storeId: '9WZDNCRFJ3PR', appx: 'Microsoft.WindowsAlarms', label: 'Relógio' },
  { id: 'sticky', group: 'apps', kind: 'store', storeId: '9NBLGGH4QGHW', appx: 'Microsoft.MicrosoftStickyNotes', label: 'Notas Autoadesivas' },
  // gaming
  { id: 'xbox', group: 'gaming', kind: 'store', storeId: '9MV0B5HZVK9Z', appx: 'Microsoft.GamingApp', label: 'Xbox' },
  { id: 'gamebar', group: 'gaming', kind: 'store', storeId: '9NZKPSTSNW4P', appx: 'Microsoft.XboxGamingOverlay', label: 'Xbox Game Bar' },
  { id: 'xbox-identity', group: 'gaming', kind: 'store', storeId: '9WZDNCRD1HKW', appx: 'Microsoft.XboxIdentityProvider', label: 'Xbox Identity Provider (login em jogos da Microsoft)' },
  { id: 'directplay', group: 'gaming', kind: 'feature', name: 'DirectPlay', parent: 'LegacyComponents', label: 'DirectPlay (jogos antigos)' },
  // system
  { id: 'store', group: 'system', kind: 'special', special: 'store', appx: 'Microsoft.WindowsStore', label: 'Microsoft Store' },
  { id: 'winget', group: 'system', kind: 'special', special: 'winget', appx: 'Microsoft.DesktopAppInstaller', label: 'Instalador de Aplicativos (winget)' },
  { id: 'netfx3', group: 'system', kind: 'feature', name: 'NetFx3', label: '.NET Framework 3.5 (programas e jogos antigos)', isoSource: true },
  { id: 'print-pdf', group: 'system', kind: 'feature', name: 'Printing-PrintToPDFServices-Features', label: 'Microsoft Print to PDF' },
  { id: 'ps-ise', group: 'system', kind: 'capability', name: 'Microsoft.Windows.PowerShell.ISE', label: 'PowerShell ISE' },
  { id: 'wmic', group: 'system', kind: 'capability', name: 'WMIC', label: 'WMIC (linha de comando WMI)' },
  { id: 'fax-scan', group: 'system', kind: 'capability', name: 'Print.Fax.Scan', label: 'Fax e Scanner do Windows' },
  { id: 'openssh-client', group: 'system', kind: 'capability', name: 'OpenSSH.Client', label: 'Cliente OpenSSH' },
  { id: 'sandbox', group: 'system', kind: 'feature', name: 'Containers-DisposableClientVM', label: 'Área Restrita do Windows (Sandbox)' }
])

/** Official App Installer (winget) release used when winget itself was removed; hashes from the GitHub release. */
export const WINGET_BUNDLE = Object.freeze({
  version: '1.29.380',
  bundle: { url: 'https://github.com/microsoft/winget-cli/releases/download/v1.29.380/Microsoft.DesktopAppInstaller_8wekyb3d8bbwe.msixbundle', sha256: '65dea9c01ce08ee7b763366b27c0e651f97db857c11ca9b9c301826c10092f2e' },
  deps: { url: 'https://github.com/microsoft/winget-cli/releases/download/v1.29.380/DesktopAppInstaller_Dependencies.zip', sha256: 'ba875afe9d190f61218985ac0292a99d1db710bf93e13c68944ca9d89f0d82d1' }
})

export const getComponent = (id) => COMPONENTS.find((c) => c.id === id) || null

/**
 * Status of every component from the raw detection output (pure).
 * raw = { capabilities: [{name, state}], features: {name: state}, appx: [familyName...], winget: bool }
 */
export function componentStatus(raw = {}) {
  const caps = Array.isArray(raw.capabilities) ? raw.capabilities : []
  const features = raw.features && typeof raw.features === 'object' ? raw.features : {}
  const appx = new Set((raw.appx || []).map((a) => String(a).toLowerCase()))
  return COMPONENTS.map((c) => {
    let state = 'unknown'
    let detail = null
    if (c.kind === 'capability') {
      const hit = caps.find((x) => String(x.name).toLowerCase().startsWith(`${c.name.toLowerCase()}~`))
      if (!raw.capabilities) state = 'unknown'
      else if (!hit) state = 'unavailable' // not offered for this Windows build
      else { state = /^installed$/i.test(hit.state) ? 'installed' : /pending/i.test(hit.state) ? 'pending' : 'missing'; detail = hit.name }
    } else if (c.kind === 'feature') {
      const st = features[c.name]
      if (st == null) state = raw.features ? 'unavailable' : 'unknown'
      else state = /^enabled$/i.test(st) ? 'installed' : /pending/i.test(st) ? 'pending' : 'missing'
      if (st && /payloadremoved/i.test(st)) detail = 'payload-removed'
    } else {
      state = raw.appx ? (appx.has(c.appx.toLowerCase()) ? 'installed' : 'missing') : 'unknown'
    }
    return { ...c, state, detail }
  })
}

/** Folder with the .NET 3.5 payload on a mounted ISO or extracted image: X:\sources\sxs. Pure check of the path text. */
/** Friendly text for the DISM/CBS codes seen when Windows cannot find the component files. */
export function restoreErrorText(msg) {
  const m = String(msg || '')
  if (/0x800f0950|0x800f081f|0x800f0906|0x800f0907/i.test(m)) return 'source-missing'
  if (/0x800f0954/i.test(m)) return 'wsus'
  return m
}

export function sxsFromRoot(root) {
  const r = String(root || '').trim().replace(/[\\/]+$/, '')
  if (!r) return null
  if (/[\\/]sources[\\/]sxs$/i.test(r)) return r
  return `${r}\\sources\\sxs`
}
