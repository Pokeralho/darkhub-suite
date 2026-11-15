import React, { useState } from 'react';
import { Plus, Route, Edit3, Trash2, Loader2, AlertTriangle } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';
import type { SshTunnel, SshTunnelKind } from '../../global';
import { Drawer, Field, EmptyState, errText, fmtBytes, type VaultProps } from './ui';
import { useSshStore } from './sshStore';

function Switch({ on, busy, onChange, label }: { on: boolean; busy?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={busy} onClick={() => onChange(!on)}
      className={`relative w-9 h-5 shrink-0 rounded-full border transition-colors duration-150 ease-out ${on ? 'bg-blue-500 border-blue-400' : 'bg-zinc-800 border-zinc-700'} disabled:opacity-50`}>
      <span className={`absolute top-[2px] ${on ? 'left-[18px]' : 'left-[2px]'} w-3.5 h-3.5 rounded-full bg-zinc-50 transition-all duration-150 ease-out`} />
    </button>
  );
}

function TunnelDrawer({ vault, reload, tunnel, onClose }: VaultProps & { tunnel: Partial<SshTunnel>; onClose: () => void }) {
  const { t } = useI18n();
  const [f, setF] = useState<Partial<SshTunnel>>({ kind: 'local', bindAddress: '127.0.0.1', hostId: vault.hosts[0]?.id, ...tunnel });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<SshTunnel>) => setF((x) => ({ ...x, ...p }));
  const save = async () => {
    setBusy(true); setErr('');
    const r = await window.darkhub.ssh.saveTunnel({
      id: f.id, hostId: f.hostId ?? '', label: f.label, kind: f.kind as SshTunnelKind, bindAddress: f.bindAddress, bindPort: Number(f.bindPort),
      targetHost: f.kind === 'dynamic' ? null : f.targetHost, targetPort: f.kind === 'dynamic' ? null : Number(f.targetPort), autoStart: f.autoStart
    });
    setBusy(false);
    if (!r.ok) { setErr(errText(r)); return; }
    await reload();
    onClose();
  };
  const kinds: { id: SshTunnelKind; name: string; help: string }[] = [
    { id: 'local', name: t('ssh.tun.local', 'Local (-L)'), help: t('ssh.tun.localHelp', 'Uma porta deste PC leva a um serviço acessível pelo servidor (ex.: banco de dados interno).') },
    { id: 'remote', name: t('ssh.tun.remote', 'Remoto (-R)'), help: t('ssh.tun.remoteHelp', 'Uma porta do servidor leva a um serviço deste PC ou da sua rede.') },
    { id: 'dynamic', name: t('ssh.tun.dynamic', 'Dinâmico SOCKS5 (-D)'), help: t('ssh.tun.dynamicHelp', 'Um proxy SOCKS5 local: o navegador ou app sai pela rede do servidor.') }
  ];
  return (
    <Drawer title={f.id ? t('ssh.tun.edit', 'Editar túnel') : t('ssh.tun.new', 'Novo túnel')} onClose={onClose}
      footer={<><button type="button" className="dh-btn" onClick={onClose}>{t('ssh.cancel', 'Cancelar')}</button><button type="button" className="dh-btn dh-btn-primary" disabled={busy || !f.hostId || !f.bindPort} onClick={save}>{busy ? <Loader2 size={14} className="animate-spin" /> : null}{t('ssh.save', 'Salvar')}</button></>}>
      <div className="grid grid-cols-3 gap-2">
        {kinds.map((k) => (
          <button type="button" key={k.id} onClick={() => set({ kind: k.id })} className={`dh-card p-2 text-left text-[12.5px] ${f.kind === k.id ? 'border-blue-500/60 text-blue-200' : 'text-zinc-300'}`}>{k.name}</button>
        ))}
      </div>
      <p className="dh-help">{kinds.find((k) => k.id === f.kind)?.help}</p>
      <Field label={t('ssh.tun.label', 'Nome')}><input className="dh-input w-full" value={f.label ?? ''} onChange={(e) => set({ label: e.target.value })} placeholder="postgres prod" /></Field>
      <Field label={t('ssh.tun.host', 'Servidor SSH')}>
        <select className="dh-input w-full" value={f.hostId ?? ''} onChange={(e) => set({ hostId: e.target.value })}>
          {vault.hosts.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-[1fr_100px] gap-3">
        <Field label={f.kind === 'remote' ? t('ssh.tun.remoteBind', 'Endereço no servidor') : t('ssh.tun.bind', 'Endereço local')}><input className="dh-input w-full font-mono" value={f.bindAddress ?? ''} onChange={(e) => set({ bindAddress: e.target.value })} /></Field>
        <Field label={t('ssh.tun.port', 'Porta')}><input className="dh-input w-full font-mono" inputMode="numeric" value={f.bindPort ?? ''} onChange={(e) => set({ bindPort: Number(e.target.value.replace(/\D/g, '')) || (undefined as unknown as number) })} /></Field>
      </div>
      {f.bindAddress && !['127.0.0.1', 'localhost', '::1'].includes(f.bindAddress) && f.kind !== 'remote' ? <p className="text-[12px] text-amber-300">{t('ssh.tun.exposed', 'Esse endereço deixa outras máquinas da rede usarem o túnel.')}</p> : null}
      {f.kind !== 'dynamic' ? (
        <div className="grid grid-cols-[1fr_100px] gap-3">
          <Field label={f.kind === 'remote' ? t('ssh.tun.localTarget', 'Destino (deste lado)') : t('ssh.tun.target', 'Destino (visto pelo servidor)')}><input className="dh-input w-full font-mono" value={f.targetHost ?? ''} onChange={(e) => set({ targetHost: e.target.value })} placeholder="localhost" /></Field>
          <Field label={t('ssh.tun.port', 'Porta')}><input className="dh-input w-full font-mono" inputMode="numeric" value={f.targetPort ?? ''} onChange={(e) => set({ targetPort: Number(e.target.value.replace(/\D/g, '')) || null })} /></Field>
        </div>
      ) : null}
      <label className="flex items-center gap-2 text-[13px] text-zinc-300"><input type="checkbox" checked={Boolean(f.autoStart)} onChange={(e) => set({ autoStart: e.target.checked })} />{t('ssh.tun.autoStart', 'Ligar ao abrir o DarkHub (só servidores já confiados)')}</label>
      {err ? <p className="text-[12.5px] text-red-300">{err}</p> : null}
    </Drawer>
  );
}

