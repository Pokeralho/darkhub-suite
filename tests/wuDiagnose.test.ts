// @vitest-environment node
import { describe, it, expect } from 'vitest'
// @ts-ignore - plain JS module
import { wuFindings, ipInRange } from '../electron/services/optimizer/wuDiagnose.js'

const healthy = {
  services: { wuauserv: { exists: true, start: 3 }, bits: { exists: true, start: 3 }, cryptsvc: { exists: true, start: 2 }, dosvc: { exists: true, start: 2 } },
  policies: { disableAccess: 0, noInternet: 0, wsus: false },
  hosts: [],
  net: [
    { host: 'fe3cr.delivery.mp.microsoft.com', port: 443, dns: true, ips: ['135.232.92.97'], tcp: true },
    { host: 'download.windowsupdate.com', port: 80, dns: true, ips: ['193.36.180.61'], tcp: true }
  ],
  proxy: '', clockSkewMin: 0, freeGb: 90, firewallBlocks: [], darkhubBlocklist: [],
  cache: { softwareDistribution: true, catroot2: true }
}
const ids = (raw: any) => wuFindings(raw).map((f: any) => f.id)

describe('Windows Update diagnosis', () => {
  it('a healthy PC has nothing to report', () => {
    expect(wuFindings(healthy)).toEqual([])
  })

  it('names disabled services, blocking policies and hosts redirects', () => {
    const raw = { ...healthy, services: { ...healthy.services, bits: { exists: true, start: 4 } }, policies: { disableAccess: 1, noInternet: 1 }, hosts: ['0.0.0.0 download.windowsupdate.com'] }
    expect(ids(raw)).toEqual(['servicesDisabled', 'policyAccess', 'policyInternet', 'hosts'])
    expect(wuFindings(raw)[0].data.services).toBe('bits')
  })

  it('tells a blocking DNS apart from no DNS and from blocked ports', () => {
    const sink = { ...healthy, net: [{ ...healthy.net[0], ips: ['0.0.0.0'] }, healthy.net[1]] }
    expect(ids(sink)).toEqual(['dnsBlocked'])
    expect(ids({ ...healthy, net: healthy.net.map((n) => ({ ...n, dns: false, ips: [], tcp: false })) })).toEqual(['noDns'])
    expect(ids({ ...healthy, net: [healthy.net[0], { ...healthy.net[1], tcp: false }] })).toEqual(['blockedPorts'])
  })

  it("puts DarkHub's own IP blocklist first when it catches a Windows Update server", () => {
    const raw = { ...healthy, net: [healthy.net[0], { ...healthy.net[1], tcp: false }], darkhubBlocklist: ['10.0.0.0/8', '193.36.180.0/255.255.255.0'] }
    const f = wuFindings(raw)
    expect(f[0]).toMatchObject({ id: 'darkhubBlocklist', data: { hosts: 'download.windowsupdate.com' } })
  })

  it('warns about a proxy, a wrong clock and low disk space', () => {
    expect(ids({ ...healthy, proxy: '10.1.1.1:8080', clockSkewMin: -42, freeGb: 2.1 })).toEqual(['proxy', 'clock', 'space'])
  })

  it('matches firewall address formats', () => {
    expect(ipInRange('193.36.180.61', '193.36.180.0/24')).toBe(true)
    expect(ipInRange('193.36.180.61', '193.36.180.0/255.255.255.0')).toBe(true)
    expect(ipInRange('193.36.181.1', '193.36.180.0/24')).toBe(false)
    expect(ipInRange('10.0.0.5', '10.0.0.1-10.0.0.9')).toBe(true)
    expect(ipInRange('8.8.8.8', '8.8.8.8')).toBe(true)
    expect(ipInRange('2001:db8::1', '2001:db8::/32')).toBe(false)
  })
})
