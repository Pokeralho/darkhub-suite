// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// @ts-ignore - plain JS module
import { loadLibrary, upsertGame, upsertGamesBulk, updateGame } from '../electron/libraryStore.js'

let dir = ''
const app = { getPath: () => dir }

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-lib-')) })

describe('libraryStore', () => {
  it('saves a new game and keeps edits when only the cover is updated', async () => {
    const { game } = await upsertGame(app, { name: 'Deadlock', exePath: 'C:\\Games\\deadlock.exe' })
    await upsertGame(app, { ...game, name: 'Deadlock (edited)' })
    await updateGame(app, game.id, (g: any) => { g.coverPath = 'local-resource://C:\\covers\\x.jpg' })
    const [saved] = (await loadLibrary(app)).games
    expect(saved.name).toBe('Deadlock (edited)')
    expect(saved.coverPath).toContain('x.jpg')
  })

  it('does not duplicate games imported twice', async () => {
    const games = [{ name: 'A', exePath: 'C:\\Games\\a.exe' }, { name: 'B', exePath: 'C:\\Games\\b.exe' }]
    await upsertGamesBulk(app, games)
    await upsertGamesBulk(app, [{ name: 'A again', exePath: 'c:\\games\\A.exe' }])
    const lib = await loadLibrary(app)
    expect(lib.games.map((g: any) => g.name).sort()).toEqual(['A', 'B'])
  })
})
