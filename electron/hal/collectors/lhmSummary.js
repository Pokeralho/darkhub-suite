// Turns one DarkHub.HwSensors sample ({"type":"lhm","pawnio":..,"hw":[{kind,name,s:[[type,name,value]]}]}) into the
// few readings DarkHub shows. CPU and Super I/O values are only trusted with ring 0 (PawnIO, elevated): without it LHM
// returns placeholders (0 W, fixed VID) that must not be shown as real data.
const find = (s, type, re) => s.find(([t, n]) => t === type && re.test(n));

// Without ring 0 (PawnIO + an elevated helper) these CPU readings are placeholders; Load comes from Windows and stays.
const RING0_CPU_TYPES = new Set(['Temperature', 'Power', 'Clock', 'Voltage', 'Current', 'Factor']);

/** Every sensor LHM reports, per hardware, minus the readings that are placeholders without ring 0. */
function buildTree(hwList, ring0) {
  const tree = [];
  for (const hw of hwList) {
    const kind = String(hw.kind || '');
    if (!ring0 && kind === 'SuperIO') continue;
    const sensors = (Array.isArray(hw.s) ? hw.s : [])
      .filter(([t]) => ring0 || kind !== 'Cpu' || !RING0_CPU_TYPES.has(t))
      .map(([type, name, value]) => ({ type: String(type), name: String(name), value: Number(value) }));
    if (sensors.length) tree.push({ kind, name: String(hw.name || kind), sensors });
  }
  return tree;
}

export function summarizeLhm(payload) {
  const hwList = Array.isArray(payload?.hw) ? payload.hw : [];
  const admin = payload?.admin !== false;
  const ring0 = Boolean(payload?.pawnio) && admin;
  const out = { pawnio: Boolean(payload?.pawnio), admin, ring0, cpu: null, cpuCores: [], gpus: [], disks: [], fans: [], voltages: [], tree: buildTree(hwList, ring0) };
  for (const hw of hwList) {
    const s = Array.isArray(hw.s) ? hw.s : [];
    const kind = String(hw.kind || '');
    if (kind === 'Cpu' && ring0) {
      // "Distance to TjMax" sensors are margins, not temperatures; no guessing when no package sensor exists
      const temps = s.filter(([t, n]) => t === 'Temperature' && !/Distance|TjMax/i.test(n));
      const main = find(temps, 'Temperature', /^(Core \(Tctl\/Tdie\)|CPU Package|Core \(Tctl\)|Package)$/);
      const power = find(s, 'Power', /^(Package|CPU Package)$/);
      if (main && main[2] > 0 && main[2] < 125) out.cpu = { name: hw.name, temp: main[2], power: power && power[2] > 0 ? power[2] : null };
      out.cpuCores = temps.filter(([, n, v]) => /^(CPU Core #\d+|Core #\d+|CCD\d+ \(Tdie\)|CCD #\d+)$/.test(n) && v > 0 && v < 125).map(([, n, v]) => ({ name: n, temp: v }));
    } else if (/^Gpu/.test(kind)) {
      const g = (re) => { const x = find(s, 'Temperature', re); return x && x[2] > 0 && x[2] < 125 ? x[2] : null; };
      const power = find(s, 'Power', /^(GPU Package|GPU Power|GPU Core)$/);
      const fan = find(s, 'Fan', /GPU Fan/);
      out.gpus.push({ name: hw.name, temp: g(/^GPU Core$/), hotspot: g(/Hot ?Spot/), memory: g(/^GPU Memory( Junction)?$/), power: power && power[2] > 0 ? power[2] : null, fanRpm: fan ? fan[2] : null });
    } else if (kind === 'Storage') {
      const t = find(s, 'Temperature', /./);
      if (t && t[2] > 0 && t[2] < 100) out.disks.push({ name: hw.name, temp: t[2] });
    } else if (kind === 'SuperIO' && ring0) {
      for (const [t, n, v] of s) {
        if (t === 'Fan' && v > 0) out.fans.push({ name: n, rpm: Math.round(v) });
        else if (t === 'Voltage' && v > 0.1 && v < 30) out.voltages.push({ name: n, v });
      }
    }
  }
  return out;
}
