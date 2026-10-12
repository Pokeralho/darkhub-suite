import React, { useEffect, useState } from 'react';
import { LifeBuoy } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';

/** Shown on the System Optimizer only when running on DarkOS. */
export const DarkOSOptimizerHint: React.FC<{ onNavigate?: (page: string) => void }> = ({ onNavigate }) => {
  const { t } = useI18n();
  const [isDarkOS, setIsDarkOS] = useState(false);
  useEffect(() => {
    let alive = true;
    window.darkhub?.darkos?.isDarkOS?.().then((r) => { if (alive) setIsDarkOS(Boolean(r?.isDarkOS)); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!isDarkOS) return null;
  return (
    <div className="rounded-lg border border-blue-500/30 bg-[#3b82f6]/10 px-3 py-2 flex items-center gap-3">
      <LifeBuoy className="w-4 h-4 text-blue-300 shrink-0" />
      <p className="text-xs text-blue-100/90 flex-1 min-w-0">
        {t('darkos.optimizerHint', 'You are on DarkOS. System tweaks are managed in the DarkOS area.')}
      </p>
      {onNavigate ? (
        <button
          onClick={() => onNavigate('darkos')}
          className="shrink-0 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#3b82f6] hover:bg-blue-500 text-white"
        >
          {t('darkos.optimizerHint.open', 'Open DarkOS Center')}
        </button>
      ) : null}
    </div>
  );
};

export default DarkOSOptimizerHint;
