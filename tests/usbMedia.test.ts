// @vitest-environment node
import { describe, it, expect } from 'vitest'
// @ts-ignore - plain JS module
import { parseLine, usableDisks } from '../electron/services/darkos/UsbMediaService.js'

describe('DarkOS USB media', () => {
  it('reads the script protocol and ignores other output', () => {
    expect(parseLine('DKUSB|progress|42|sources\boot.wim')).toEqual({ kind: 'progress', a: '42', b: 'sources\boot.wim' })
    expect(parseLine('DKUSB|step|copy')).toEqual({ kind: 'step', a: 'copy', b: '' })
    expect(parseLine('DKUSB|disk|{"number":2,"name":"SanDisk"}')).toEqual({ kind: 'disk', a: '{"number":2,"name":"SanDisk"}', b: '' })
    expect(parseLine('Deployment Image Servicing and Management tool')).toBeNull()
  })
  it('offers only drives of 8 GB or more', () => {
    const disks = usableDisks([{ number: 3, size: 64e9 }, { number: 2, size: 4e9 }, { number: 1, size: 7.8e9 }, { number: 'x', size: 9e9 }])
    expect(disks.map((d: any) => d.number)).toEqual([1, 3])
  })
})
