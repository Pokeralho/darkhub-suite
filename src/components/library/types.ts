export type GameProfileTweaks = {
  powerPlanHigh?: boolean
  timerResolution05?: boolean
  processPriorityHigh?: boolean
  disableFullscreenOptimizations?: boolean
  disableMouseAcceleration?: boolean
  gpuHighPerformance?: boolean
  qosForExe?: boolean
  disableNagle?: boolean
  killBackground?: boolean
  dnsCloudflare?: boolean
}

export type GameProfile = {
  id: string
  name: string
  enableUltraOnLaunch?: boolean
  pingHost?: string
  overlayEnabled?: boolean
  shieldEnabled?: boolean
  shieldDeltaMs?: number
  shieldMinMs?: number
  shieldBeep?: boolean
  smartCleanMinutes?: number
  tweaks?: GameProfileTweaks
}

export type OptiScalerConfig = {
  enabled?: boolean
  applyOnLaunch?: boolean
  targetDir?: string
  loader?: string
  upscaler?: string
  inputApi?: string
  includeAgilitySdk?: boolean
}

export type Game = {
  id: string
  name: string
  exePath: string
  args?: string
  workingDir?: string
  coverPath?: string
  tags?: string[]
  profiles?: GameProfile[]
  defaultProfileId?: string
  optiscaler?: OptiScalerConfig
  steamAppId?: number
  playtimeSeconds?: number
  playCount?: number
  lastPlayedAt?: number | null
}

export const defaultProfile = (): GameProfile => ({
  id: 'default',
  name: 'Padrão',
  enableUltraOnLaunch: true,
  pingHost: '1.1.1.1',
  overlayEnabled: false,
  shieldEnabled: false,
  shieldDeltaMs: 30,
  shieldMinMs: 80,
  shieldBeep: false,
  smartCleanMinutes: 10,
  tweaks: {
    powerPlanHigh: true,
    timerResolution05: true,
    processPriorityHigh: true,
    disableFullscreenOptimizations: true,
    disableMouseAcceleration: true,
    gpuHighPerformance: true,
    qosForExe: true,
    disableNagle: true,
    killBackground: true,
    dnsCloudflare: true
  }
})

export const defaultGame = (): Game => ({
  id: '',
  name: '',
  exePath: '',
  args: '',
  workingDir: '',
  coverPath: '',
  tags: [],
  profiles: [defaultProfile()],
  defaultProfileId: 'default',
  optiscaler: { enabled: false, applyOnLaunch: false, loader: 'auto', upscaler: 'auto', inputApi: 'auto' },
  playtimeSeconds: 0,
  playCount: 0,
  lastPlayedAt: null
})
