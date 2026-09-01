import React from 'react';
import { HelpTip } from './HelpTip';
import { Zap } from 'lucide-react';

interface LatencyCardProps {
  latency: number;
  onClick?: () => void;
}

export const LatencyCard: React.FC<LatencyCardProps> = ({ latency, onClick }) => {
  const getColor = (value: number) => {
    if (value < 30) return 'text-emerald-400';
    if (value < 70) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div
      onClick={onClick}
      className="p-5 rounded-2xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 transition-all cursor-pointer active:scale-[0.985]"
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
            <Zap className="w-4 h-4" />
            <span>Network Latency</span>
          </div>
          <div className={`text-4xl font-bold tracking-tighter ${getColor(latency)}`}>
            {latency}<span className="text-2xl font-medium">ms</span>
          </div>
        </div>

        <HelpTip
          title="Latência de Rede"
          description="Tempo de resposta da sua conexão com a internet."
          sections={[
            { title: "Valores ideais", content: "Abaixo de 30ms é excelente para jogos e chamadas." },
            { title: "Acima de 80ms", content: "Pode causar lag em jogos online e chamadas de voz." }
          ]}
        />
      </div>
    </div>
  );
};
