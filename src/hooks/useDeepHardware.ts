import { useState, useCallback, useEffect, useRef } from 'react';

const ALIASES: Record<string, string> = { mobo: 'mainboard', mainboard: 'mobo', ram: 'memory', memory: 'ram' };

type DeepCategoryApi = (cat: string, forceRefresh?: boolean) => Promise<any>;

function getDeepCategoryApi(): DeepCategoryApi | null {
  // Read defensively: the preload typing may lag behind the bridge.
  const sys = (window as unknown as { darkhub?: { system?: { getDeepCategory?: DeepCategoryApi } } }).darkhub?.system;
  return typeof sys?.getDeepCategory === 'function' ? sys.getDeepCategory : null;
}

export function useDeepHardware() {
  const [categories, setCategories] = useState<Record<string, any>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [errorMap, setErrorMap] = useState<Record<string, string | null>>({});

  // Refs keep fetchCategory stable (it used to change on every fetch, re-firing
  // consumers' effects) and dedupe concurrent requests for the same category.
  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;
  const inFlight = useRef(new Map<string, Promise<any>>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const fetchCategory = useCallback(async (cat: string, forceRefresh = false) => {
    const api = getDeepCategoryApi();
    if (!api) return null;
    if (categoriesRef.current[cat] && !forceRefresh) return categoriesRef.current[cat];
    const pending = inFlight.current.get(cat);
    if (pending && !forceRefresh) return pending;

    setLoadingMap(prev => ({ ...prev, [cat]: true }));
    setErrorMap(prev => ({ ...prev, [cat]: null }));

    let run: Promise<any> | null = null;
    run = (async () => {
      try {
        const res = await api(cat, forceRefresh);
        if (mounted.current) {
          setCategories(prev => {
            const next = { ...prev, [cat]: res };
            const alias = ALIASES[cat];
            if (alias) next[alias] = res;
            return next;
          });
        }
        return res;
      } catch (e: any) {
        if (mounted.current) setErrorMap(prev => ({ ...prev, [cat]: e?.message || 'Erro ao carregar dados' }));
        return null;
      } finally {
        if (inFlight.current.get(cat) === run) inFlight.current.delete(cat);
        if (mounted.current) setLoadingMap(prev => ({ ...prev, [cat]: false }));
      }
    })();
    inFlight.current.set(cat, run);
    return run;
  }, []);

  const refreshCategory = useCallback((cat: string) => fetchCategory(cat, true), [fetchCategory]);

  return {
    data: categories,
    categories,
    loadingMap,
    errorMap,
    fetchCategory,
    refreshCategory
  };
}
