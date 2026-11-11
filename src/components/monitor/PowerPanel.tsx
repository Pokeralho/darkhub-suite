import React, { useCallback, useEffect, useState } from 'react';
import { Zap, RefreshCw } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';
import type { OverlayPower, OverlaySettings, OverlayCost, OverlayHw } from '../../global';
import PsuCatalogPicker from './PsuCatalogPicker';
import WallCalibration from './WallCalibration';

const api = () => window.darkhub?.overlay;
const f = (x: number | null | undefined, d = 0) => (x == null || !Number.isFinite(x) ? null : x.toFixed(d));

/** One labelled value. `est` = an estimate or a value derived from firmware/user input (shown with *). Null = not available: shows a dash. */
function Row({ label, value, unit, est, title }: { label: string; value: string | null | undefined; unit?: string; est?: boolean; title?: string }) {
  return (
    <li className="flex justify-between gap-3" title={title}>
      <span className="text-zinc-400">{label}{est ? <span className="text-amber-300/80">*</span> : null}</span>
      <span className="font-mono text-zinc-200 text-right">{value ?? <span className="text-zinc-600">—</span>}{value != null && unit ? <span className="text-zinc-500"> {unit}</span> : null}</span>
    </li>
  );
}

function Block({ title, children, icon }: { title: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-[12px] text-zinc-500 mb-2">{icon}{title}</h3>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

/** A 12 V input below this is outside the ATX tolerance (12 V -5 %). Rails under 6 V are not 12 V rails. */
export const RAIL_LOW_V = 11.4;
const isLowRail = (v: number | null | undefined) => v != null && v >= 6 && v < RAIL_LOW_V;

/** GPU input power per connector (NVAPI power monitor): measured, so no *. Not sensed: a dash and why. */
export function RailRows({ gpu }: { gpu: OverlayHw['gpu'] | null | undefined }) {
  const { t } = useI18n();
  const dash = <span className="text-zinc-600">—</span>;
  const val = (x: number | null | undefined, d: number, unit: string, cls = '') => (x == null || !Number.isFinite(x) ? dash : <span className={cls}>{x.toFixed(d)}<span className="text-zinc-500"> {unit}</span></span>);
  const rails = gpu?.railsState === 'ok' && gpu.rails?.length ? gpu.rails : null;
  if (!rails) {
    const why = gpu?.railsState === 'non_nvidia' ? t('prov.non_nvidia', 'só em placas NVIDIA') : t('rails.notSensed', 'Esta placa/driver não mede a entrada por conector');
    return (
      <li className="flex justify-between gap-3" data-rails="none">
        <span className="text-zinc-400">{t('rails.title', 'Entrada de energia da GPU por conector')}</span>
        <span className="text-right">{dash} <span className="text-[11px] text-zinc-500">{why}</span></span>
      </li>
    );
  }
  const low = rails.filter((r) => isLowRail(r.v));
  return (
    <>
      {rails.map((r) => (
        <li key={r.id} className="flex justify-between gap-3" data-rail={r.id} title={isLowRail(r.v) ? t('rails.lowV', 'Abaixo de 11,4 V: fora da tolerância ATX de 12 V (±5%). Verifique cabo, conector e fonte.') : t('rails.source', 'Medido pelo driver NVIDIA (NVAPI)')}>
          <span className="text-zinc-400">{t(`rails.${r.id}`, r.id)}</span>
          <span className="font-mono text-zinc-200 text-right">{val(r.w, 1, 'W')} · {val(r.v, 2, 'V', isLowRail(r.v) ? 'text-amber-300' : '')} · {val(r.a, 1, 'A')}</span>
        </li>
      ))}
      {gpu?.railsW != null ? (
        <li className="flex justify-between gap-3" title={t('rails.sumHelp', 'Soma dos conectores medidos (derivado). A diferença para o total da placa é o 3,3 V do slot, que o driver só estima.')}>
          <span className="text-zinc-400">{t('ovle.m.rail.total', 'Entrada da GPU (soma dos conectores)')}<span className="text-amber-300/80">*</span></span>
          <span className="font-mono text-zinc-200 text-right">{gpu.railsW.toFixed(1)}<span className="text-zinc-500"> W</span></span>
        </li>
      ) : null}
      {low.length ? <li className="text-[12px] text-amber-300" role="alert">{t('rails.lowV', 'Abaixo de 11,4 V: fora da tolerância ATX de 12 V (±5%). Verifique cabo, conector e fonte.')}</li> : null}
    </>
  );
}

const RATINGS = ['white', 'bronze', 'silver', 'gold', 'platinum', 'titanium', 'custom'] as const;

/** PSU, extra load and tariff used by the estimates (also shown by the in-game overlay). Saved with the overlay settings. */
export function PowerSettingsForm({ s, set }: { s: OverlaySettings; set: (p: Partial<OverlaySettings>) => void }) {
  const { t } = useI18n();
  const num = (key: 'psuWatts' | 'extraWatts' | 'tariff' | 'hoursPerDay', step: number, label: string, unit: string, w = 'w-24') => (
    <label className="flex flex-col gap-1 text-[12px] text-zinc-400">
      {label}
      <span className="flex items-center gap-1.5">
        <input type="number" min={0} step={step} defaultValue={s[key]} key={`${key}-${s[key]}`} className={`dh-input ${w} font-mono`}
          onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v !== s[key]) set({ [key]: v } as Partial<OverlaySettings>); }} />
        <span className="text-zinc-500">{unit}</span>
      </span>
    </label>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-4">
        {num('psuWatts', 50, t('pwr.psuWatts', 'Potência da fonte'), 'W')}
        <label className="flex flex-col gap-1 text-[12px] text-zinc-400">
          {t('pwr.psuRating', 'Certificação 80 Plus')}
          <select className="dh-input" value={s.psuRating} onChange={(e) => set({ psuRating: e.target.value as OverlaySettings['psuRating'], psuModel: null })}>
            {RATINGS.map((r) => <option key={r} value={r}>{r === 'custom' ? t('pwr.custom', 'Curva própria') : r[0].toUpperCase() + r.slice(1)}</option>)}
          </select>
        </label>
        {num('extraWatts', 5, t('pwr.extraWatts', 'Componentes adicionais'), 'W')}
        {num('tariff', 0.01, t('pwr.tariff', 'Tarifa'), 'R$/kWh')}
        {num('hoursPerDay', 1, t('pwr.hoursPerDay', 'Horas de uso por dia'), 'h', 'w-20')}
      </div>
      {s.psuRating === 'custom' ? (
        <div className="flex flex-wrap items-end gap-3">
          <span className="text-[12px] text-zinc-500">{t('pwr.curve', 'Eficiência da fonte com carga de')}</span>
          {[10, 20, 50, 100].map((load, i) => (
            <label key={load} className="flex flex-col gap-1 text-[12px] text-zinc-400">
              {load}%
              <span className="flex items-center gap-1">
                <input type="number" min={50} max={99.9} step={0.5} defaultValue={s.psuCustom[i]} key={`c${i}-${s.psuCustom[i]}`} className="dh-input w-20 font-mono"
                  onBlur={(e) => { const next = [...s.psuCustom]; next[i] = Number(e.target.value); set({ psuCustom: next }); }} />
                <span className="text-zinc-500">%</span>
              </span>
            </label>
          ))}
        </div>
      ) : null}
      <div className="border-t border-zinc-800/80 pt-3"><PsuCatalogPicker s={s} set={set} /></div>
      <p className="dh-help max-w-[80ch]">{t('pwr.settingsHelp', 'A eficiência da fonte vem dos pontos da certificação 80 Plus (10, 20, 50 e 100% de carga) com interpolação; abaixo de 20% é uma aproximação. Os componentes adicionais (placa-mãe, SSDs, ventoinhas, RAM) são um valor que você informa. Tudo marcado com * é uma estimativa.')}</p>
    </div>
  );
}

