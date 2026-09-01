import { useI18n } from '../i18n/I18nProvider';
import { useState, useEffect, useCallback } from 'react';

export function useDeepHardware() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDeepInfo = useCallback(async (forceRefresh = false) => {
    if (!window.darkhub) {
      setError('DarkHub API não disponível.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await window.darkhub.system.getDeepHardwareInfo(forceRefresh);
      setData(result);
    } catch (e: any) {
      setError(e.message || 'Falha ao buscar dados de hardware profundo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    const init = async () => {
      if (active) await fetchDeepInfo(false);
    };

    init();

    return () => { active = false; };
  }, [fetchDeepInfo]);

  return { data, loading, error, refresh: () => fetchDeepInfo(true) };
}
