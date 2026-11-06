// Power / efficiency / PSU / cost strings (System Monitor panel, overlay settings, overlay editor metric names).
// The screens carry pt-BR inline defaults; pt-BR here covers the metric names that come from the main process.
// Merged into `messages` (see messages.ts).
const METRIC_PT: Record<string, string> = {
  renderLatency: 'Latência de render', 'session.renderMin': 'Latência de render mín.', 'session.renderAvg': 'Latência de render média', 'session.renderMax': 'Latência de render máx.',
  'gpu.vramPct': 'VRAM %', 'gpu.bus': 'Carga do barramento da GPU', 'gpu.videoEngine': 'Motor de vídeo', 'gpu.encoder': 'Codificador (NVENC)', 'gpu.decoder': 'Decodificador (NVDEC)',
  'gpu.pcie': 'Link PCIe', 'gpu.pcieRx': 'PCIe recebendo', 'gpu.pcieTx': 'PCIe enviando', 'gpu.d3dShared': 'Memória compartilhada da GPU', 'gpu.powerLimit': 'Limite de potência',
  'gpu.energy': 'Energia da GPU (sessão)', 'gpu.throttle': 'Limitadores de clock',
  'ram.rate': 'Taxa da RAM (SMBIOS)', 'ram.base': 'Clock base da RAM (SMBIOS)',
  'pwr.fpsPerWatt': 'FPS por watt', 'pwr.fpsPerWattAvg': 'FPS por watt (média)', 'pwr.jpf': 'Energia por quadro', 'pwr.jpfAvg': 'Energia por quadro (média)',
  'psu.load': 'Carga da fonte', 'psu.eff': 'Eficiência da fonte', 'psu.dc': 'Total do PC (DC)', 'psu.ac': 'PC na tomada (AC)'
};
const SCEN_PT: Record<string, string> = { gpu: 'GPU', cpuGpu: 'CPU+GPU', withExtra: 'CPU+GPU+adicionais' };
const PER_PT: Record<string, string> = { hour: 'por hora', day: 'por dia', month: 'por mês', year: 'por ano' };
for (const [scen, name] of Object.entries(SCEN_PT)) {
  for (const [per, label] of Object.entries(PER_PT)) METRIC_PT[`cost.${scen}.${per}`] = `Custo ${name} ${label}`;
  METRIC_PT[`cost.${scen}.kwhDay`] = `${name} kWh por dia`;
  METRIC_PT[`cost.${scen}.kwhMonth`] = `${name} kWh por mês`;
}
const prefixed = (o: Record<string, string>, p: string) => Object.fromEntries(Object.entries(o).map(([k, v]) => [`${p}${k}`, v]));

