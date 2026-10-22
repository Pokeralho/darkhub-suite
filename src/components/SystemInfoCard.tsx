import React from 'react';
import { HelpTip } from './HelpTip';
import { Cpu } from './icons';

interface SystemInfoCardProps {
  cpuUsage: number;
  ramUsage: number;
  onClick?: () => void;
}

const tone = (v: number) => (v >= 95 ? 'text-red-300' : v >= 85 ? 'text-amber-300' : 'text-zinc-50');

export const SystemInfoCard: React.FC<SystemInfoCardProps> = ({
  cpuUsage,
  ramUsage,
  onClick
}) => {
  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}
      className="group dh-card p-4 hover:border-zinc-700 transition-colors cursor-pointer outline-none focus-visible:border-blue-400"
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-[12px] text-zinc-500">
          <Cpu size={14} className="text-zinc-500 group-hover:text-blue-300 transition-colors" />
          <span>System Info</span>
        </div>
        <HelpTip
          title="Informações do Sistema"
          description="Mostra o uso atual de CPU e memória RAM do seu computador."
          sections={[
            { title: "CPU Usage", content: "Porcentagem de processamento sendo utilizado no momento." },
            { title: "RAM Usage", content: "Quantidade de memória RAM em uso. Acima de 85% pode causar lentidão." }
          ]}
        />
      </div>
      <dl className="mt-3 grid grid-cols-2 divide-x divide-zinc-800/80">
        <div className="pr-4">
          <dt className="text-[11.5px] text-zinc-500">CPU</dt>
          <dd className={`mt-1 font-mono text-[22px] leading-none tabular-nums ${tone(cpuUsage)}`}>
            {cpuUsage}<span className="text-[13px] text-zinc-500">%</span>
          </dd>
        </div>
        <div className="pl-4">
          <dt className="text-[11.5px] text-zinc-500">RAM</dt>
          <dd className={`mt-1 font-mono text-[22px] leading-none tabular-nums ${tone(ramUsage)}`}>
            {ramUsage}<span className="text-[13px] text-zinc-500">%</span>
          </dd>
        </div>
      </dl>
    </div>
  );
};
