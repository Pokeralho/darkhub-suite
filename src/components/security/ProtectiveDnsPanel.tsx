import React, { useEffect, useState } from 'react';
import { Loader2, ShieldCheck, RotateCcw, Globe } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';

// Filtering resolvers: blocking happens on the server, so the list size costs nothing on this PC (unlike hosts).
const PROVIDERS = [
  { id: 'quad9', name: 'Quad9', primary: '9.9.9.9', secondary: '149.112.112.112', blocks: 'malware' },
  { id: 'cf-security', name: 'Cloudflare Security', primary: '1.1.1.2', secondary: '1.0.0.2', blocks: 'malware' },
  { id: 'cf-family', name: 'Cloudflare Family', primary: '1.1.1.3', secondary: '1.0.0.3', blocks: 'family' },
  { id: 'adguard', name: 'AdGuard DNS', primary: '94.140.14.14', secondary: '94.140.15.15', blocks: 'ads' }
] as const;

/** Advanced Security: switch the PC to a DNS that blocks threats server-side, and back. Reuses the optimizer's DNS engine. */
export default function ProtectiveDnsPanel() {
  const { t } = useI18n();
  const [servers, setServers] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const opt = () => window.darkhub?.optimizer;

  const load = async () => {
    const r = await opt()?.getDnsState().catch(() => null);
    setServers(r?.ok ? (r.servers ?? []) : []);
  };
  useEffect(() => { void load(); }, []);

  const active = PROVIDERS.find((p) => servers?.includes(p.primary));
  const blocks = (b: string) => ({
    malware: t('secx.dns.malware', 'Bloqueia malware e phishing'),
    family: t('secx.dns.family', 'Malware, phishing e conteúdo adulto'),
    ads: t('secx.dns.ads', 'Anúncios, rastreadores e malware')
  } as Record<string, string>)[b];

  const apply = async (p: (typeof PROVIDERS)[number]) => {
    setBusy(p.id); setMsg(null);
    const r = await opt()?.applyDns({ primary: p.primary, secondary: p.secondary }).catch((e: any) => ({ ok: false, error: String(e?.message ?? e) }));
    setBusy(null);
    setMsg(r?.ok ? { ok: true, text: t('secx.dns.applied', '{n} ativado. O DNS anterior foi guardado para restaurar.').replace('{n}', p.name) } : { ok: false, text: r?.error ?? 'error' });
    await load();
  };

  const undo = async () => {
    setBusy('undo'); setMsg(null);
    const r = await opt()?.undoDns({}).catch((e: any) => ({ ok: false, error: String(e?.message ?? e) }));
    setBusy(null);
    setMsg(r?.ok ? { ok: true, text: t('secx.dns.restored', 'DNS anterior restaurado.') } : { ok: false, text: r?.error ?? 'error' });
    await load();
  };

  return (
    <section>
      <h3 className="dh-section-title flex items-center gap-2"><Globe size={14} />{t('secx.dns.title', 'DNS com proteção')}</h3>
      <p className="dh-help mt-1 max-w-[80ch]">{t('secx.dns.desc', 'A forma certa de bloquear centenas de milhares de domínios: o próprio servidor de DNS recusa os endereços perigosos, sem custo nenhum para o PC. Listas grandes no arquivo hosts fazem o Windows ficar sem DNS por minutos a cada mudança.')}</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {PROVIDERS.map((p) => (
          <div key={p.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${active?.id === p.id ? 'border-blue-400/60 bg-zinc-800/40' : 'border-zinc-800'}`}>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-zinc-100">{p.name} <span className="font-mono text-[11.5px] text-zinc-500">{p.primary}</span></p>
              <p className="text-[11.5px] text-zinc-500">{blocks(p.blocks)}</p>
            </div>
            {active?.id === p.id ? (
              <span className="flex items-center gap-1 text-[12px] text-emerald-400"><ShieldCheck size={13} />{t('secx.active', 'Ativo')}</span>
            ) : (
              <button type="button" className="dh-btn dh-btn-sm" disabled={busy !== null || servers === null} onClick={() => void apply(p)}>
                {busy === p.id ? <Loader2 size={13} className="animate-spin" /> : null}{t('secx.dns.use', 'Usar')}
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[12.5px]">
        <span className="text-zinc-500">{t('secx.dns.current', 'DNS atual:')} <span className="font-mono text-zinc-300">{servers === null ? '…' : servers.length ? servers.join(', ') : t('secx.dns.auto', 'automático (do roteador)')}</span></span>
        <button type="button" className="dh-btn dh-btn-ghost dh-btn-sm" disabled={busy !== null} onClick={() => void undo()}>
          {busy === 'undo' ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}{t('secx.dns.undo', 'Restaurar DNS anterior')}
        </button>
      </div>
      {msg && <p role="status" className={`mt-2 text-[12.5px] ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>}
    </section>
  );
}
