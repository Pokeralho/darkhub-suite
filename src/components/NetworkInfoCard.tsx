import React from 'react';
import { HelpTip } from './HelpTip';
import { Wifi } from 'lucide-react';

interface NetworkInfoCardProps {
  download: number;
  upload: number;
  onClick?: () => void;
}

export const NetworkInfoCard: React.FC<NetworkInfoCardProps> = ({
  download,
  upload,
  onClick
}) => {
  return (
    <div
      onClick={onClick}
      className="p-5 rounded-2xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 transition-all cursor-pointer active:scale-[0.985]"
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 text-zinc-400 text-sm">
          <Wifi className="w-4 h-4" />
          <span>Rede</span>
        </div>

        <HelpTip
          title="Informações de Rede"
          description="Velocidade atual de download e upload da sua conexão."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-zinc-500">DOWNLOAD</div>
          <div className="text-2xl font-semibold text-white">{download} <span className="text-sm text-zinc-400">Mbps</span></div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">UPLOAD</div>
          <div className="text-2xl font-semibold text-white">{upload} <span className="text-sm text-zinc-400">Mbps</span></div>
        </div>
      </div>
    </div>
  );
};