/** System Monitor: GPU/CPU/RAM readings the overlay also uses, plus power efficiency, PSU load and cost estimates. */
export default function PowerPanel({ cpuLoad }: { cpuLoad?: number | null }) {
  const { t } = useI18n();
  const [p, setP] = useState<OverlayPower | null>(null);
  const [s, setS] = useState<OverlaySettings | null>(null);

  const refresh = useCallback(() => {
    void api()?.power().then((r) => { if (r?.ok) setP(r); }).catch(() => {});
  }, []);
  useEffect(() => {
    void api()?.status().then((r) => { if (r?.ok && r.settings) setS(r.settings); });
    refresh();
    const id = setInterval(refresh, 1500);
    return () => clearInterval(id);
  }, [refresh]);

  const set = (patch: Partial<OverlaySettings>) => { void api()?.setSettings(patch).then((r) => { if (r?.ok && r.settings) { setS(r.settings); refresh(); } }); };

  if (!api()) return null;
  const hw = p?.hw;
  const d = p?.derived;
  if (!hw || !d) {
    return (
      <section className="dh-card p-4">
        <h2 className="dh-section-title">{t('pwr.title', 'Consumo, eficiência e custo')}</h2>
        <p className="mt-1 dh-help">{t('pwr.waiting', 'Aguardando os sensores avançados. Ative-os na aba de temperaturas.')}</p>
      </section>
    );
  }
  const g = hw.gpu, c = hw.cpu, r = hw.ram, nv = hw.nvml;
  const unavailable = t('pwr.unavailable', 'Esta placa/driver não expõe esse dado');
  const needs = hw.access?.cpuNeedsAdmin ? t('pwr.needsAdmin', 'precisa de admin') : hw.access?.cpuNeedsPawnio ? t('pwr.needsPawnio', 'precisa do driver PawnIO') : null;
  const cpuVal = (v: number | null | undefined, d = 0) => (needs && v == null ? needs : f(v, d));
  const sys = d.system;
  const cal = d.calibration;
  const money = (x: number | null | undefined) => (x == null ? '—' : `R$ ${x.toFixed(2)}`);
  const kwh = (x: number | null | undefined) => (x == null ? '—' : x.toFixed(1));
  const limiters = nv?.throttle ? nv.throttle.filter((k) => k !== 'idle' && k !== 'appClocks') : null;
  const scen: [string, string, OverlayCost | null][] = [
    ['GPU', 'gpu', d.cost.gpu], ['CPU+GPU', 'cpuGpu', d.cost.cpuGpu], [t('pwr.withExtra', 'CPU+GPU+adicionais'), 'withExtra', d.cost.withExtra], [t('pwr.wall', 'Tomada (AC)'), 'wall', d.cost.wall]
  ];

  return (
    <section className="dh-card p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 max-w-[75ch]">
          <h2 className="dh-section-title">{t('pwr.title', 'Consumo, eficiência e custo')}</h2>
          <p className="mt-1 dh-help">{t('pwr.help', 'Leituras diretas da GPU, CPU e RAM, e estimativas de fonte e custo. O que tem * é estimado ou derivado; o que a placa ou o driver não expõe aparece como — (nunca zero).')}</p>
        </div>
        <button type="button" className="dh-btn dh-btn-ghost dh-btn-sm shrink-0" onClick={() => void api()?.resetEnergy().then((x) => x?.ok && setP(x))} title={t('pwr.resetHelp', 'Zera a energia acumulada (kJ) e a média da sessão')}>
          <RefreshCw size={13} />{t('pwr.reset', 'Zerar energia')}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3 text-[12.5px]">
        <Block title={`GPU${g?.name ? ` · ${g.name}` : ''}`} icon={<Zap size={14} />}>
          <Row label={t('pwr.usage', 'Uso')} value={f(g?.load)} unit="%" />
          <Row label={t('pwr.temp', 'Temperatura')} value={f(g?.temp)} unit="°C" />
          <Row label={t('pwr.hotspot', 'Hotspot')} value={f(g?.hotspot)} unit="°C" title={g?.hotspot == null ? unavailable : undefined} />
          <Row label={t('pwr.vramJunction', 'Hotspot da VRAM (junção)')} value={f(g?.memJunction)} unit="°C" />
          <Row label={t('pwr.voltage', 'Tensão do núcleo')} value={f(g?.voltage != null ? g.voltage * 1000 : null)} unit="mV" />
          <Row label={t('pwr.clock', 'Clock do núcleo')} value={f(g?.clock)} unit="MHz" />
          <Row label={t('pwr.fan', 'Ventoinha')} value={g?.fanPct != null ? `${f(g.fanPct)}%${g.fanRpm != null ? ` · ${f(g.fanRpm)} RPM` : ''}` : null} />
          <Row label={t('pwr.vram', 'VRAM')} value={g?.vramUsedMb != null ? `${f(g.vramPct)}% · ${f(g.vramUsedMb)}${g.vramTotalMb ? ` / ${f(g.vramTotalMb)}` : ''}` : null} unit="MB" />
          <Row label={t('pwr.vramClock', 'Clock da VRAM')} value={f(g?.memClock)} unit="MHz" />
          <Row label={t('pwr.memCtrl', 'Controlador de memória')} value={f(g?.memCtrlLoad)} unit="%" />
          <Row label={t('pwr.sharedMem', 'Memória compartilhada (D3D)')} value={f(g?.d3dSharedMb)} unit="MB" />
          <Row label={t('pwr.computeMem', 'Memória de computação')} value={nv?.computeMemMb != null ? f(nv.computeMemMb) : null} unit="MB" title={nv?.computeMemMb == null ? t('pwr.computeMemWhy', 'No Windows (WDDM) o driver NVIDIA não informa memória por processo') : undefined} />
        </Block>

        <Block title={t('pwr.gpuPower', 'GPU: energia e barramento')}>
          <Row label={t('pwr.boardPower', 'Potência total da placa')} value={f(nv?.powerW ?? g?.power, 1)} unit="W" />
          <Row label={t('pwr.powerLimit', 'Limite de potência')} value={f(nv?.enforcedLimitW ?? nv?.powerLimitW)} unit="W" />
          <Row label={t('pwr.powerPct', '% do TDP')} value={f(g?.powerPct)} unit="%" />
          <Row label={t('pwr.energy', 'Energia acumulada')} value={f(d.energy.gpuKj, 2)} unit="kJ" title={d.energy.source === 'nvml' ? t('pwr.energyNvml', 'Contador de energia do driver NVIDIA') : d.energy.source === 'integrated' ? t('pwr.energyInt', 'Potência integrada ao longo do tempo') : undefined} />
          <Row label={t('pwr.pcie', 'PCIe')} value={nv?.pcieGen != null && nv?.pcieWidth != null ? `${nv.pcieGen}.0 x${nv.pcieWidth}${nv.pcieMaxGen != null && nv.pcieMaxWidth != null ? ` (${t('pwr.max', 'máx')} ${nv.pcieMaxGen}.0 x${nv.pcieMaxWidth})` : ''}` : null} />
          <Row label={t('pwr.pcieRx', 'PCIe recebendo')} value={f(g?.pcieRxBps != null ? g.pcieRxBps / 1048576 : null)} unit="MB/s" />
          <Row label={t('pwr.pcieTx', 'PCIe enviando')} value={f(g?.pcieTxBps != null ? g.pcieTxBps / 1048576 : null)} unit="MB/s" />
          <Row label={t('pwr.bus', 'Carga do barramento')} value={f(g?.busLoad)} unit="%" />
          <Row label={t('pwr.videoEngine', 'Motor de vídeo')} value={f(g?.videoEngineLoad)} unit="%" />
          <Row label={t('pwr.encDec', 'Codificador / decodificador')} value={nv?.encoderPct != null || nv?.decoderPct != null ? `${f(nv?.encoderPct) ?? '—'}% / ${f(nv?.decoderPct) ?? '—'}%` : null} />
          <Row label={t('pwr.limiters', 'Limitadores de clock')} value={limiters ? (limiters.length ? limiters.map((k) => t(`pwr.throttle.${k}`, k)).join(' · ') : t('pwr.none', 'nenhum')) : null} />
          <RailRows gpu={g} />
          <Row label={t('pwr.asic', 'Qualidade ASIC / speedo')} value={null} title={unavailable} />
        </Block>

        <div className="space-y-4">
          <Block title="CPU">
            <Row label={t('pwr.usage', 'Uso')} value={f(cpuLoad ?? c?.load)} unit="%" />
            <Row label={t('pwr.clock', 'Clock')} value={cpuVal(c?.clock)} unit={c?.clock != null ? 'MHz' : undefined} />
            <Row label={t('pwr.power', 'Consumo')} value={cpuVal(c?.power, 1)} unit={c?.power != null ? 'W' : undefined} />
            <Row label={t('pwr.temp', 'Temperatura')} value={cpuVal(c?.temp)} unit={c?.temp != null ? '°C' : undefined} />
          </Block>
          <Block title="RAM">
            <Row label={t('pwr.ramUse', 'Em uso')} value={r?.usedGb != null ? `${f(r.usedGb, 1)}${r.totalGb ? ` / ${f(r.totalGb, 0)}` : ''}` : null} unit="GB" />
            <Row label={t('pwr.ramRate', 'Taxa efetiva')} value={f(r?.effectiveMts)} unit="MT/s" est title={t('pwr.smbios', 'Lida da SMBIOS (firmware), não é um contador ao vivo')} />
            <Row label={t('pwr.ramBase', 'Clock base')} value={f(r?.baseClockMhz)} unit="MHz" est title={t('pwr.smbios', 'Lida da SMBIOS (firmware), não é um contador ao vivo')} />
          </Block>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 text-[12.5px] border-t border-zinc-800/80 pt-4">
        <Block title={t('pwr.eff', 'Eficiência (precisa de um jogo medido)')}>
          <Row label="FPS/W" value={f(d.efficiency.fpsPerWatt, 2)} est />
          <Row label={t('pwr.fpsPerWattAvg', 'FPS/W médio')} value={f(d.efficiency.fpsPerWattAvg, 2)} est />
          <Row label="J / frame" value={f(d.efficiency.joulesPerFrame, 2)} est />
          <Row label={t('pwr.jpfAvg', 'J / frame médio')} value={f(d.efficiency.joulesPerFrameAvg, 2)} est />
        </Block>
        <Block title={t('pwr.psu', 'Fonte e total do PC')}>
          <Row label={t('pwr.psuLoad', 'Carga da fonte')} value={f(sys.loadPct)} unit="%" est />
          <Row label={t('pwr.psuEff', 'Eficiência da fonte')} value={f(sys.efficiency, 1)} unit="%" est />
          <Row label={t('pwr.gpuCpu', 'GPU + CPU')} value={d.gpuW != null || d.cpuW != null ? f((d.gpuW ?? 0) + (d.cpuW ?? 0), 0) : null} unit="W" />
          <Row label={sys.calibrated ? t('pwr.extraCal', 'Consumo oculto (calibrado)') : t('pwr.extra', 'Componentes adicionais')} value={f(sys.calibrated ? sys.extraW : d.settings.extraWatts)} unit="W" est />
          <Row label={t('pwr.dc', 'Total do PC (DC)')} value={f(sys.dcW)} unit="W" est />
          <Row label={sys.calibrated ? t('pwr.acCal', 'Da tomada (AC), calibrado') : t('pwr.ac', 'Da tomada (AC)')} value={f(sys.acW)} unit="W" est
            title={sys.calibrated && cal?.at ? t('pwr.calOn', 'Calibrado com medidor de tomada em {d}. Continua sendo uma estimativa.').replace('{d}', new Date(cal.at).toLocaleDateString()) : undefined} />
        </Block>
      </div>
      {cal?.state === 'applied' && cal.at ? <p className="text-[12px] text-zinc-500">{t('pwr.calOn', 'Calibrado com medidor de tomada em {d}. Continua sendo uma estimativa.').replace('{d}', new Date(cal.at).toLocaleDateString())}</p> : null}
      {cal?.state === 'mismatch' ? <p className="text-[12px] text-amber-300/90">{t('pwr.calIgnored', 'Calibração de {d} ignorada: a GPU, a CPU ou a fonte escolhida mudou desde então.').replace('{d}', cal.at ? new Date(cal.at).toLocaleDateString() : '')}</p> : null}
      {sys.partial && sys.dcW != null ? <p className="text-[12px] text-amber-300/90">{t('pwr.partial', 'Total sem a leitura de')} {sys.missing.map((m) => (m === 'cpu' ? 'CPU' : 'GPU')).join(' / ')}{sys.missing.includes('cpu') && needs ? ` (${needs})` : ''}.</p> : null}

      <div className="overflow-x-auto border-t border-zinc-800/80 pt-4">
        <h3 className="text-[12px] text-zinc-500 mb-2">{t('pwr.cost', 'Custo de energia')}<span className="text-amber-300/80">*</span> · {s ? `R$ ${s.tariff.toFixed(2)}/kWh · ${s.hoursPerDay} h/${t('pwr.day', 'dia')}` : ''}</h3>
        <table className="w-full text-[12.5px] font-mono">
          <thead><tr className="text-zinc-500 text-left">
            <th className="font-sans font-normal pr-3">{t('pwr.scenario', 'Cenário')}</th><th className="pr-3">{t('pwr.hour', 'Hora')}</th><th className="pr-3">{t('pwr.dayCol', 'Dia')}</th><th className="pr-3">{t('pwr.month', 'Mês')}</th><th className="pr-3">{t('pwr.year', 'Ano')}</th><th>kWh/{t('pwr.monthShort', 'mês')}</th>
          </tr></thead>
          <tbody>
            {scen.map(([label, key, x]) => (
              <tr key={key} className="text-zinc-200">
                <td className="font-sans text-zinc-400 pr-3">{label}</td>
                <td className="pr-3">{money(x?.perHour)}</td><td className="pr-3">{money(x?.perDay)}</td><td className="pr-3">{money(x?.perMonth)}</td><td className="pr-3">{money(x?.perYear)}</td><td>{kwh(x?.kwhMonth)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="border-t border-zinc-800/80 pt-3">
        <summary className="cursor-pointer text-[12.5px] text-zinc-300">{t('pwr.cal.title', 'Calibrar com medidor de tomada')}</summary>
        <div className="mt-3"><WallCalibration derived={d} needs={needs} onSaved={(ns) => { if (ns) setS(ns); refresh(); }} /></div>
      </details>

      {s ? (
        <details className="border-t border-zinc-800/80 pt-3">
          <summary className="cursor-pointer text-[12.5px] text-zinc-300">{t('pwr.settings', 'Fonte, componentes adicionais e tarifa')}</summary>
          <div className="mt-3"><PowerSettingsForm s={s} set={set} /></div>
        </details>
      ) : null}
    </section>
  );
}
