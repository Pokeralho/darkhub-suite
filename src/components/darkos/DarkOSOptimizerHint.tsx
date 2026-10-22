import React, { useEffect, useState } from 'react';
import { DarkHubMark } from '../icons';
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
    <div className="rounded-lg border border-zinc-800/80 px-3 py-2 flex items-center gap-3">
      <DarkHubMark size={16} className="text-zinc-300 shrink-0" />
      <p className="text-[12.5px] text-zinc-300 flex-1 min-w-0">
        {t('darkos.optimizerHint', 'You are on DarkOS. System tweaks are managed in the DarkOS area.')}
      </p>
      {onNavigate ? (
        <button
          onClick={() => onNavigate('darkos')}
          className="dh-btn dh-btn-sm shrink-0"
        >
          {t('darkos.optimizerHint.open', 'Open DarkOS Center')}
        </button>
      ) : null}
    </div>
  );
};

export default DarkOSOptimizerHint;
