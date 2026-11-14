// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// @ts-ignore - plain JS module
import { resolveTemplate, nameKey, matchGames, expandGlob, staticPrefix } from '../electron/services/saves/savePaths.js'

const env = { home: 'C:\\Users\\Ana', appData: 'C:\\Users\\Ana\\AppData\\Roaming', localAppData: 'C:\\Users\\Ana\\AppData\\Local', documents: 'C:\\Users\\Ana\\Documents', base: 'D:\\Games\\Hades', storeUserId: '*' }

describe('savePaths', () => {
  it('resolves manifest placeholders and rejects unknown ones', () => {
    expect(resolveTemplate('<winAppData>/Supergiant Games/Hades', env)).toBe('C:\\Users\\Ana\\AppData\\Roaming\\Supergiant Games\\Hades')
    expect(resolveTemplate('<base>/Saves/*.sav', env)).toBe('D:\\Games\\Hades\\Saves\\*.sav')
    expect(resolveTemplate('<winPublic>/x', env)).toBeNull()
    expect(resolveTemplate('<xdgData>/x', env)).toBeNull()
  })

  it('matches games by Steam id, folder and name', () => {
    const index = [
      { name: 'Hades', steamId: 1145360, installDirs: ['Hades'] },
      { name: 'Hollow Knight', installDirs: ['Hollow Knight'] },
      { name: 'Celeste' }
    ]
    const r = matchGames(index, [
      { name: 'HADES (Steam)', appId: '1145360' },
      { name: 'HK', installDir: 'E:\\Games\\Hollow Knight' },
      { name: 'Céleste' },
      { name: 'Unknown Game' }
    ])
    expect(r.map((x: any) => x.entry.name)).toEqual(['Hades', 'Hollow Knight', 'Celeste'])
    expect(nameKey('Hollow Knight™: Silksong')).toBe('hollowknightsilksong')
  })

  it('expands * and ** patterns on disk', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-glob-'))
    fs.mkdirSync(path.join(root, 'Saves', 'slot1'), { recursive: true })
    fs.writeFileSync(path.join(root, 'Saves', 'a.sav'), 'a')
    fs.writeFileSync(path.join(root, 'Saves', 'b.txt'), 'b')
    fs.writeFileSync(path.join(root, 'Saves', 'slot1', 'c.sav'), 'c')
    const rel = (xs: string[]) => xs.map((x) => path.relative(root, x).split(path.sep).join('/')).sort()
    const pat = (...xs: string[]) => [root, ...xs].join('/')
    expect(rel(expandGlob(pat('Saves', '*.sav')))).toEqual(['Saves/a.sav'])
    expect(rel(expandGlob(pat('Saves', '**', '*.sav')))).toEqual(['Saves/a.sav', 'Saves/slot1/c.sav'])
    expect(rel(expandGlob(pat('Saves')))).toEqual(['Saves/a.sav', 'Saves/b.txt', 'Saves/slot1/c.sav'])
    expect(staticPrefix(pat('Saves', '**', '*.sav')).split(path.sep).join('/')).toBe(pat('Saves'))
    fs.rmSync(root, { recursive: true, force: true })
  })
})
