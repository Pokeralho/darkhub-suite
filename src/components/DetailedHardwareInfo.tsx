import React, { useEffect, useMemo, useState } from 'react';
import { useSystemMetrics } from '../hooks/useSystemMetrics';

interface HardwareInfo {
  cpu: any;
  gpu: any[];
  ram: any;
  motherboard: any;
  bios: any;
  storage: any[];
  temperatures: any;
}

const gb = (bytes?: number) => {
  const n = Number(bytes ?? 0);
  return Number.isFinite(n) ? `${(n / 1024 / 1024 / 1024).toFixed(1)} GB` : 'N/A';
};

const tempEntries = (value: any): Array<[string, number]> => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      Object.entries(entry ?? {})
        .filter(([, v]) => typeof v === 'number')
        .map(([k, v]) => [`Sensor ${index + 1} ${k}`, Number(v)] as [string, number])
    );
  }
  return Object.entries(value)
    .filter(([, v]) => typeof v === 'number')
    .map(([k, v]) => [k, Number(v)] as [string, number]);
};

export const DetailedHardwareInfo: React.FC = () => {
  const [info, setInfo] = useState<HardwareInfo | null>(null);
  const [activeTab, setActiveTab] = useState<'cpu' | 'gpu' | 'ram' | 'storage' | 'sensors'>('cpu');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;

    const loadStaticInfo = async () => {
      try {
        setLoading(true);
        const [system, graphics, bios, storage, temperatures] = await Promise.all([
          window.darkhub?.system?.getInfo?.() ?? {},
          window.darkhub?.system?.getGraphics?.() ?? [],
          window.darkhub?.system?.getBios?.() ?? {},
          window.darkhub?.system?.getStorage?.() ?? { disks: [] },
          window.darkhub?.system?.getTemperatures?.() ?? {}
        ]);

        if (cancelled) return;
        setInfo({
          cpu: system?.cpu ?? {},
          gpu: Array.isArray(graphics) ? graphics : (system?.graphics ?? []),
          ram: system?.memory ?? {},
          motherboard: bios?.baseboard ?? system?.baseboard ?? {},
          bios: bios?.bios ?? system?.bios ?? {},
          storage: Array.isArray(storage) ? storage : (storage?.disks ?? []),
          temperatures
        });
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadStaticInfo();
    return () => {
      cancelled = true;
    };
  }, []);

  // Live values come from the shared hardware stream (one daemon for the whole app), not from
  // per-component polling with PowerShell-backed IPC calls.
  const live = useSystemMetrics();
  const realtime = useMemo(() => {
    const probes: any[] = live?.temps?.values?.probes ?? [];
    const temperatures: Record<string, number> = {};
    for (const p of probes) {
      const v = p?.temperature?.value;
      if (typeof v === 'number') temperatures[p?.name || `Sensor ${Object.keys(temperatures).length + 1}`] = v;
    }
    const main = live?.temps?.values?.main?.value;
    if (typeof main === 'number' && Object.keys(temperatures).length === 0) temperatures['CPU'] = main;
    return {
      cpuUsage: Math.round(Number(live?.cpu?.values?.currentLoad?.value ?? 0)),
      ramUsage: Math.round(Number(live?.ram?.values?.percent?.value ?? 0)),
      temperatures
    };
  }, [live?.temps, live?.cpu, live?.ram]);

  const sensors = useMemo(
    () => tempEntries(realtime.temperatures).length ? tempEntries(realtime.temperatures) : tempEntries(info?.temperatures),
    [info?.temperatures, realtime.temperatures]
  );

  if (loading || !info) {
    return (
      <div className="dh-card overflow-hidden" aria-busy="true" aria-label="Carregando informações detalhadas do hardware...">
        <div className="flex gap-4 px-4 h-10 items-center border-b border-zinc-800/80">
          {[0, 1, 2, 3, 4].map(i => <span key={i} className="h-3 w-16 rounded bg-zinc-800/80 animate-pulse" />)}
        </div>
        <div className="p-5 space-y-4">
          <span className="block h-3 w-24 rounded bg-zinc-800/80 animate-pulse" />
          <span className="block h-6 w-72 rounded bg-zinc-800/80 animate-pulse" />
          <div className="grid grid-cols-3 gap-4">
            {[0, 1, 2].map(i => <span key={i} className="block h-12 rounded-lg bg-zinc-900 animate-pulse" />)}
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'cpu' as const, label: 'CPU' },
    { id: 'gpu' as const, label: 'GPU' },
    { id: 'ram' as const, label: 'RAM' },
    { id: 'storage' as const, label: 'Armazenamento' },
    { id: 'sensors' as const, label: 'Sensores' }
  ];

  const empty = (text: string) => <p className="py-4 text-[12.5px] text-zinc-500">{text}</p>;
  const ramTone = realtime.ramUsage >= 90 ? 'text-red-300' : realtime.ramUsage >= 80 ? 'text-amber-300' : 'text-zinc-50';
  const ramBar = realtime.ramUsage >= 90 ? 'bg-red-400' : realtime.ramUsage >= 80 ? 'bg-amber-400' : 'bg-blue-400';

  return (
    <div className="dh-card overflow-hidden">
      <div role="tablist" className="flex overflow-x-auto px-2 border-b border-zinc-800/80">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative h-10 px-3 text-[12.5px] whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'text-zinc-50 font-medium after:absolute after:inset-x-3 after:bottom-0 after:h-px after:bg-blue-400'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-5">
        {activeTab === 'cpu' && (
          <div className="space-y-4">
            <div>
              <div className="text-[11.5px] text-zinc-500">Processador</div>
              <div className="text-[17px] font-semibold text-zinc-50 mt-1 tracking-[-0.01em]">
                {info.cpu.brand || info.cpu.model || 'CPU nao identificada'}
              </div>
            </div>
            <MetricGrid>
              <Metric label="Nucleos / Threads" value={`${info.cpu.physicalCores ?? '-'} / ${info.cpu.cores ?? '-'}`} />
              <Metric label="Clock base" value={`${info.cpu.speed ?? '-'}`} unit="GHz" />
              <Metric label="Uso agora" value={`${realtime.cpuUsage}`} unit="%" />
            </MetricGrid>
          </div>
        )}

        {activeTab === 'gpu' && (
          <div className="divide-y divide-zinc-800/80">
            {info.gpu.length > 0 ? info.gpu.map((gpu: any, i: number) => (
              <div key={i} className="py-3 first:pt-0 last:pb-0">
                <div className="text-[14px] font-semibold text-zinc-50">{gpu.model || gpu.name || 'GPU'}</div>
                <div className="text-[12px] text-zinc-500">{gpu.vendor || 'Vendor nao informado'}</div>
                <dl className="mt-2 grid grid-cols-2 gap-4 text-[12.5px]">
                  <div><dt className="text-[11.5px] text-zinc-500">VRAM</dt><dd className="font-mono text-zinc-50">{gpu.vram || 'N/A'}<span className="text-zinc-500"> MB</span></dd></div>
                  <div><dt className="text-[11.5px] text-zinc-500">Driver</dt><dd className="font-mono text-zinc-50">{gpu.driverVersion || 'N/A'}</dd></div>
                </dl>
              </div>
            )) : empty('Nenhuma GPU detectada.')}
          </div>
        )}

        {activeTab === 'ram' && (
          <div className="space-y-4">
            <div className="flex items-baseline gap-1">
              <span className={`font-mono text-[32px] leading-none ${ramTone}`}>{realtime.ramUsage}</span>
              <span className="text-[14px] text-zinc-500">%</span>
            </div>
            <div className="h-[3px] bg-zinc-800 rounded-full overflow-hidden" role="meter" aria-valuenow={realtime.ramUsage} aria-valuemin={0} aria-valuemax={100}>
              <div className={`h-full transition-all duration-500 ${ramBar}`} style={{ width: `${Math.min(100, realtime.ramUsage)}%` }} />
            </div>
            <MetricGrid>
              <Metric label="Total" value={gb(info.ram.total)} />
              <Metric label="Em uso" value={gb(info.ram.used)} />
            </MetricGrid>
          </div>
        )}

        {activeTab === 'storage' && (
          <div className="divide-y divide-zinc-800/80">
            {info.storage.length > 0 ? info.storage.map((disk: any, i: number) => (
              <div key={i} className="py-2.5 first:pt-0 last:pb-0 flex justify-between items-center gap-3">
                <div className="min-w-0">
                  <div className="text-[12.5px] text-zinc-200 truncate font-mono">{disk.fs || disk.mount || disk.name || `Disco ${i + 1}`}</div>
                  <div className="text-[11.5px] text-zinc-500 mt-0.5">{disk.type || 'volume'}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-[14px] text-zinc-50">{gb(disk.size)}</div>
                  {Number.isFinite(Number(disk.use)) ? <div className="text-[11.5px] text-zinc-500"><span className="font-mono">{Math.round(Number(disk.use))}%</span> usado</div> : null}
                </div>
              </div>
            )) : empty('Nenhum armazenamento detectado.')}
          </div>
        )}

        {activeTab === 'sensors' && (
          <div className="divide-y divide-zinc-800/80">
            {sensors.length > 0 ? sensors.map(([key, value]: [string, any]) => {
              const v = Math.round(Number(value));
              return (
                <div key={key} className="flex justify-between items-center py-2.5 first:pt-0 last:pb-0">
                  <span className="text-[12.5px] text-zinc-300">{key}</span>
                  <span className={`font-mono text-[14px] ${v >= 90 ? 'text-red-300' : v >= 80 ? 'text-amber-300' : 'text-zinc-50'}`}>{v}<span className="text-zinc-500"> °C</span></span>
                </div>
              );
            }) : empty('Sensores de temperatura nao disponiveis neste sistema.')}
          </div>
        )}
      </div>
    </div>
  );
};

const MetricGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <dl className="grid grid-cols-2 md:grid-cols-3 gap-px rounded-lg border border-zinc-800/80 bg-zinc-800/70 overflow-hidden">{children}</dl>
);

const Metric: React.FC<{ label: string; value: string; unit?: string }> = ({ label, value, unit }) => {
  // gb() returns "12.3 GB": split the unit off so it renders dimmer.
  const m = !unit ? /^(.*?)\s(GB|MB)$/.exec(value) : null;
  const v = m ? m[1] : value;
  const u = m ? m[2] : unit;
  return (
    <div className="bg-zinc-900 px-3.5 py-3">
      <dt className="text-[11.5px] text-zinc-500">{label}</dt>
      <dd className="mt-1 font-mono text-[17px] leading-tight text-zinc-50">{v}{u ? <span className="text-[12px] text-zinc-500"> {u}</span> : null}</dd>
    </div>
  );
};