export default function TunnelsView({ vault, reload }: VaultProps) {
  const { t } = useI18n();
  const live = useSshStore().tunnels;
  const [editing, setEditing] = useState<Partial<SshTunnel> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const toggle = async (tn: SshTunnel, on: boolean) => {
    setBusy(tn.id);
    setErrors((e) => ({ ...e, [tn.id]: '' }));
    const r = on ? await window.darkhub.ssh.startTunnel(tn.id) : await window.darkhub.ssh.stopTunnel(tn.id);
    setBusy(null);
    if (!r.ok) setErrors((e) => ({ ...e, [tn.id]: r.code === 'PORT_IN_USE' ? t('ssh.tun.portBusy', 'A porta {p} já está em uso por outro programa.').replace('{p}', String(tn.bindPort)) : errText(r) }));
    await reload();
  };
  const del = async (tn: SshTunnel) => {
    if (!window.confirm(t('ssh.tun.confirmDelete', 'Apagar o túnel "{n}"?').replace('{n}', tn.label))) return;
    await window.darkhub.ssh.deleteTunnel(tn.id);
    await reload();
  };
  return (
    <div className="space-y-4">
      <button type="button" className="dh-btn dh-btn-primary" disabled={!vault.hosts.length} onClick={() => setEditing({})}><Plus size={14} />{t('ssh.tun.new', 'Novo túnel')}</button>
      {!vault.hosts.length ? <p className="dh-help">{t('ssh.tun.needHost', 'Cadastre um host antes de criar túneis.')}</p> : null}
      {!vault.tunnels.length ? <EmptyState text={t('ssh.tun.empty', 'Nenhum túnel. Use um para acessar um banco ou painel interno como se estivesse no seu PC.')} /> : (
        <div className="rounded-xl border border-zinc-800/80 divide-y divide-zinc-900">
          {vault.tunnels.map((tn) => {
            const rt = live[tn.id] ?? tn.runtime;
            const on = rt?.status === 'active' || rt?.status === 'starting';
            const host = vault.hosts.find((h) => h.id === tn.hostId);
            const flow = tn.kind === 'dynamic' ? `${tn.bindAddress}:${tn.bindPort} → SOCKS5 via ${host?.label}`
              : tn.kind === 'local' ? `${tn.bindAddress}:${tn.bindPort} → ${host?.label} → ${tn.targetHost}:${tn.targetPort}`
              : `${host?.label} ${tn.bindAddress}:${tn.bindPort} → ${tn.targetHost}:${tn.targetPort}`;
            const err = errors[tn.id] || (rt?.status === 'error' ? rt.error : '');
            return (
              <div key={tn.id} className="flex items-center gap-3 px-3 py-2.5">
                <Route size={16} className={on ? 'text-blue-300' : 'text-zinc-400'} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-zinc-100">{tn.label} <span className="dh-tag">{tn.kind === 'local' ? '-L' : tn.kind === 'remote' ? '-R' : '-D'}</span>{tn.autoStart ? <span className="dh-tag ml-1">auto</span> : null}</div>
                  <div className="text-[11.5px] text-zinc-500 font-mono truncate">{flow}</div>
                  {rt?.status === 'active' ? <div className="text-[11px] text-zinc-500"><span className="text-emerald-300">{t('ssh.tun.active', 'ativo')}</span> · <span className="font-mono">{rt.activeConnections}</span> {t('ssh.tun.conns', 'conexões')} · <span className="font-mono">↓{fmtBytes(rt.bytesIn)} ↑{fmtBytes(rt.bytesOut)}</span></div> : null}
                  {rt?.status === 'starting' ? <div className="text-[11px] text-amber-300">{t('ssh.tun.starting', 'conectando...')}</div> : null}
                  {err ? <div className="text-[11.5px] text-red-300 flex items-center gap-1"><AlertTriangle size={12} />{err}</div> : null}
                </div>
                {busy === tn.id ? <Loader2 size={14} className="animate-spin text-zinc-400" /> : null}
                <Switch on={on} busy={busy === tn.id} label={tn.label} onChange={(v) => toggle(tn, v)} />
                <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" onClick={() => setEditing(tn)}><Edit3 size={13} /></button>
                <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" onClick={() => del(tn)}><Trash2 size={13} /></button>
              </div>
            );
          })}
        </div>
      )}
      {editing ? <TunnelDrawer vault={vault} reload={reload} tunnel={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
