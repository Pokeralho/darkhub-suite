import React, { useCallback, useEffect, useState } from 'react';
import { Cpu, Fan, Loader2, Zap } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';
import type { HwSensorsStatus, OverlayHw } from '../../global';

interface Props {
  /** metrics.temps.values from the HAL */
  values: any;
  gpuProbe?: any;
}

const api = () => window.darkhub?.hwsensors;

type Rail = NonNullable<NonNullable<NonNullable<OverlayHw['gpu']>['rails']>>[number];
const RAIL_LOW_V = 11.4;
const RAIL_BAD_V = 11.0;

/** Per-connector GPU input power (NVIDIA, NVAPI power monitor): only the rails the card senses; others are not listed. */
function GpuRails() {
  const { t } = useI18n();
  const [hw, setHw] = useState<OverlayHw | null>(null);
  useEffect(() => {
    const ov = window.darkhub?.overlay;
    if (!ov?.power) return undefined;
    const tick = () => { void ov.power().then((r) => { if (r?.ok) setHw(r.hw); }).catch(() => {}); };
    tick();
    const id = setInterval(tick, 1500);
    return () => clearInterval(id);
  }, []);
  const g = hw?.gpu;
  if (!g) return null;
  const name: Record<string, string> = {
    PCIE: t('rails.PCIE', 'Slot PCIe'), '16PIN0': t('rails.16PIN0', 'Cabo 16 pinos (12V-2x6)'), '8PIN0': t('rails.8PIN0', '8 pinos #1'),
    '8PIN1': t('rails.8PIN1', '8 pinos #2'), '6PIN0': t('rails.6PIN0', '6 pinos #1'), '6PIN1': t('rails.6PIN1', '6 pinos #2')
  };
  const reason = g.railsState === 'non_nvidia' ? t('prov.non_nvidia', 'Só em placas NVIDIA') : t('rails.notSensed', 'Esta placa/driver não mede a entrada por conector');
  const rails: Rail[] = g.rails || [];
  const fmt = (x: number | null | undefined, d: number) => (x == null || !Number.isFinite(x) ? null : x.toFixed(d));
  const cellNa = <span className="text-zinc-600" title={t('prov.not_exposed', 'Não exposto por este hardware/driver')}>—</span>;
  return (
    <div className="border-t border-zinc-800/80 pt-3">
      <h3 className="flex items-center gap-1.5 text-[12px] text-zinc-500 mb-2"><Zap size={14} />{t('rails.title', 'Entrada de energia da GPU por conector')}
        {g.railsW != null ? <span className="ml-auto font-mono text-zinc-400" title={t('rails.sumHelp', 'Soma dos conectores medidos (derivado). A diferença para o total da placa é o 3,3 V do slot, que o driver só estima.')}>{g.railsW.toFixed(0)} W*</span> : null}</h3>
      {rails.length ? (
        <table className="w-full text-[12.5px]">
          <thead><tr className="text-[11px] text-zinc-500"><th className="text-left font-normal">{t('rails.connector', 'Conector')}</th><th className="text-right font-normal">W</th><th className="text-right font-normal">V</th><th className="text-right font-normal">A</th></tr></thead>
          <tbody>{rails.map((r) => {
            const low = r.v != null && r.v < RAIL_LOW_V;
            const bad = r.v != null && r.v < RAIL_BAD_V;
            return (
              <tr key={r.id} title={t('rails.source', 'Medido pelo driver NVIDIA (NVAPI)')}>
                <td className="text-zinc-400">{name[r.id] || r.id}</td>
                <td className="text-right font-mono text-zinc-200">{fmt(r.w, 1) ?? cellNa}</td>
                <td className={`text-right font-mono ${bad ? 'text-red-300' : low ? 'text-amber-300' : 'text-zinc-200'}`} title={low ? t('rails.lowV', 'Abaixo de 11,4 V: fora da tolerância ATX de 12 V (±5%). Verifique cabo, conector e fonte.') : undefined}>{fmt(r.v, 3) ?? cellNa}</td>
                <td className="text-right font-mono text-zinc-200">{fmt(r.a, 2) ?? cellNa}</td>
              </tr>
            );
          })}</tbody>
        </table>
      ) : <p className="text-zinc-500 text-[12px]" title={reason}>— {reason}</p>}
    </div>
  );
}