export const powerMessages: Record<'pt-BR' | 'en-US', Record<string, string>> = {
  'pt-BR': {
    ...prefixed(METRIC_PT, 'ovle.m.'),
    'ovle.group.power': 'Consumo e fonte*', 'ovle.group.cost': 'Custo de energia*'
  },
  'en-US': {
    'ovle.group.power': 'Power & PSU*', 'ovle.group.cost': 'Energy cost*',
    'pwr.title': 'Power, efficiency and cost',
    'pwr.waiting': 'Waiting for the advanced sensors. Turn them on in the temperatures tab.',
    'pwr.help': 'Direct GPU, CPU and RAM readings, plus PSU and cost estimates. Anything with * is estimated or derived; what the card or driver does not expose shows as — (never zero).',
    'pwr.reset': 'Reset energy', 'pwr.resetHelp': 'Zeroes the accumulated energy (kJ) and the session averages',
    'pwr.usage': 'Usage', 'pwr.temp': 'Temperature', 'pwr.hotspot': 'Hot spot', 'pwr.vramJunction': 'VRAM hot spot (junction)', 'pwr.voltage': 'Core voltage', 'pwr.clock': 'Clock',
    'pwr.fan': 'Fan', 'pwr.vram': 'VRAM', 'pwr.vramClock': 'VRAM clock', 'pwr.memCtrl': 'Memory controller', 'pwr.sharedMem': 'Shared memory (D3D)',
    'pwr.computeMem': 'Compute memory', 'pwr.computeMemWhy': 'On Windows (WDDM) the NVIDIA driver does not report per-process memory',
    'pwr.unavailable': 'This card/driver does not expose this value',
    'pwr.gpuPower': 'GPU: energy and bus', 'pwr.boardPower': 'Total board power', 'pwr.powerLimit': 'Power limit', 'pwr.powerPct': '% of TDP', 'pwr.energy': 'Accumulated energy',
    'pwr.energyNvml': 'NVIDIA driver energy counter', 'pwr.energyInt': 'Power integrated over time', 'pwr.pcie': 'PCIe', 'pwr.max': 'max',
    'pwr.pcieRx': 'PCIe receiving', 'pwr.pcieTx': 'PCIe sending', 'pwr.bus': 'Bus load', 'pwr.videoEngine': 'Video engine', 'pwr.encDec': 'Encoder / decoder',
    'pwr.limiters': 'Clock limiters', 'pwr.none': 'none', 'pwr.slotRails': 'PCIe slot and 16-pin cable (V/A)', 'pwr.asic': 'ASIC quality / speedo',
    'pwr.needsAdmin': 'needs admin', 'pwr.needsPawnio': 'needs the PawnIO driver', 'pwr.power': 'Power',
    'pwr.ramUse': 'In use', 'pwr.ramRate': 'Effective rate', 'pwr.ramBase': 'Base clock', 'pwr.smbios': 'Read from SMBIOS (firmware), not a live counter',
    'pwr.eff': 'Efficiency (needs a measured game)', 'pwr.fpsPerWattAvg': 'Average FPS/W', 'pwr.jpfAvg': 'Average J / frame',
    'pwr.psu': 'PSU and PC total', 'pwr.psuLoad': 'PSU load', 'pwr.psuEff': 'PSU efficiency', 'pwr.gpuCpu': 'GPU + CPU', 'pwr.extra': 'Additional components', 'pwr.dc': 'PC total (DC)', 'pwr.ac': 'From the wall (AC)',
    'pwr.partial': 'Total without the reading of',
    'pwr.cost': 'Energy cost', 'pwr.day': 'day', 'pwr.scenario': 'Scenario', 'pwr.hour': 'Hour', 'pwr.dayCol': 'Day', 'pwr.month': 'Month', 'pwr.year': 'Year', 'pwr.monthShort': 'month',
    'pwr.withExtra': 'CPU+GPU+additional', 'pwr.wall': 'Wall (AC)',
    'pwr.settings': 'PSU, additional components and tariff',
    'pwr.psuWatts': 'PSU wattage', 'pwr.psuRating': '80 Plus rating', 'pwr.custom': 'Custom curve', 'pwr.extraWatts': 'Additional components', 'pwr.tariff': 'Tariff', 'pwr.hoursPerDay': 'Hours of use per day',
    'pwr.curve': 'PSU efficiency at a load of',
    'pwr.settingsHelp': 'PSU efficiency comes from the 80 Plus certification points (10, 20, 50 and 100% load) with interpolation; below 20% it is an approximation. Additional components (motherboard, SSDs, fans, RAM) are a number you enter. Everything marked * is an estimate.',
    'pwr.overlayTitle': 'PSU, power and cost (estimates*)',
    'pwr.overlayHelp': 'The Overclocker layout shows FPS/W, J/frame, PSU load and efficiency, PC total and energy cost. Enter your PSU and tariff so the numbers make sense. The same values appear in System Monitor, Sensors tab.',
    'pwr.renderLatency': 'Render latency', 'pwr.energyGpu': 'GPU energy', 'pwr.estimate': 'estimate', 'pwr.frameShort': 'frame', 'pwr.effShort': 'eff', 'pwr.withExtraShort': '+extra',
    'pwr.partialShort': 'without', 'pwr.busShort': 'bus', 'pwr.videoShort': 'video',
    'pwr.throttle.swPowerCap': 'power limit', 'pwr.throttle.hwSlowdown': 'hardware slowdown', 'pwr.throttle.swThermal': 'thermal limit', 'pwr.throttle.hwThermal': 'thermal slowdown (HW)',
    'pwr.throttle.hwPowerBrake': 'power brake', 'pwr.throttle.boardLimit': 'board limit', 'pwr.throttle.reliability': 'reliability', 'pwr.throttle.syncBoost': 'sync boost', 'pwr.throttle.displayClock': 'display clock'
  }
};
