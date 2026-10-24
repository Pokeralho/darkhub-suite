import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Loader2, AlertTriangle, Keyboard, MousePointer, Gamepad2, HardDrive, Camera, Headphones, Usb, Cpu, Upload, History, ShieldCheck } from '../components/icons';
import PageHeader from '../components/ui/PageHeader';
import { useI18n } from '../i18n/I18nProvider';
import type { UsbState, UsbPort } from '../global';

function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative w-9 h-5 shrink-0 rounded-full border transition-colors duration-150 ease-out ${on ? 'bg-blue-500 border-blue-400' : 'bg-zinc-800 border-zinc-700'} disabled:opacity-50`}>
      <span className={`absolute top-[2px] ${on ? 'left-[18px]' : 'left-[2px]'} w-3.5 h-3.5 rounded-full bg-zinc-50 transition-all duration-150 ease-out`} />
    </button>
  );
}

const KIND_ICON: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  input: Keyboard, keyboard: Keyboard, mouse: MousePointer, gamepad: Gamepad2, storage: HardDrive, camera: Camera, audio: Headphones, serial: Cpu, hid: Usb, other: Usb
};
const gb = (b: number) => `${(b / 1073741824).toFixed(1)} GB`;

export default function UsbControl() {
  const { t } = useI18n();
  const [st, setSt] = useState<UsbState | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [revert, setRevert] = useState<{ id: string; name: string; until: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const api = () => window.darkhub?.usb;

  const load = async () => {
    if (!api()) return;
    setLoading(true);
    const r = await api()!.list().catch((e) => ({ ok: false, error: String(e?.message ?? e) } as UsbState));
    setLoading(false);
    if (r.ok) setSt(r); else setMsg({ ok: false, text: r.error ?? 'error' });
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!revert) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.now() > revert.until + 1500) { setRevert(null); void load(); }
    }, 500);
    return () => clearInterval(timer);
  }, [revert]);

  const kindLabel = (k: string) => ({
    input: t('usbx.kind.input', 'Teclado/mouse'), keyboard: t('usbx.kind.keyboard', 'Teclado'), mouse: 'Mouse', gamepad: t('usbx.kind.gamepad', 'Controle'),
    storage: t('usbx.kind.storage', 'Armazenamento'), camera: t('usbx.kind.camera', 'Câmera'), audio: t('usbx.kind.audio', 'Áudio'), serial: t('usbx.kind.serial', 'Serial'),
    hid: t('usbx.kind.hid', 'Dispositivo HID'), other: t('usbx.kind.other', 'Outro')
  } as Record<string, string>)[k] ?? k;

  const toggle = async (p: UsbPort, enabled: boolean) => {
    const input = ['input', 'keyboard', 'mouse'].includes(p.kind);
    if (!enabled && input && !window.confirm(t('usbx.confirmInput', 'Desligar "{n}"? Se for o teclado ou mouse que você está usando, ele volta sozinho em 20 segundos, a menos que você confirme.').replace('{n}', p.name))) return;
    if (!enabled && !input && !window.confirm(t('usbx.confirmOff', 'Desligar "{n}"? Ele continua conectado, mas o Windows para de usá-lo até você ligar de novo.').replace('{n}', p.name))) return;
    setBusy(p.instanceId); setMsg(null);
    const r = await api()!.setDeviceEnabled({ device: { instanceId: p.instanceId, name: p.name, kind: p.kind }, enabled });
    setBusy(null);
    if (!r.ok) setMsg({ ok: false, text: r.error ?? 'error' });
    else if (r.revertInMs) setRevert({ id: p.instanceId, name: p.name, until: Date.now() + r.revertInMs });
    await load();
  };

  const keep = async () => {
    if (!revert) return;
    await api()!.keepDisabled({ instanceId: revert.id });
    setRevert(null);
  };

  const policy = async (key: 'setStorageBlocked' | 'setWriteProtect' | 'setSelectiveSuspend', on: boolean) => {
    setBusy(key); setMsg(null);
    const r = await api()![key]({ on });
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: t('usbx.applied', 'Aplicado.') } : { ok: false, text: r.error ?? 'error' });
    await load();
  };

  const eject = async (letter: string) => {
    setBusy(letter); setMsg(null);
    const r = await api()!.eject({ letter });
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: t('usbx.ejected', '{d} pode ser removida com segurança.').replace('{d}', letter) } : { ok: false, text: r.error ?? 'error' });
    await load();
  };

  const hubs = useMemo(() => {
    const m = new Map<number, UsbPort[]>();
    for (const p of st?.ports ?? []) m.set(p.hub, [...(m.get(p.hub) ?? []), p]);
    return [...m.entries()];
  }, [st]);
  const pol = st?.policies;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      <PageHeader
        title={t('nav.usb', 'Portas USB')}
        subtitle={t('usbx.subtitle', 'O que está ligado em cada porta, desligar um aparelho sem tirar o cabo, regras para pendrives e o histórico de dispositivos de armazenamento.')}
        actions={<button type="button" onClick={() => void load()} disabled={loading} className="dh-btn">{loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}{t('usbx.refresh', 'Atualizar')}</button>}
      />

      {revert && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300/40 bg-amber-300/5 px-4 py-3 text-[13px] text-amber-200">
          <AlertTriangle size={16} />
          <span className="flex-1 min-w-0">{t('usbx.reverting', '"{n}" foi desligado e volta a funcionar em {s} s.').replace('{n}', revert.name).replace('{s}', String(Math.max(0, Math.ceil((revert.until - now) / 1000))))}</span>
          <button type="button" onClick={() => void keep()} className="dh-btn dh-btn-sm">{t('usbx.keepOff', 'Manter desligado')}</button>
        </div>
      )}
      {msg && <p role="status" className={`text-[12.5px] ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>}

      <section className="rounded-xl border border-zinc-800/80 p-4 space-y-3">
        <h2 className="dh-section-title flex items-center gap-2"><ShieldCheck size={14} />{t('usbx.rules', 'Regras')}</h2>
        {[
          { key: 'setStorageBlocked' as const, on: Boolean(pol?.storageBlocked), title: t('usbx.block', 'Bloquear pendrives e HDs USB'), help: t('usbx.blockHelp', 'Novos dispositivos de armazenamento USB deixam de funcionar. Teclado, mouse, controle e áudio continuam normais. Vale para o que for conectado depois.') },
          { key: 'setWriteProtect' as const, on: Boolean(pol?.writeProtect), title: t('usbx.readonly', 'Pendrives só para leitura'), help: t('usbx.readonlyHelp', 'Dá para abrir e copiar arquivos do pendrive, mas não gravar nele. Vale para o que for conectado depois.') },
          { key: 'setSelectiveSuspend' as const, on: pol?.selectiveSuspend === true, title: t('usbx.suspend', 'Suspensão seletiva de USB'), help: t('usbx.suspendHelp', 'O Windows desliga portas paradas para economizar energia. Desligado, mouse e controle não "acordam" com atraso; bom para jogos.') }
        ].map((x) => (
          <div key={x.key} className="flex items-start gap-3">
            <Switch on={x.on} disabled={!st || busy !== null} onChange={(v) => void policy(x.key, v)} label={x.title} />
            <div className="min-w-0"><p className="text-[13px] text-zinc-100">{x.title}</p><p className="dh-help">{x.help}</p></div>
            {busy === x.key && <Loader2 size={14} className="animate-spin text-zinc-400" />}
          </div>
        ))}
        {st && !st.elevated && <p className="dh-help">{t('usbx.admin', 'Essas mudanças pedem permissão de administrador.')}</p>}
      </section>

      <section className="space-y-3">
        <h2 className="dh-section-title">{t('usbx.devices', 'Aparelhos conectados')}</h2>
        {!st && <div className="h-24 rounded-xl bg-zinc-900 animate-pulse" />}
        {st && !hubs.length && <p className="dh-help">{t('usbx.none', 'Nenhum aparelho USB encontrado.')}</p>}
        {hubs.map(([hub, ports]) => (
          <div key={hub} className="rounded-xl border border-zinc-800/80">
            <p className="px-3 pt-2.5 pb-1 text-[11.5px] text-zinc-500">{t('usbx.hub', 'Hub {h}').replace('{h}', String(hub))}</p>
            <div className="divide-y divide-zinc-900">
              {ports.map((p) => {
                const Icon = KIND_ICON[p.kind] ?? Usb;
                return (
                  <div key={p.instanceId} className="flex items-center gap-3 px-3 py-2.5 min-w-0">
                    <span className="w-14 shrink-0 font-mono text-[11.5px] text-zinc-500">{t('usbx.port', 'Porta {p}').replace('{p}', String(p.port))}</span>
                    <Icon size={16} className={p.enabled ? 'text-zinc-300' : 'text-zinc-600'} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-[13px] truncate ${p.enabled ? 'text-zinc-100' : 'text-zinc-500 line-through'}`} title={p.instanceId}>{p.name}</p>
                      <p className="text-[11.5px] text-zinc-500 truncate" title={p.children.map((c) => c.name).join('\n')}>{kindLabel(p.kind)}{p.children.length ? ` · ${t('usbx.functions', '{n} funções').replace('{n}', String(p.children.length))}` : ''}</p>
                    </div>
                    {busy === p.instanceId && <Loader2 size={14} className="animate-spin text-zinc-400" />}
                    <Switch on={p.enabled} disabled={busy !== null} onChange={(v) => void toggle(p, v)} label={p.name} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <p className="dh-help">{t('usbx.controllers', 'Controladoras e hubs não aparecem aqui de propósito: desligar um deles pode cortar teclado e mouse ao mesmo tempo.')}</p>
      </section>

      {(st?.drives?.length ?? 0) > 0 && (
        <section className="space-y-2">
          <h2 className="dh-section-title">{t('usbx.drives', 'Unidades removíveis')}</h2>
          <div className="rounded-xl border border-zinc-800/80 divide-y divide-zinc-900">
            {st!.drives!.map((d) => (
              <div key={d.letter} className="flex items-center gap-3 px-3 py-2.5 text-[13px]">
                <HardDrive size={16} className="text-zinc-400" />
                <span className="text-zinc-100">{d.letter} {d.label}</span>
                <span className="text-zinc-500 text-[12px]">{t('usbx.free', '{f} livres de {s}').replace('{f}', gb(d.free)).replace('{s}', gb(d.size))}</span>
                <button type="button" onClick={() => void eject(d.letter)} disabled={busy !== null} className="dh-btn dh-btn-sm ml-auto">{busy === d.letter ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}{t('usbx.eject', 'Remover com segurança')}</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="dh-section-title flex items-center gap-2"><History size={14} />{t('usbx.history', 'Pendrives e HDs já conectados neste PC')}</h2>
        {!(st?.history?.length) ? <p className="dh-help">{t('usbx.noHistory', 'Nenhum registro.')}</p> : (
          <div className="rounded-xl border border-zinc-800/80 divide-y divide-zinc-900">
            {st!.history!.map((h) => (
              <div key={h.instanceId} className="flex items-center gap-3 px-3 py-2 text-[12.5px] min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${h.present ? 'bg-emerald-400' : 'bg-zinc-700'}`} title={h.present ? t('usbx.connected', 'conectado') : ''} />
                <span className="text-zinc-200 truncate flex-1">{h.name}</span>
                <span className="text-zinc-500 shrink-0">{h.lastArrivalAt ? t('usbx.lastSeen', 'última conexão {d}').replace('{d}', new Date(h.lastArrivalAt).toLocaleString()) : ''}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
