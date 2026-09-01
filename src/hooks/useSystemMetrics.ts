import { useI18n } from '../i18n/I18nProvider';
import { useState, useEffect } from 'react';

export const useSystemMetrics = () => {
  const { t } = useI18n();
  const [metrics, setMetrics] = useState<any>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    window.darkhub?.hardware?.startPolling?.().catch(() => {});

    if (window.darkhub?.hardware?.onUpdate) {

      unsubscribe = window.darkhub.hardware.onUpdate((data: any) => {
        setMetrics((prev: any) => (prev ? { ...prev, ...data } : data));
      });
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
      window.darkhub?.hardware?.stopPolling?.().catch(() => {});
    };
  }, []);

  return metrics;
};
