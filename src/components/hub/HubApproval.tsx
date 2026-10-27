import React, { useEffect, useState } from 'react';
import { Sparkles } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';
import HubPreview from './HubPreview';
import type { HubEvent } from '../../global';

type Approval = Extract<HubEvent, { type: 'approval' }>;

/** An AI assistant (MCP) wants to change this PC: show exactly what, wait for the user. Mounted once, on every page. */
export default function HubApproval() {
  const { t } = useI18n();
  const [queue, setQueue] = useState<Approval[]>([]);
  useEffect(() => window.darkhub?.hub?.onEvent?.((m) => {
    if (m.type === 'approval') setQueue((q) => [...q, m]);
    if (m.type === 'approvalClosed') setQueue((q) => q.filter((x) => x.id !== m.id));
  }), []);
  const cur = queue[0];
  if (!cur) return null;
  const answer = (ok: boolean) => { void window.darkhub?.hub?.mcp.answer({ id: cur.id, ok }); setQueue((q) => q.slice(1)); };
  const u = cur.preview?.uninstall;
  return (
    <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="hub-approval-title">
      <div className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl">
        <div className="px-4 py-3 border-b border-zinc-800 space-y-1">
          <p id="hub-approval-title" className="flex items-center gap-2 text-[14px] font-semibold text-zinc-50"><Sparkles size={14} />{cur.title}</p>
          <p className="dh-help">{t('hub.mcp.asks', 'Pedido de')} <span className="text-zinc-200">{cur.client}</span> {t('hub.mcp.asksVia', 'pelo MCP. Nada muda se você recusar.')}</p>
        </div>
        {u ? (
          <p className="px-4 py-3 text-[13px] text-zinc-300">{u.id} v{u.version} · {u.steps} {t('hub.changes', 'mudanças')} — {t('hub.mcp.uninstallHint', 'cada valor volta ao que era antes do pacote.')}</p>
        ) : cur.preview?.ok ? <HubPreview view={cur.preview} tier={cur.preview.remote?.tier} /> : null}
        <div className="px-4 py-3 border-t border-zinc-800 flex flex-wrap gap-2 justify-end">
          <button type="button" className="dh-btn dh-btn-sm" onClick={() => answer(false)}>{t('hub.mcp.deny', 'Recusar')}</button>
          <button type="button" className="dh-btn dh-btn-sm dh-btn-primary" autoFocus onClick={() => answer(true)}>{t('hub.mcp.allow', 'Aprovar')}</button>
        </div>
      </div>
    </div>
  );
}
