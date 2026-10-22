import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Cpu, Fan, HardDrive, LayoutTemplate, MemoryStick, Monitor, Network, Search, Server, Zap } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';

interface LhmSensor { type: string; name: string; value: number; min?: number; max?: number }
interface LhmHardware { kind: string; name: string; sensors: LhmSensor[] }
export interface LhmData { ring0: boolean; admin: boolean; pawnio: boolean; tree: LhmHardware[] }

// LHM SensorType order and display (HWMonitor groups: voltages, temperatures, powers, clocks, utilization, fans...)
const TYPES: Record<string, { label: string; unit: string; digits: number }> = {
  Temperature: { label: 'Temperaturas', unit: '°C', digits: 1 },
  Voltage: { label: 'Tensões', unit: 'V', digits: 3 },
  Current: { label: 'Correntes', unit: 'A', digits: 2 },
  Power: { label: 'Potência', unit: 'W', digits: 1 },
  Energy: { label: 'Energia', unit: 'mWh', digits: 0 },
  Clock: { label: 'Clocks', unit: 'MHz', digits: 0 },
  Frequency: { label: 'Frequências', unit: 'Hz', digits: 0 },
  Load: { label: 'Utilização', unit: '%', digits: 1 },
  Fan: { label: 'Ventoinhas', unit: 'RPM', digits: 0 },
  Control: { label: 'Controle de ventoinhas', unit: '%', digits: 0 },
  Level: { label: 'Níveis', unit: '%', digits: 1 },
  Factor: { label: 'Fatores', unit: '', digits: 2 },
  Data: { label: 'Dados', unit: 'GB', digits: 2 },
  SmallData: { label: 'Memória', unit: 'MB', digits: 0 },
  Throughput: { label: 'Taxa de transferência', unit: 'B/s', digits: 0 },
  TimeSpan: { label: 'Tempo', unit: 's', digits: 0 },
  Noise: { label: 'Ruído', unit: 'dBA', digits: 0 },
  Flow: { label: 'Fluxo', unit: 'L/h', digits: 0 },
  Humidity: { label: 'Umidade', unit: '%', digits: 0 },
  Conductivity: { label: 'Condutividade', unit: 'µS/cm', digits: 1 }
};
const ORDER = Object.keys(TYPES);

const KIND_ICON: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Cpu, Motherboard: LayoutTemplate, SuperIO: Fan, Memory: MemoryStick, Storage: HardDrive, Network, EmbeddedController: Server, Psu: Zap, Battery: Zap
};
const kindIcon = (kind: string) => (/^Gpu/.test(kind) ? Monitor : KIND_ICON[kind] || Server);

function fmt(type: string, v: number | undefined) {
  if (v == null || !Number.isFinite(v)) return '--';
  if (type === 'Throughput') {
    const u = ['B/s', 'KB/s', 'MB/s', 'GB/s']; let i = 0; let x = v;
    while (x >= 1024 && i < u.length - 1) { x /= 1024; i++; }
    return `${x.toFixed(i ? 1 : 0)} ${u[i]}`;
  }
  const d = TYPES[type] || { unit: '', digits: 2 };
  return `${v.toFixed(d.digits)}${d.unit ? (d.unit === '°C' || d.unit === '%' ? '' : ' ') + d.unit : ''}`;
}

