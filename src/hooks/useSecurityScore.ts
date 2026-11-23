import { useState, useEffect } from 'react';
import { visibleInterval } from '../utils/visibleInterval'

export const useSecurityScore = () => {
  // No cached value: an old score shown as if it were current was misleading. "Calculating..." until the live audit.
  const [securityScore, setSecurityScore] = useState<number | null>(null);
  const [securityChecks, setSecurityChecks] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    let disabled = false;

    const fetchSecurity = async () => {
      if (!window.darkhub) return;
      try {
        const res = await window.darkhub.security.getSecurityScore();
        if (!alive) return;
        if (res?.ok && typeof res?.score === 'number') {
          const score = Math.max(0, Math.min(100, Math.trunc(res.score)));
          setSecurityScore(score);
          if (Array.isArray(res?.checks)) setSecurityChecks(res.checks);
        } else {
          setSecurityScore(null);
          setSecurityChecks(null);
        }
      } catch (e) {
        if (!alive) return;
        const msg = (e as any)?.message ?? String(e ?? '');
        if (String(msg).includes('No handler registered')) {
          disabled = true;
        }
        setSecurityScore(null);
        setSecurityChecks(null);
        if (import.meta.env.DEV) {
          console.warn('[Dashboard] Falha ao buscar Security Score:', e);
        }
      } finally {
        if (alive) setLoading(false);
      }
    };

    const start = window.setTimeout(fetchSecurity, 300);
    const stopPolling = visibleInterval(() => {
      if (disabled) return;
      return fetchSecurity();
    }, 60_000);

    return () => {
      alive = false;
      window.clearTimeout(start);
      stopPolling();
    };
  }, []);

  return { securityScore, securityChecks, loading };
};
