// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { sameGpu, pairGpus, pickPrimaryGpu, primaryGpuIndex } from '../electron/hal/models/gpuMatch.js';
// @ts-ignore plain JS module
import { readSensors } from '../electron/services/overlay/overlayModel.js';
// @ts-ignore plain JS module
import { sampleGpu } from '../electron/services/gpubench/gpuBenchModel.js';
// @ts-ignore plain JS module
import { readLhm } from '../electron/services/overlay/lhmModel.js';

const s = (value: number | null) => ({ value });
const igpu = { name: 'Intel(R) UHD Graphics 770', utilization: s(40), vramTotal: s(128), temperature: s(null) };
const dgpu = { name: 'NVIDIA GeForce RTX 4070', utilization: s(5), vramTotal: s(12282), temperature: s(55) };
const amd = { name: 'AMD Radeon RX 7800 XT', utilization: s(10), vramTotal: s(16368) };

describe('GPU name matching', () => {
  it('never pairs a card with its Ti/Super/XT sibling', () => {
    expect(sameGpu('NVIDIA GeForce RTX 4060', 'NVIDIA GeForce RTX 4060 Ti')).toBe(false);
    expect(sameGpu('RTX 4070', 'NVIDIA GeForce RTX 4070 SUPER')).toBe(false);
    expect(sameGpu('AMD Radeon RX 7900 XT', 'Radeon RX 7900 XTX')).toBe(false);
    expect(sameGpu('NVIDIA GeForce RTX 4060 Laptop GPU', 'NVIDIA GeForce RTX 4060 Laptop GPU')).toBe(true);
    expect(sameGpu('GeForce RTX 3080', 'NVIDIA GeForce RTX 3080 Laptop GPU')).toBe(true);
    expect(sameGpu('', 'anything')).toBe(false);
  });

  it('pairs exact names first and never reuses a row (two identical cards)', () => {
    expect(pairGpus(['RTX 4060', 'RTX 4060 Ti'], ['NVIDIA GeForce RTX 4060 Ti', 'NVIDIA GeForce RTX 4060'])).toEqual([1, 0]);
    expect(pairGpus(['NVIDIA GeForce RTX 3090', 'NVIDIA GeForce RTX 3090'], ['NVIDIA GeForce RTX 3090', 'NVIDIA GeForce RTX 3090'])).toEqual([0, 1]);
    expect(pairGpus(['Intel UHD 770', 'NVIDIA GeForce RTX 4070'], ['NVIDIA GeForce RTX 4070'])).toEqual([-1, 0]);
  });
});

describe('primary GPU', () => {
  it('prefers the discrete card over a busier iGPU listed first', () => {
    expect(pickPrimaryGpu([igpu, dgpu])).toBe(dgpu);
    expect(pickPrimaryGpu([igpu, amd])).toBe(amd);
    expect(pickPrimaryGpu([amd, dgpu])).toBe(dgpu);
    expect(pickPrimaryGpu([{ name: 'Microsoft Basic Display Adapter', vramTotal: s(0) }, igpu])).toBe(igpu);
    expect(primaryGpuIndex([])).toBe(-1);
    expect(pickPrimaryGpu(undefined)).toBeNull();
  });

  it('uses the adapter the benchmark runs on when named', () => {
    expect(primaryGpuIndex([igpu, dgpu], { preferName: 'Intel(R) UHD Graphics 770' })).toBe(0);
    const snap = { gpu: { values: { gpus: [igpu, dgpu] } } };
    expect(sampleGpu(snap, 1).load).toBe(5);
    expect(sampleGpu(snap, 1, 'Intel(R) UHD Graphics 770').load).toBe(40);
    expect(readSensors(snap)).toMatchObject({ gpu: 5, gpuTemp: 55 });
  });

  it('LHM: reads the NVIDIA card and keeps single-device NVML off an iGPU', () => {
    const hw = (kind: string, name: string) => ({ kind, name, s: [['Load', 'GPU Core', kind === 'GpuNvidia' ? 7 : 50]] });
    const out = readLhm({ type: 'lhm', hw: [hw('GpuIntel', 'Intel UHD 770'), hw('GpuNvidia', 'NVIDIA GeForce RTX 4070')], nvml: [{ name: 'NVIDIA GeForce RTX 4070 (other name)', powerMw: 120000 }] });
    expect(out.gpu.name).toBe('NVIDIA GeForce RTX 4070');
    expect(out.gpu.load).toBe(7);
    expect(out.nvml?.powerW).toBe(120);
    const amdOnly = readLhm({ type: 'lhm', hw: [hw('GpuAmd', 'AMD Radeon RX 7800 XT')], nvml: [{ name: 'NVIDIA GeForce RTX 4070', powerMw: 120000 }] });
    expect(amdOnly.nvml).toBeUndefined();
  });
});

describe('DeepHardwareService WMI pairing', () => {
  it('an unidentified adapter (empty name) gets no row; subsystem id and exact names win', async () => {
    // @ts-ignore plain JS module
    const { pairWmiRows } = await import('../electron/services/DeepHardwareService.js');
    const rows = [
      { Name: 'Microsoft Basic Display Adapter', PNPDeviceID: 'PCI/VEN_10DE&DEV_2786&SUBSYS_00000000' },
      { Name: 'NVIDIA GeForce RTX 4060 Ti', PNPDeviceID: 'PCI/VEN_10DE&DEV_2803&SUBSYS_12345678' },
      { Name: 'NVIDIA GeForce RTX 4060', PNPDeviceID: 'PCI/VEN_10DE&DEV_2882&SUBSYS_87654321' }
    ];
    expect(pairWmiRows([{ model: '' }, { model: 'NVIDIA GeForce RTX 4060' }], rows)).toEqual([-1, 2]);
    expect(pairWmiRows([{ model: 'NVIDIA GeForce RTX 4060', subDeviceId: '87654321' }, { model: 'NVIDIA GeForce RTX 4060 Ti' }], rows)).toEqual([2, 1]);
  });
});
