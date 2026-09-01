import { useI18n } from '../i18n/I18nProvider';
import React, { useEffect, useMemo, useState } from 'react';

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
  const { t } = useI18n();
  const [info, setInfo] = useState<HardwareInfo | null>(null);
  const [activeTab, setActiveTab] = useState<'cpu' | 'gpu' | 'ram' | 'storage' | 'sensors'>('cpu');
  const [loading, setLoading] = useState(true);
  const [realtime, setRealtime] = useState({
    cpuUsage: 0,
    ramUsage: 0,
    temperatures: {} as any
  });

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

  useEffect(() => {
    let mounted = true;
    const update = async () => {
      try {
        const [metrics, temp] = await Promise.all([
          window.darkhub?.system?.getMetrics?.() ?? {},
          window.darkhub?.system?.getTemperatures?.() ?? {}
        ]);
        if (!mounted) return;

        const used = Number(metrics?.memory?.used ?? 0);
        const total = Number(metrics?.memory?.total ?? 0);
        setRealtime({
          cpuUsage: Math.round(Number(metrics?.cpu?.currentLoad ?? 0)),
          ramUsage: total > 0 ? Math.round((used / total) * 100) : 0,
          temperatures: temp
        });
      } catch {}
    };

    update();
    const interval = window.setInterval(update, 1200);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const sensors = useMemo(
    () => tempEntries(realtime.temperatures).length ? tempEntries(realtime.temperatures) : tempEntries(info?.temperatures),
    [info?.temperatures, realtime.temperatures]
  );

  if (loading || !info) {
    return <div className="p-6 text-zinc-400">Carregando informações detalhadas do hardware...</div>;
  }

  const tabs = [
    { id: 'cpu' as const, label: 'CPU' },
    { id: 'gpu' as const, label: 'GPU' },
    { id: 'ram' as const, label: 'RAM' },
    { id: 'storage' as const, label: 'Armazenamento' },
    { id: 'sensors' as const, label: 'Sensores' }
  ];

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="flex overflow-x-auto border-b border-zinc-800 bg-zinc-950">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'text-white border-b-2 border-blue-500 bg-zinc-900'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-6">
        {activeTab === 'cpu' && (
          <div className="space-y-5">
            <div>
              <div className="text-sm text-zinc-500">Processador</div>
              <div className="text-2xl font-semibold text-white mt-1 tracking-tight">
                {info.cpu.brand || info.cpu.model || 'CPU nao identificada'}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Metric label="Nucleos / Threads" value={`${info.cpu.cores ?? '-'} / ${info.cpu.physicalCores ?? info.cpu.threads ?? '-'}`} />
              <Metric label="Clock base" value={`${info.cpu.speed ?? '-'} GHz`} />
              <Metric label="Uso agora" value={`${realtime.cpuUsage}%`} accent="text-emerald-400" />
            </div>
          </div>
        )}

        {activeTab === 'gpu' && (
          <div className="space-y-4">
            {info.gpu.length > 0 ? info.gpu.map((gpu: any, i: number) => (
              <div key={i} className="bg-zinc-950 border border-zinc-800 rounded-xl p-5">
                <div className="font-semibold text-xl text-white">{gpu.model || gpu.name || 'GPU'}</div>
                <div className="text-sm text-zinc-400 mb-4">{gpu.vendor || 'Vendor nao informado'}</div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-zinc-500">VRAM:</span> <span className="font-mono text-white">{gpu.vram || 'N/A'} MB</span></div>
                  <div><span className="text-zinc-500">Driver:</span> <span className="font-mono text-white">{gpu.driverVersion || 'N/A'}</span></div>
                </div>
              </div>
            )) : <div className="text-zinc-500">Nenhuma GPU detectada.</div>}
          </div>
        )}

        {activeTab === 'ram' && (
          <div>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-5xl font-semibold text-white tracking-tighter">{realtime.ramUsage}</span>
              <span className="text-xl text-zinc-400">%</span>
            </div>
            <div className="h-3 bg-zinc-800 rounded-full overflow-hidden mb-6">
              <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${Math.min(100, realtime.ramUsage)}%` }} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Metric label="Total" value={gb(info.ram.total)} />
              <Metric label="Em uso" value={gb(info.ram.used)} />
            </div>
          </div>
        )}

        {activeTab === 'storage' && (
          <div className="space-y-3">
            {info.storage.length > 0 ? info.storage.map((disk: any, i: number) => (
              <div key={i} className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex justify-between items-center gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-white truncate">{disk.fs || disk.mount || disk.name || `Disco ${i + 1}`}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{disk.type || 'volume'}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-lg text-white">{gb(disk.size)}</div>
                  {Number.isFinite(Number(disk.use)) ? <div className="text-xs text-zinc-500">{Math.round(Number(disk.use))}% usado</div> : null}
                </div>
              </div>
            )) : <div className="text-zinc-500">Nenhum armazenamento detectado.</div>}
          </div>
        )}

        {activeTab === 'sensors' && (
          <div className="space-y-3">
            {sensors.length > 0 ? sensors.map(([key, value]: [string, any]) => (
              <div key={key} className="flex justify-between items-center bg-zinc-950 px-4 py-3 rounded-xl">
                <span className="text-zinc-300">{key}</span>
                <span className="font-mono text-orange-400 text-lg">{Math.round(Number(value))} C</span>
              </div>
            )) : (
              <div className="text-zinc-500 py-4">Sensores de temperatura nao disponiveis neste sistema.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const Metric: React.FC<{ label: string; value: string; accent?: string }> = ({ label, value, accent = 'text-white' }) => (
  <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
    <div className="text-xs text-zinc-500">{label}</div>
    <div className={`text-2xl font-mono mt-1 tracking-tight ${accent}`}>{value}</div>
  </div>
);
