import React from 'react';
import ProtectiveDnsPanel from './ProtectiveDnsPanel';
import { Loader2, RefreshCw, ShieldCheck, RotateCcw, AlertTriangle, DownloadCloud } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';
import { SectionHead, OnOff, fmtDate, fmtNum, type Translate } from './ui';

export type FeedSource = {
  id: string; kind: 'hosts' | 'ip' | 'hash'; name: string; url: string; homepage: string; license: string; note?: string | null;
  enabled: boolean; updatedAt?: string | null; count?: number; upstreamDate?: string | null; error?: string | null;
};

type Props = {
  status: any | null;
  busy: string | null;
  run: (key: string, fn: () => Promise<any>, okMsg: (res: any) => string) => Promise<void>;
  reload: () => Promise<void>;
};

const KINDS: { kind: FeedSource['kind']; titleKey: string; title: string; descKey: string; desc: string }[] = [
  {
    kind: 'hosts', titleKey: 'secx.bl.hostsTitle', title: 'Bloqueio por DNS (arquivo hosts)',
    descKey: 'secx.bl.hostsDesc', desc: 'Domínios de malware, phishing e anúncios vão para 0.0.0.0 num bloco delimitado do arquivo hosts. Suas entradas ficam intactas; Restaurar remove só o bloco do DarkHub. O hosts bloqueia o nome exato (não subdomínios).'
  },
  {
    kind: 'ip', titleKey: 'secx.bl.ipTitle', title: 'Bloqueio de IPs no Firewall do Windows',
    descKey: 'secx.bl.ipDesc', desc: 'Cria poucas regras de bloqueio (entrada e saída, até 1000 endereços cada) no grupo "DarkHub Community IP Blocklist". Endereços privados e da rede local nunca são bloqueados.'
  },
  {
    kind: 'hash', titleKey: 'secx.bl.hashTitle', title: 'Hashes de malware para a proteção em tempo real',
    descKey: 'secx.bl.hashDesc', desc: 'Hashes SHA-256 de amostras conhecidas são somados às regras de arquivos usadas pela Proteção em tempo real (tela Tempo real). Nada é alterado no Windows.'
  }
];