/** Every sensor LibreHardwareMonitor reports (HWMonitor-style: hardware → sensor type → value / min / max). */
export default function LhmSensorTree({ lhm }: { lhm: LhmData }) {
  const { t } = useI18n();
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState('');

  const tree = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return lhm.tree.map((hw) => {
      const match = (s: LhmSensor) => !needle || s.name.toLowerCase().includes(needle) || hw.name.toLowerCase().includes(needle);
      const groups = ORDER.concat(Array.from(new Set(hw.sensors.map((s) => s.type))).filter((x) => !TYPES[x]))
        .map((type) => ({ type, items: hw.sensors.filter((s) => s.type === type && match(s)) }))
        .filter((g) => g.items.length);
      return { ...hw, groups, count: groups.reduce((n, g) => n + g.items.length, 0) };
    }).filter((hw) => hw.count);
  }, [lhm.tree, q]);

  const total = lhm.tree.reduce((n, hw) => n + hw.sensors.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="dh-help">{t('monitor.lhm.summary', '{n} sensores de {h} componentes, lidos pelo LibreHardwareMonitor. Mín e máx desde que os sensores foram ligados.').replace('{n}', String(total)).replace('{h}', String(lhm.tree.length))}</p>
        <label className="relative shrink-0">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('monitor.lhm.filter', 'Filtrar sensores')} aria-label={t('monitor.lhm.filter', 'Filtrar sensores')} className="dh-input pl-8 w-full sm:w-56" />
        </label>
      </div>

      {!lhm.ring0 ? (
        <p role="note" className="rounded-lg border border-amber-500/25 bg-amber-500/[0.04] px-4 py-3 text-[12.5px] text-amber-200">
          {lhm.pawnio
            ? t('monitor.lhm.needsAdmin', 'O DarkHub não está rodando como administrador: temperatura, clock, tensão e potência da CPU e os sensores da placa-mãe ficam ocultos, porque sem acesso ao driver o LHM devolve valores fictícios. Abra o DarkHub como administrador.')
            : t('monitor.lhm.needsPawnio', 'Sem o driver PawnIO: temperatura, clock, tensão e potência da CPU e os sensores da placa-mãe ficam ocultos, porque o LHM devolve valores fictícios sem ele.')}
        </p>
      ) : null}

      {tree.map((hw) => {
        const key = `${hw.kind}|${hw.name}`;
        const open = !closed[key];
        const Icon = kindIcon(hw.kind);
        return (
          <section key={key} className="dh-card overflow-hidden">
            <button type="button" onClick={() => setClosed((c) => ({ ...c, [key]: open }))} aria-expanded={open}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-zinc-900/60 transition-colors">
              {open ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
              <Icon size={15} className="text-zinc-400" />
              <span className="text-[13px] font-medium text-zinc-100 truncate">{hw.name}</span>
              <span className="ml-auto text-[11.5px] text-zinc-500 tabular-nums">{hw.count}</span>
            </button>
            {open ? (
              <table className="w-full text-[12.5px] border-t border-zinc-800/80">
                <thead>
                  <tr className="text-[11px] text-zinc-500">
                    <th className="text-left font-normal px-4 py-1.5">{t('monitor.lhm.sensor', 'Sensor')}</th>
                    <th className="text-right font-normal px-3 py-1.5 w-28">{t('monitor.lhm.value', 'Atual')}</th>
                    <th className="text-right font-normal px-3 py-1.5 w-28">{t('monitor.lhm.min', 'Mín')}</th>
                    <th className="text-right font-normal px-4 py-1.5 w-28">{t('monitor.lhm.max', 'Máx')}</th>
                  </tr>
                </thead>
                {hw.groups.map((g) => (
                  <tbody key={g.type}>
                    <tr><td colSpan={4} className="px-4 pt-2.5 pb-1 text-[11.5px] font-medium text-zinc-400">{TYPES[g.type] ? t(`monitor.lhm.type.${g.type}`, TYPES[g.type].label) : g.type}</td></tr>
                    {g.items.map((s, i) => (
                      <tr key={`${s.name}#${i}`} className="hover:bg-zinc-900/50">
                        <td className="px-4 py-1 pl-7 text-zinc-300 truncate max-w-0 w-full">{s.name}</td>
                        <td className="px-3 py-1 text-right font-mono tabular-nums text-zinc-100 whitespace-nowrap">{fmt(g.type, s.value)}</td>
                        <td className="px-3 py-1 text-right font-mono tabular-nums text-zinc-500 whitespace-nowrap">{fmt(g.type, s.min)}</td>
                        <td className="px-4 py-1 text-right font-mono tabular-nums text-zinc-500 whitespace-nowrap">{fmt(g.type, s.max)}</td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            ) : null}
          </section>
        );
      })}
      {tree.length === 0 && q ? <p className="text-[12.5px] text-zinc-500">{t('monitor.lhm.noMatch', 'Nenhum sensor corresponde ao filtro.')}</p> : null}
    </div>
  );
}
