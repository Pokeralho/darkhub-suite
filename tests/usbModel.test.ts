// @vitest-environment node
import { describe, it, expect } from 'vitest'
// @ts-ignore - plain JS module
import { parseLocation, buildPorts, canToggle, parseHistory } from '../electron/services/usb/usbModel.js'

const list = [
  { instanceId: 'PCI\\VEN_1022&DEV_15B6\\4&1', name: 'AMD USB 3.10 eXtensible Host Controller', class: 'USB', status: 'OK', location: '', parent: '' },
  { instanceId: 'USB\\ROOT_HUB30\\5&1', name: 'USB Root Hub (USB 3.0)', class: 'USB', status: 'OK', location: '', parent: 'PCI\\VEN_1022&DEV_15B6\\4&1' },
  { instanceId: 'USB\\VID_046D&PID_C539\\6&A', name: 'USB Composite Device', class: 'USB', status: 'OK', location: 'Port_#0006.Hub_#0003', parent: 'USB\\ROOT_HUB30\\5&1' },
  { instanceId: 'USB\\VID_046D&PID_C539&MI_00\\7&B', name: 'Dispositivo de Entrada USB', class: 'HIDClass', status: 'OK', location: '0002.0000', parent: 'USB\\VID_046D&PID_C539\\6&A' },
  { instanceId: 'HID\\VID_046D&PID_C539&MI_00\\8&C', name: 'Mouse compatível com HID', class: 'Mouse', status: 'OK', location: '', parent: 'USB\\VID_046D&PID_C539&MI_00\\7&B' },
  { instanceId: 'USB\\VID_0781&PID_5581\\4C53', name: 'USB Mass Storage Device', class: 'USB', status: 'OK', location: 'Port_#0002.Hub_#0004', parent: 'USB\\ROOT_HUB30\\5&1' },
  { instanceId: 'USBSTOR\\DISK&VEN_SANDISK\\4C53&0', name: 'SanDisk Ultra USB Device', class: 'DiskDrive', status: 'OK', location: '', parent: 'USB\\VID_0781&PID_5581\\4C53' },
  { instanceId: 'USB\\VID_046D&PID_0825\\9', name: 'Logi C270 HD WebCam', class: 'Camera', status: 'OK', location: 'Port_#0001.Hub_#0003', parent: 'USB\\ROOT_HUB30\\5&1' }
]

describe('usbModel', () => {
  it('parses port locations', () => {
    expect(parseLocation('Port_#0006.Hub_#0003')).toEqual({ port: 6, hub: 3 })
    expect(parseLocation('Barramento PCI 7')).toBeNull()
  })

  it('groups devices by port with a useful name and kind', () => {
    const ports = buildPorts(list)
    expect(ports.map((p: any) => [p.hub, p.port, p.kind, p.name])).toEqual([
      [3, 1, 'camera', 'Logi C270 HD WebCam'],
      [3, 6, 'mouse', 'USB Composite Device'],
      // Windows' generic "USB Mass Storage Device" gives way to the drive's own name
      [4, 2, 'storage', 'SanDisk Ultra USB Device']
    ])
    expect(ports[1].children.map((c: any) => c.class)).toEqual(['HIDClass', 'Mouse'])
    expect(ports.every((p: any) => p.enabled)).toBe(true)
    const off = buildPorts(list.map((d) => (d.instanceId.startsWith('USB\\VID_0781') ? { ...d, status: 'Error', problemCode: 22 } : d)))
    expect(off.find((p: any) => p.kind === 'storage').enabled).toBe(false)
  })

  it('never toggles controllers or hubs and flags input devices', () => {
    expect(canToggle({ instanceId: 'PCI\\VEN_1022\\1', name: 'Host Controller' }).ok).toBe(false)
    expect(canToggle({ instanceId: 'USB\\ROOT_HUB30\\5&1', name: 'USB Root Hub' }).ok).toBe(false)
    expect(canToggle({ instanceId: 'USB\\VID_046D&PID_C539\\6&A', kind: 'mouse' })).toEqual({ ok: true, input: true })
    expect(canToggle({ instanceId: 'USB\\VID_0781\\4C53', kind: 'storage' })).toEqual({ ok: true, input: false })
  })

  it('sorts USB history newest first', () => {
    const h = parseHistory([{ instanceId: 'USBSTOR\\A\\1', name: 'Old', lastArrivalAt: 1 }, { instanceId: 'USBSTOR\\B\\2', name: 'New', lastArrivalAt: 5, present: true }])
    expect(h.map((x: any) => x.name)).toEqual(['New', 'Old'])
    expect(h[0].serial).toBe('2')
  })
})