function SourceRow({ s, t, disabled, onToggle, onUpdate, updating }: { s: FeedSource; t: Translate; disabled: boolean; onToggle: (v: boolean) => void; onUpdate: () => void; updating: boolean }) {
  return (
    <tr className="align-top hover:bg-zinc-900/40">
      <td className="py-2.5 pr-3 w-8">
        <input type="checkbox" checked={s.enabled} disabled={disabled} onChange={(e) => onToggle(e.target.checked)} aria-label={s.name} className="mt-0.5 accent-blue-500" />
      </td>
      <td className="py-2.5 pr-4 min-w-0">
        <span className="text-zinc-100">{s.name}</span>
        {s.note === 'includesUnified' ? <span className="dh-tag ml-2">{t('secx.bl.includesUnified', 'inclui a unificada')}</span> : null}
        {s.note === 'large' ? <span className="dh-tag ml-2 text-amber-400">{t('secx.bl.large', 'lista grande')}</span> : null}
        <span className="block font-mono text-[11px] text-zinc-500 break-all select-text">{s.url}</span>
        <span className="block text-[11px] text-zinc-500">{t('secx.bl.license', 'Licença')}: <span className="text-zinc-400">{s.license}</span> · <span className="font-mono select-text">{s.homepage}</span></span>
        {s.error ? <span className="mt-0.5 flex items-center gap-1 text-[11px] text-red-400"><AlertTriangle size={12} /> {s.error}</span> : null}
      </td>
      <td className="py-2.5 pr-4 text-right font-mono text-zinc-300 whitespace-nowrap">{s.updatedAt ? fmtNum(s.count) : <span className="text-zinc-600">-</span>}</td>
      <td className="py-2.5 pr-4 text-[11.5px] text-zinc-400 whitespace-nowrap">
        {s.updatedAt ? fmtDate(s.updatedAt) : <span className="text-zinc-600">{t('secx.bl.never', 'nunca baixada')}</span>}
        {s.upstreamDate ? <span className="block text-zinc-600">{t('secx.bl.upstream', 'publicada')}: {s.upstreamDate}</span> : null}
      </td>
      <td className="py-2 text-right">
        <button onClick={onUpdate} disabled={disabled} className="dh-btn dh-btn-ghost dh-btn-sm" title={t('secx.bl.updateOne', 'Baixar agora')}>
          {updating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </td>
    </tr>
  );
}

export default function BlocklistsPanel({ status, busy, run, reload }: Props) {
  const { t } = useI18n();
  const sources: FeedSource[] = status?.sources ?? [];
  const working = busy !== null;
  const sec = window.darkhub?.security;

  const toggle = async (id: string, enabled: boolean) => {
    await sec?.advSetFeedEnabled({ id, enabled });
    await reload();
  };

  const updateMsg = (res: any) => {
    const ok = (res?.results ?? []).filter((r: any) => r.ok).length;
    const total = (res?.results ?? []).length;
    return t('secx.bl.updated', '{ok} de {total} listas atualizadas.').replace('{ok}', String(ok)).replace('{total}', String(total));
  };

  const sectionState = (kind: FeedSource['kind']) => {
    if (kind === 'hosts') {
      const h = status?.hosts;
      return { active: Boolean(h?.present), count: h?.entries ?? 0, at: h?.appliedAt };
    }
    if (kind === 'ip') {
      const f = status?.firewall;
      return { active: (f?.rules ?? 0) > 0, count: f?.addresses ?? 0, at: f?.appliedAt, rules: f?.rules ?? 0 };
    }
    const h = status?.hashes;
    return { active: Boolean(h?.active), count: h?.count ?? 0, at: h?.appliedAt };
  };

  const actions = {
    hosts: { apply: () => sec.advApplyHosts(), restore: () => sec.advRestoreHosts() },
    ip: { apply: () => sec.advApplyFirewall(), restore: () => sec.advRestoreFirewall() },
    hash: { apply: () => sec.advApplyHashes(), restore: () => sec.advRestoreHashes() }
  } as const;

  const enabledCount = (kind: FeedSource['kind']) => sources.filter((s) => s.kind === kind && s.enabled).reduce((a, s) => a + (s.count ?? 0), 0);

  return (
    <div className="space-y-10 animate-in">
      <ProtectiveDnsPanel />
      {KINDS.map(({ kind, titleKey, title, descKey, desc }) => {
        const st = sectionState(kind);
        const list = sources.filter((s) => s.kind === kind);
        const est = enabledCount(kind);
        const warnBig = kind === 'hosts' && est > (status?.hosts?.warnAbove ?? 5000);
        return (
          <section key={kind}>
            <SectionHead
              title={t(titleKey, title)}
              desc={t(descKey, desc)}
              actions={
                <>
                  <button disabled={working} className="dh-btn dh-btn-ghost" onClick={() => run(`update:${kind}`, () => sec.advUpdateFeeds({ ids: list.filter((s) => s.enabled).map((s) => s.id) }), updateMsg)}>
                    {busy === `update:${kind}` ? <Loader2 size={14} className="animate-spin" /> : <DownloadCloud size={14} />} {t('secx.bl.updateEnabled', 'Atualizar listas')}
                  </button>
                  <button disabled={working} className="dh-btn dh-btn-accent" onClick={() => run(`apply:${kind}`, actions[kind].apply, (r) => t('secx.bl.applied', 'Aplicado: {n} entradas.').replace('{n}', fmtNum(r?.count ?? r?.addresses ?? 0)))}>
                    {busy === `apply:${kind}` ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} {st.active ? t('secx.bl.reapply', 'Reaplicar') : t('secx.apply', 'Aplicar')}
                  </button>
                  <button disabled={working || !st.active} className="dh-btn" onClick={() => run(`restore:${kind}`, actions[kind].restore, () => t('secx.restored', 'Restaurado ao estado anterior.'))}>
                    {busy === `restore:${kind}` ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} {t('secx.restore', 'Restaurar')}
                  </button>
                </>
              }
            />
            <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-[12.5px]">
              <OnOff on={st.active} onLabel={t('secx.active', 'Ativo')} offLabel={t('secx.inactive', 'Inativo')} />
              {st.active ? <span className="text-zinc-400"><span className="font-mono text-zinc-200">{fmtNum(st.count)}</span> {kind === 'ip' ? t('secx.bl.addresses', 'endereços') : kind === 'hash' ? t('secx.bl.hashes', 'hashes') : t('secx.bl.domains', 'domínios')}</span> : null}
              {kind === 'ip' && st.active ? <span className="text-zinc-400"><span className="font-mono text-zinc-200">{st.rules}</span> {t('secx.bl.rules', 'regras')}</span> : null}
              {st.at ? <span className="text-zinc-500">{t('secx.lastApplied', 'Aplicado em')} {fmtDate(st.at)}</span> : null}
            </div>
            {warnBig ? (
              <p className="mb-3 flex items-start gap-1.5 text-[12px] text-amber-400"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{t('secx.bl.bigWarn', 'Muitas entradas no hosts deixam o serviço Cliente DNS do Windows mais lento. O limite é 10.000; para bloqueio amplo use o DNS com proteção.')}</p>
            ) : null}
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="text-[11px] text-zinc-500 border-b border-zinc-800/80">
                  <th className="py-2 pr-3 font-normal"><span className="sr-only">{t('secx.bl.use', 'Usar')}</span></th>
                  <th className="py-2 pr-4 font-normal">{t('secx.bl.source', 'Fonte')}</th>
                  <th className="py-2 pr-4 font-normal text-right">{t('secx.bl.entries', 'Entradas')}</th>
                  <th className="py-2 pr-4 font-normal">{t('secx.bl.lastUpdate', 'Última atualização')}</th>
                  <th className="py-2 font-normal"><span className="sr-only">{t('secx.bl.updateOne', 'Baixar agora')}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {list.map((s) => (
                  <SourceRow
                    key={s.id}
                    s={s}
                    t={t}
                    disabled={working}
                    updating={busy === `update:${s.id}`}
                    onToggle={(v) => toggle(s.id, v)}
                    onUpdate={() => run(`update:${s.id}`, () => sec.advUpdateFeeds({ ids: [s.id] }), updateMsg)}
                  />
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
      <p className="dh-help">{t('secx.bl.footer', 'As listas são baixadas por HTTPS só dos servidores listados, com limite de tamanho, e tratadas apenas como dados: nada baixado é executado. Domínios da Microsoft/Windows Update e dos próprios servidores de listas nunca são bloqueados.')}</p>
    </div>
  );
}
