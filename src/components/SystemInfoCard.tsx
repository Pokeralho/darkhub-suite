import React from 'react';
import { HelpTip } from './HelpTip';
import { Cpu, HardDrive } from 'lucide-react';

interface SystemInfoCardProps {
  cpuUsage: number;
  ramUsage: number;
  onClick?: () => void;
}

export const SystemInfoCard: React.FC<SystemInfoCardProps> = ({
  cpuUsage,
  ramUsage,
  onClick
}) => {
  return (
    <div
      onClick={onClick}
      className="p-5 rounded-2xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 transition-all cursor-pointer active:scale-[0.985]"
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
            <Cpu className="w-4 h-4" />
            <span>System Info</span>
          </div>
          <div className="text-2xl font-semibold text-white tracking-tight">
            {cpuUsage}% <span className="text-zinc-500 text-lg">CPU</span>
          </div>
          <div className="text-sm text-zinc-400 mt-0.5">
            RAM: {ramUsage}%
          </div>
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
    </div>
  );
};
