import { useState, useEffect } from 'react';
import { visibleInterval } from '../utils/visibleInterval'

export const useSecurityScore = () => {
  const [securityScore, setSecurityScore] = useState<number | null>(() => {
    try {
      const raw = localStorage.getItem('darkhub.dashboard.securityScore');
      if (!raw) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.trunc(n))) : null;
    } catch {
      return null;
    }
  });
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
          try {
            localStorage.setItem('darkhub.dashboard.securityScore', String(score));
          } catch {}
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

    const start = window.setTimeout(fetchSecurity, 900);
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
