// Quarantine: a detected file is moved into <root>/<id>.q, XOR-ed with a random per-item key so it can neither run nor
// be picked up again by another scanner, with <id>.json holding where it came from. Restore reverses it exactly.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const ID_RE = /^[0-9a-f]{16}$/

function xorStream(key) {
  let offset = 0
  return new Transform({
    transform(chunk, _enc, done) {
      const out = Buffer.allocUnsafe(chunk.length)
      for (let i = 0; i < chunk.length; i++) out[i] = chunk[i] ^ key[(offset + i) % key.length]
      offset += chunk.length
      done(null, out)
    }
  })
}

async function transcode(src, dest, key) {
  const tmp = `${dest}.part`
  await pipeline(fs.createReadStream(src), xorStream(key), fs.createWriteStream(tmp, { flags: 'wx' }))
  fs.renameSync(tmp, dest)
}

export class Quarantine {
  constructor(root) { this.root = root }

  #paths(id) {
    if (!ID_RE.test(id)) throw new Error('invalid quarantine id')
    return { data: path.join(this.root, `${id}.q`), meta: path.join(this.root, `${id}.json`) }
  }

  /** Moves the file into quarantine. If it cannot be removed (in use), nothing is kept and an error is thrown. */
  async add(file, info = {}) {
    fs.mkdirSync(this.root, { recursive: true })
    const id = crypto.randomBytes(8).toString('hex')
    const key = crypto.randomBytes(32)
    const p = this.#paths(id)
    await transcode(file, p.data, key)
    try {
      fs.unlinkSync(file)
    } catch (e) {
      fs.rmSync(p.data, { force: true })
      throw new Error(`file in use, not quarantined: ${e.code || e.message}`)
    }
    const meta = { id, originalPath: file, key: key.toString('hex'), at: Date.now(), ...info }
    fs.writeFileSync(p.meta, JSON.stringify(meta))
    return this.#public(meta)
  }

  #public(meta) {
    const { key, ...rest } = meta
    return rest
  }

  list() {
    let names = []
    try { names = fs.readdirSync(this.root) } catch { return [] }
    const items = []
    for (const n of names) {
      if (!n.endsWith('.json')) continue
      try { items.push(this.#public(JSON.parse(fs.readFileSync(path.join(this.root, n), 'utf8')))) } catch { /* skip a damaged entry */ }
    }
    return items.sort((a, b) => b.at - a.at)
  }

  /** Restores to the original path, or next to it with a suffix when a file with that name exists again. */
  async restore(id) {
    const p = this.#paths(id)
    const meta = JSON.parse(fs.readFileSync(p.meta, 'utf8'))
    const { dir, name, ext } = path.parse(meta.originalPath)
    let dest = meta.originalPath
    for (let i = 1; fs.existsSync(dest); i++) dest = path.join(dir, `${name} (restored ${i})${ext}`)
    fs.mkdirSync(dir, { recursive: true })
    await transcode(p.data, dest, Buffer.from(meta.key, 'hex'))
    fs.rmSync(p.data, { force: true })
    fs.rmSync(p.meta, { force: true })
    return { restoredTo: dest }
  }

  remove(id) {
    const p = this.#paths(id)
    fs.rmSync(p.data, { force: true })
    fs.rmSync(p.meta, { force: true })
  }
}
