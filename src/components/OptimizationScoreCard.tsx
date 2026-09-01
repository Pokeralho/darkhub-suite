import { useI18n } from '../i18n/I18nProvider';
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
  const { t } = useI18n();
  return (
    <div
      onClick={onClick}
      className="p-4 rounded-xl border border-zinc-800 bg-zinc-900 flex items-center space-x-4 min-w-[220px] cursor-pointer hover:bg-zinc-800 active:bg-zinc-950 transition-all duration-200"
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
          <span className="text-sm text-zinc-400">Pontuação de Otimização</span>

          {}
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

        <div className="text-3xl font-bold text-white">{score}</div>
        <div className="text-xs text-emerald-400 mt-0.5">+12 desde ontem</div>
      </div>
    </div>
  );
};
