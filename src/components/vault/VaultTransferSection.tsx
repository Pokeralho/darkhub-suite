import React, { useState } from 'react';
import { Upload, Download, Copy, Check, Loader2, X } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';

/** Move the vault to another PC through Susuya: send needs the vault unlocked; receive works on a fresh PC too. */
export default function VaultTransferSection({ unlocked, onReceived }: { unlocked: boolean; onReceived: () => void }) {
  const { t } = useI18n();
  const [sent, setSent] = useState<{ code: string; expiresAt: number; qr?: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'send' | 'receive' | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const api = () => window.darkhub?.vault;

  const send = async () => {
    setBusy('send'); setMsg(null);
    const r = await api()!.transferSend().catch((e) => ({ ok: false, error: String(e?.message ?? e) } as { ok: boolean; error?: string; code?: string; expiresAt?: number }));
    setBusy(null);
    if (!r.ok || !r.code) { setMsg({ ok: false, text: r.error ?? 'error' }); return; }
    const qr = await window.darkhub?.share?.qr(r.code).catch(() => null);
    setSent({ code: r.code, expiresAt: r.expiresAt ?? Date.now() + 3600000, qr: qr?.dataUrl });
  };

  const cancel = async () => {
    await api()!.transferCancel();
    setSent(null);
    setMsg({ ok: true, text: t('vaultx.transfer.cancelled', 'A cópia no Susuya foi apagada.') });
  };

  const receive = async () => {
    if (!window.confirm(t('vaultx.transfer.confirmReceive', 'Substituir o cofre deste PC pelo recebido? Uma cópia do cofre atual é guardada antes. O cofre recebido abre com a senha mestra do outro PC.'))) return;
    setBusy('receive'); setMsg(null);
    const r = await api()!.transferReceive({ code: code.trim() }).catch((e) => ({ ok: false, error: String(e?.message ?? e) }));
    setBusy(null);
    if (r.ok) { setCode(''); setMsg({ ok: true, text: t('vaultx.transfer.received', 'Cofre recebido. Desbloqueie com a senha mestra do PC de origem.') }); onReceived(); return; }
    setMsg({ ok: false, text: r.error === 'expired' ? t('vaultx.transfer.expired', 'Esse código expirou ou já foi cancelado. Gere outro no PC de origem.') : /invalid|inválid/i.test(String(r.error)) ? t('vaultx.transfer.invalid', 'Código inválido ou arquivo corrompido.') : String(r.error) });
  };

  const copy = () => { if (sent) { void navigator.clipboard.writeText(sent.code); setCopied(true); setTimeout(() => setCopied(false), 1500); } };

  return (
    <section className="mt-6 rounded-xl border border-zinc-800/80 p-4 space-y-3">
      <h2 className="dh-section-title">{t('vaultx.transfer.title', 'Levar o cofre para outro PC')}</h2>
      <p className="dh-help max-w-[80ch]">{t('vaultx.transfer.help', 'O cofre (já protegido pela senha mestra) é criptografado de novo com uma chave de uso único e fica no Susuya por 1 hora. A chave vai só dentro do código: o servidor nunca consegue abrir o arquivo.')}</p>

      {unlocked && !sent && (
        <button type="button" onClick={() => void send()} disabled={busy !== null} className="dh-btn">
          {busy === 'send' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}{t('vaultx.transfer.send', 'Gerar código de transferência')}
        </button>
      )}
      {sent && (
        <div className="flex flex-wrap items-start gap-4">
          {sent.qr && <img src={sent.qr} alt="" className="w-32 h-32 rounded-md bg-white p-1" />}
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-[12.5px] text-zinc-300">{t('vaultx.transfer.codeHelp', 'No outro PC, abra o Cofre de Senhas e cole este código em "Receber". Válido até {h}.').replace('{h}', new Date(sent.expiresAt).toLocaleTimeString())}</p>
            <code className="block font-mono text-[12px] text-zinc-100 break-all rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5">{sent.code}</code>
            <div className="flex gap-2">
              <button type="button" onClick={copy} className="dh-btn dh-btn-sm">{copied ? <Check size={13} /> : <Copy size={13} />}{t('vaultx.transfer.copy', 'Copiar código')}</button>
              <button type="button" onClick={() => void cancel()} className="dh-btn dh-btn-ghost dh-btn-sm"><X size={13} />{t('vaultx.transfer.cancel', 'Apagar agora')}</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('vaultx.transfer.codePh', 'Cole aqui o código recebido (dhv1....)')} spellCheck={false} autoComplete="off" className="dh-input flex-1 min-w-[260px] font-mono text-[12px]" />
        <button type="button" onClick={() => void receive()} disabled={busy !== null || !code.trim().startsWith('dhv1.')} className="dh-btn">
          {busy === 'receive' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}{t('vaultx.transfer.receive', 'Receber')}
        </button>
      </div>
      {msg && <p role="status" className={`text-[12.5px] ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>}
    </section>
  );
}
