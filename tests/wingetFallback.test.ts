// @vitest-environment node
import { describe, it, expect } from 'vitest'
// @ts-ignore - plain JS module
import { wingetOutcome, parseWingetShow, silentInstall, signerMatches, isFetchableUrl, WINGET } from '../electron/services/setup/wingetFallback.js'

describe('post-install hub: when winget fails', () => {
  it('tells the reasons apart', () => {
    expect(wingetOutcome(0, '')).toBe('ok')
    expect(wingetOutcome(WINGET.HASH_MISMATCH, '')).toBe('hash')
    expect(wingetOutcome(17, 'Downloading ...\nInstaller hash does not match.')).toBe('hash')
    expect(wingetOutcome(WINGET.ALREADY_INSTALLED, '')).toBe('installed')
    expect(wingetOutcome(1, 'Found an existing package already installed. No available upgrade found.')).toBe('installed')
    expect(wingetOutcome(1, 'No package found matching input criteria.')).toBe('notFound')
    expect(wingetOutcome(1, 'Failed when searching source: msstore ... 0x8a15003b')).toBe('store')
    expect(wingetOutcome(1603, 'Installer failed with exit code: 1603')).toBe('failed')
  })

  it('reads the official installer from winget show', () => {
    const text = 'Found Google Chrome [Google.Chrome]\nPublisher: Google LLC\nInstaller:\n  Installer Type: wix\n  Installer Url: https://dl.google.com/dl/chrome/install/googlechromestandaloneenterprise64.msi\n'
    expect(parseWingetShow(text)).toEqual({ publisher: 'Google LLC', type: 'wix', url: 'https://dl.google.com/dl/chrome/install/googlechromestandaloneenterprise64.msi' })
  })

  it('knows the silent switch of each installer type', () => {
    expect(silentInstall('wix', 'C:/t/a.msi')).toEqual({ cmd: 'msiexec.exe', args: ['/i', 'C:/t/a.msi', '/qn', '/norestart'] })
    expect(silentInstall('inno', 'a.exe')?.args).toContain('/VERYSILENT')
    expect(silentInstall('nullsoft', 'a.exe')?.args).toEqual(['/S'])
    expect(silentInstall('exe', 'a.exe')).toBeNull()
  })

  it('accepts only a signature of the same publisher', () => {
    const google = 'CN=Google LLC, O=Google LLC, L=Mountain View, S=California, C=US'
    expect(signerMatches(google, 'Google LLC')).toBe(true)
    expect(signerMatches('CN=Zoom Video Communications, Inc., O=Zoom Video Communications, Inc.', 'Zoom Video Communications, Inc.')).toBe(true)
    expect(signerMatches(google, 'Mozilla')).toBe(false)
    expect(signerMatches('CN=Evil Google Mirror Ltd, O=Evil Google Mirror Ltd', 'Google LLC')).toBe(false)
    expect(signerMatches(google, 'Go')).toBe(false)
  })

  it('downloads only over HTTPS from public hosts', () => {
    expect(isFetchableUrl('https://dl.google.com/x.msi')).toBe(true)
    expect(isFetchableUrl('http://dl.google.com/x.msi')).toBe(false)
    expect(isFetchableUrl('https://127.0.0.1/x.msi')).toBe(false)
    expect(isFetchableUrl('not a url')).toBe(false)
  })
})
