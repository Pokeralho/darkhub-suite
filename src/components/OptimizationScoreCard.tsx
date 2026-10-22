import React from 'react';
import { HelpTip } from './HelpTip';

interface OptimizationScoreCardProps {
  score: number;
  onClick?: () => void;
}

export const OptimizationScoreCard: React.FC<OptimizationScoreCardProps> = ({
  score,
  onClick
}) => {
  return (
    <div
      onClick={onClick}
      className="dh-card p-4 flex items-center gap-4 min-w-[220px] cursor-pointer hover:border-zinc-700 transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:border-blue-400"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && onClick) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="dh-label">Pontuação de Otimização</span>

          <HelpTip
            title="Pontuação de Otimização"
            description="Mostra o quão otimizado está o seu sistema no momento."
            sections={[
              {
                title: "Como é calculada?",
                content: "Baseada em uso de CPU, RAM, disco e latência de rede."
              },
              {
                title: "Valores ideais",
                content: "Acima de 85 é considerado excelente."
              }
            ]}
          />
        </div>

        <div className="text-[28px] leading-none font-mono font-semibold tabular-nums text-zinc-50">{score}</div>
      </div>
    </div>
  );
};
