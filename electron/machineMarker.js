

import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import crypto from 'node:crypto'
import os from 'node:os'
import {
  encryptVaultData,
  decryptVaultData
} from './vaultCrypto.js'

// execFile with argument arrays (no shell): the old `reg add ... /d "${json}"` shell string let
// cmd/reg strip the JSON's inner quotes, so the registry copy never parsed back.
const execFileAsync = promisify(execFile)

const _0x1a2b = 'C:\\ProgramData\\DarkHub'
const _0x3c4d = path.join(_0x1a2b, 'm.dat')
const _0x5e6f = 'Software\\DarkHub\\MM'
const _0x7g8h = 'D4rkH7b_M4ch1n3_1D_v2'

async function _getH() {
  try {
    const n = os.networkInterfaces()
    let m = ''
    Object.keys(n).forEach(k => {
      n[k].forEach(i => {
        if (!i.internal && i.mac && i.mac !== '00:00:00:00:00:00' && !m) m = i.mac
      })
    })
    const c = (os.cpus()[0]?.model || 'x') + os.hostname() + os.platform() + os.arch() + m
    return crypto.createHash('sha512').update(c).digest('hex').slice(0, 48)
  } catch {
    return crypto.createHash('sha512').update(os.hostname() + 'fb').digest('hex').slice(0, 48)
  }
}

async function _mk() {
  try {
    await fs.mkdir(_0x1a2b, { recursive: true })
    if (process.platform === 'win32') {
      await execFileAsync('attrib.exe', ['+s', '+h', _0x1a2b], { windowsHide: true })
    }
  } catch (err) {

  }
}

async function _regW(data) {
  if (process.platform !== 'win32') return false
  try {
    const json = JSON.stringify(data)
    await execFileAsync('reg.exe', ['add', `HKCU\\${_0x5e6f}`, '/v', _0x7g8h, '/t', 'REG_SZ', '/d', json, '/f'], { windowsHide: true })
    return true
  } catch (err) {
    console.warn('[MM] Registry write failed:', err.message)
    return false
  }
}

async function _regR() {
  if (process.platform !== 'win32') return null
  try {
    const { stdout } = await execFileAsync('reg.exe', ['query', `HKCU\\${_0x5e6f}`, '/v', _0x7g8h], { windowsHide: true })
    const match = stdout.match(/REG_SZ\s+(.+)/)
    if (match) return JSON.parse(match[1].trim())
  } catch (err) {

  }
  return null
}

export async function ensureMachineMarker() {
  const hwid = await _getH()
  let existing = await _readMarker()

  if (!existing || existing.h !== hwid) {
    const marker = {
      h: hwid,
      t: Date.now(),
      u: false,
      v: '2.1',
      c: Date.now()
    }
    await _writeMarker(marker)
  }
}

async function _writeMarker(data) {
  try {
    await _mk()

    const encKey = crypto.createHash('sha256').update(data.h + 'D4rkH7b_S3cr3t').digest()
    const encrypted = encryptVaultData(encKey, data)
    await fs.writeFile(_0x3c4d, JSON.stringify(encrypted), 'utf8')

    if (process.platform === 'win32') {
      await execFileAsync('attrib.exe', ['+s', '+h', _0x3c4d], { windowsHide: true })
    }

    await _regW(data)
    return true
  } catch (e) {
    console.error('[MM] Erro ao escrever:', e.message)
    return false
  }
}

async function _readMarker() {
  try {
    const enc = JSON.parse(await fs.readFile(_0x3c4d, 'utf8'))
    const hwid = await _getH()
    const key = crypto.createHash('sha256').update(hwid + 'D4rkH7b_S3cr3t').digest()
    const data = decryptVaultData(key, enc)
    if (data && data.h === hwid) return data
  } catch (err) {

  }

  try {
    const regData = await _regR()
    if (regData && regData.h) {
      const currentH = await _getH()
      if (regData.h === currentH) {
        await _writeMarker(regData)
        return regData
      }
    }
  } catch (err) {

  }

  return null
}