/** Opt-in advanced sensors (LibreHardwareMonitorLib + optional PawnIO driver) and their readings. */
export default function AdvancedSensorsPanel({ values, gpuProbe }: Props) {
  const { t } = useI18n();
  const [st, setSt] = useState<HwSensorsStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => api()?.status().then(setSt).catch(() => {}), []);
  useEffect(() => { refresh(); }, [refresh]);

  // Turning on also installs the PawnIO driver when missing (main process, official release, pinned SHA-256).
  const toggle = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api()!.setEnabled({ enabled: !st?.enabled });
      setSt(r);
      if (r.error) setError(r.error);
      else if (r.reboot) setError(t('monitor.adv.reboot', 'Driver installed. Restart Windows to read the CPU and motherboard sensors.'));
    } finally { setBusy(false); }
  };

  if (!st?.available) return null;
  const cores: { name: string; temp: number }[] = values?.cpuCores || [];
  const fans: { name: string; rpm: number }[] = values?.fans || [];
  const volts: { name: string; v: number }[] = values?.voltages || [];
  // PawnIO answers only an elevated helper: without admin the CPU/motherboard readings are hidden, not "waiting"
  const noAdmin = values?.lhm && values.lhm.admin === false;
  const missing = (ok: string) => (!st.pawnio ? t('monitor.adv.needsPawnio', 'Needs the PawnIO driver.') : noAdmin ? t('monitor.adv.needsAdmin', 'Needs DarkHub running as administrator.') : ok);
  const gpuExtra = gpuProbe && (gpuProbe.hotspot != null || gpuProbe.memoryTemp != null || gpuProbe.powerW != null);

  return (
    <section className="dh-card p-4 space-y-4">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
        <div className="min-w-0 max-w-[75ch]">
          <h2 className="dh-section-title">{t('monitor.adv.title', 'Advanced sensors')}</h2>
          <p className="mt-1 dh-help">{st.enabled
            ? (st.pawnio ? t('monitor.adv.onFull', 'On, with the PawnIO driver: CPU per core, fans and voltages from the motherboard.') : t('monitor.adv.onPartial', 'On without a driver: GPU (core, hot spot, power) and disks. CPU temperature, fans and voltages need the PawnIO driver.'))
            : t('monitor.adv.off2', 'Reads each CPU core real sensor, fans, voltages, GPU and disks (LibreHardwareMonitor + PawnIO). On by default.')}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={toggle} disabled={busy} className={`dh-btn dh-btn-sm ${st.enabled ? '' : 'dh-btn-accent'}`} title={st.enabled ? undefined : t('monitor.adv.pawnioHelp2', 'Also installs the PawnIO driver (signed by its author, compatible with Memory Integrity) when it is missing.')}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            {busy && !st.enabled && !st.pawnio ? t('monitor.adv.installing', 'Installing driver...') : st.enabled ? t('monitor.adv.disable', 'Turn off') : t('monitor.adv.enable', 'Turn on')}
          </button>
        </div>
      </div>
      {error || (st.enabled && st.error) ? <p className="text-[12px] text-red-300">{error || st.error}</p> : null}

      {st.enabled ? (
        <div className="grid gap-4 md:grid-cols-3 text-[12.5px]">
          <div>
            <h3 className="flex items-center gap-1.5 text-[12px] text-zinc-500 mb-2"><Cpu size={14} />{t('monitor.adv.cores', 'CPU cores')}{values?.cpuPowerW ? <span className="ml-auto font-mono text-zinc-400">{values.cpuPowerW.toFixed(0)} W</span> : null}</h3>
            {cores.length ? (
              <ul className="space-y-1">{cores.map((c) => (
                <li key={c.name} className="flex justify-between"><span className="text-zinc-400">{c.name}</span><span className="font-mono text-zinc-200">{c.temp.toFixed(1)}<span className="text-zinc-500">°C</span></span></li>
              ))}</ul>
            ) : <p className="text-zinc-500">{missing(t('monitor.adv.waiting', 'Waiting for the first reading.'))}</p>}
            {gpuExtra ? (
              <ul className="mt-3 space-y-1 border-t border-zinc-800/80 pt-2">
                {gpuProbe.hotspot != null ? <li className="flex justify-between"><span className="text-zinc-400">{t('monitor.adv.hotspot', 'GPU hot spot')}</span><span className="font-mono text-zinc-200">{gpuProbe.hotspot.toFixed(1)}<span className="text-zinc-500">°C</span></span></li> : null}
                {gpuProbe.memoryTemp != null ? <li className="flex justify-between"><span className="text-zinc-400">{t('monitor.adv.vram', 'GPU memory')}</span><span className="font-mono text-zinc-200">{gpuProbe.memoryTemp.toFixed(1)}<span className="text-zinc-500">°C</span></span></li> : null}
                {gpuProbe.powerW != null ? <li className="flex justify-between"><span className="text-zinc-400">{t('monitor.adv.gpuPower', 'GPU power')}</span><span className="font-mono text-zinc-200">{gpuProbe.powerW.toFixed(0)}<span className="text-zinc-500"> W</span></span></li> : null}
              </ul>
            ) : null}
          </div>
          <div>
            <h3 className="flex items-center gap-1.5 text-[12px] text-zinc-500 mb-2"><Fan size={14} />{t('monitor.adv.fans', 'Fans')}</h3>
            {fans.length ? (
              <ul className="space-y-1">{fans.map((f) => (
                <li key={f.name} className="flex justify-between"><span className="text-zinc-400">{f.name}</span><span className="font-mono text-zinc-200">{f.rpm.toLocaleString()}<span className="text-zinc-500"> RPM</span></span></li>
              ))}</ul>
            ) : <p className="text-zinc-500">{missing(t('monitor.adv.noFans', 'No fan reported by the motherboard chip.'))}</p>}
          </div>
          <div>
            <h3 className="flex items-center gap-1.5 text-[12px] text-zinc-500 mb-2"><Zap size={14} />{t('monitor.adv.volts', 'Voltages')}</h3>
            {volts.length ? (
              <ul className="space-y-1 max-h-48 overflow-y-auto pr-1">{volts.map((v) => (
                <li key={v.name} className="flex justify-between"><span className="text-zinc-400">{v.name}</span><span className="font-mono text-zinc-200">{v.v.toFixed(3)}<span className="text-zinc-500"> V</span></span></li>
              ))}</ul>
            ) : <p className="text-zinc-500">{missing(t('monitor.adv.noVolts', 'No voltage reported by the motherboard chip.'))}</p>}
          </div>
        </div>
      ) : null}
      {st.enabled ? <GpuRails /> : null}
    </section>
  );
}
