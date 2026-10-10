import { useState, useCallback } from 'react';

export function useDeepHardware() {
  const [categories, setCategories] = useState<Record<string, any>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [errorMap, setErrorMap] = useState<Record<string, string | null>>({});

  const fetchCategory = useCallback(async (cat: string, forceRefresh = false) => {
    if (!window.darkhub?.system?.getDeepCategory) return null;
    if (categories[cat] && !forceRefresh) return categories[cat];

    setLoadingMap(prev => ({ ...prev, [cat]: true }));
    setErrorMap(prev => ({ ...prev, [cat]: null }));

    try {
      const res = await window.darkhub.system.getDeepCategory(cat, forceRefresh);
      setCategories(prev => {
        const next = { ...prev, [cat]: res };
        if (cat === 'mobo') next['mainboard'] = res;
        if (cat === 'mainboard') next['mobo'] = res;
        if (cat === 'ram') next['memory'] = res;
        if (cat === 'memory') next['ram'] = res;
        return next;
      });
      return res;
    } catch (e: any) {
      setErrorMap(prev => ({ ...prev, [cat]: e.message || 'Erro ao carregar dados' }));
      return null;
    } finally {
      setLoadingMap(prev => ({ ...prev, [cat]: false }));
    }
  }, [categories]);

  return {
    data: categories,
    categories,
    loadingMap,
    errorMap,
    fetchCategory,
    refreshCategory: (cat: string) => fetchCategory(cat, true)
  };
}
