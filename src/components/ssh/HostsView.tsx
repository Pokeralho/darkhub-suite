import React, { useMemo, useState } from 'react';
import { Plus, Search, Server, Terminal, FolderOpen, Edit3, Trash2, LayoutGrid, List, Upload, Key, Loader2, Usb } from '../icons';
import { SerialDrawer } from './SshExtras';
import { useI18n } from '../../i18n/I18nProvider';
import type { SshHost, SshHostInput, SshOsIcon } from '../../global';
import { Drawer, Field, EmptyState, Modal, errText, type VaultProps } from './ui';
import { openTerminal, openSftpTab } from './sshStore';
import { TERMINAL_THEMES } from './terminalThemes';

const OS: SshOsIcon[] = ['linux', 'ubuntu', 'debian', 'arch', 'redhat', 'windows', 'macos', 'freebsd', 'network', 'custom'];

export function HostDrawer({ vault, reload, host, onClose }: VaultProps & { host: Partial<SshHost> | null; onClose: () => void }) {
  const { t } = useI18n();
  const [f, setF] = useState<Partial<SshHost>>(() => ({ port: 22, username: 'root', osIcon: 'linux', themeId: vault.settings?.terminal.defaultThemeId ?? 'darkhub-midnight', tags: [], logSession: vault.settings?.terminal.logByDefault ?? false, agentForward: false, ...host }));
  const [tagText, setTagText] = useState((host?.tags ?? []).join(', '));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<SshHost>) => setF((x) => ({ ...x, ...patch }));
  const save = async () => {
    setBusy(true); setErr('');
    const r = await window.darkhub.ssh.saveHost({ ...(f as SshHostInput), hostname: f.hostname ?? '', tags: tagText.split(',').map((x) => x.trim()).filter(Boolean) });
    setBusy(false);
    if (!r.ok) { setErr(errText(r)); return; }
    await reload();
    onClose();
  };
  const others = vault.hosts.filter((h) => h.id !== f.id);
  return (
    <Drawer title={f.id ? t('ssh.host.edit', 'Editar host') : t('ssh.host.new', 'Novo host')} onClose={onClose}
      footer={<><button type="button" className="dh-btn" onClick={onClose}>{t('ssh.cancel', 'Cancelar')}</button><button type="button" className="dh-btn dh-btn-primary" disabled={busy || !f.hostname} onClick={save}>{busy ? <Loader2 size={14} className="animate-spin" /> : null}{t('ssh.save', 'Salvar')}</button></>}>
      <Field label={t('ssh.host.address', 'Endereço (IP ou nome)')}><input className="dh-input w-full font-mono" autoFocus value={f.hostname ?? ''} placeholder="192.168.0.10" onChange={(e) => set({ hostname: e.target.value })} /></Field>
      <Field label={t('ssh.host.label', 'Nome')}><input className="dh-input w-full" value={f.label ?? ''} placeholder={f.hostname || 'web-01'} onChange={(e) => set({ label: e.target.value })} /></Field>
      <div className="grid grid-cols-[1fr_96px] gap-3">
        <Field label={t('ssh.host.username', 'Usuário')}><input className="dh-input w-full font-mono" value={f.username ?? ''} onChange={(e) => set({ username: e.target.value })} /></Field>
        <Field label={t('ssh.host.port', 'Porta')}><input className="dh-input w-full font-mono" inputMode="numeric" value={f.port ?? 22} onChange={(e) => set({ port: Number(e.target.value.replace(/\D/g, '')) || ('' as unknown as number) })} /></Field>
      </div>
      <Field label={t('ssh.host.credential', 'Credencial (Keychain)')} help={t('ssh.host.credentialHelp', 'Sem credencial, a senha é pedida a cada conexão e não é salva.')}>
        <select className="dh-input w-full" value={f.credentialId ?? ''} onChange={(e) => set({ credentialId: e.target.value || null })}>
          <option value="">{t('ssh.host.askPassword', 'Perguntar a senha ao conectar')}</option>
          {vault.credentials.map((c) => <option key={c.id} value={c.id}>{c.label} ({c.kind === 'password' ? t('ssh.key.kind.password', 'senha') : c.kind === 'agent' ? 'agent' : c.algorithm ?? 'key'})</option>)}
        </select>
      </Field>
      <Field label={t('ssh.host.group', 'Grupo')}>
        <select className="dh-input w-full" value={f.groupId ?? ''} onChange={(e) => set({ groupId: e.target.value || null })}>
          <option value="">{t('ssh.host.noGroup', 'Sem grupo')}</option>
          {vault.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </Field>
      <Field label={t('ssh.host.jump', 'Jump host (bastion)')} help={t('ssh.host.jumpHelp', 'A conexão passa por esse host antes de chegar ao destino (ProxyJump).')}>
        <select className="dh-input w-full" value={f.jumpHostId ?? ''} onChange={(e) => set({ jumpHostId: e.target.value || null })}>
          <option value="">{t('ssh.host.direct', 'Conexão direta')}</option>
          {others.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
        </select>
      </Field>
      <Field label={t('ssh.host.startup', 'Snippet ao conectar')}>
        <select className="dh-input w-full" value={f.startupSnippetId ?? ''} onChange={(e) => set({ startupSnippetId: e.target.value || null })}>
          <option value="">{t('ssh.none', 'Nenhum')}</option>
          {vault.snippets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('ssh.host.os', 'Sistema')}>
          <select className="dh-input w-full" value={f.osIcon} onChange={(e) => set({ osIcon: e.target.value as SshOsIcon })}>{OS.map((o) => <option key={o} value={o}>{o}</option>)}</select>
        </Field>
        <Field label={t('ssh.host.theme', 'Tema do terminal')}>
          <select className="dh-input w-full" value={f.themeId} onChange={(e) => set({ themeId: e.target.value })}>{TERMINAL_THEMES.map((th) => <option key={th.id} value={th.id}>{th.name}</option>)}</select>
        </Field>
      </div>
      <Field label={t('ssh.host.tags', 'Tags (separadas por vírgula)')}><input className="dh-input w-full" value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="prod, web" /></Field>
      <Field label={t('ssh.host.charset', 'Codificação')}><input className="dh-input w-full font-mono" value={f.charset ?? 'utf-8'} onChange={(e) => set({ charset: e.target.value })} /></Field>
      <Field label={t('ssh.host.keepalive', 'Keepalive (segundos, 0 desliga)')}><input className="dh-input w-full font-mono" inputMode="numeric" value={Math.round((f.keepaliveIntervalMs ?? 15000) / 1000)} onChange={(e) => set({ keepaliveIntervalMs: Math.min(300, Number(e.target.value.replace(/\D/g, '')) || 0) * 1000 })} /></Field>
      <label className="flex items-start gap-2 text-[13px] text-zinc-300"><input type="checkbox" className="mt-0.5" checked={Boolean(f.logSession)} onChange={(e) => set({ logSession: e.target.checked })} /><span>{t('ssh.host.log', 'Gravar log das sessões')}<span className="block dh-help">{t('ssh.host.logHelp', 'Texto puro, sem cores, um arquivo por sessão.')}</span></span></label>
      <label className="flex items-start gap-2 text-[13px] text-zinc-300"><input type="checkbox" className="mt-0.5" checked={Boolean(f.agentForward)} onChange={(e) => set({ agentForward: e.target.checked })} /><span>{t('ssh.host.agentForward', 'Encaminhar o agente SSH (agent forwarding)')}<span className="block dh-help">{t('ssh.host.agentForwardHelp', 'Permite usar suas chaves do ssh-agent a partir deste servidor (ex.: git pull). Só ligue em servidores confiáveis.')}</span></span></label>
      {err ? <p className="text-[12.5px] text-red-300">{err}</p> : null}
    </Drawer>
  );
}

/** Password prompt for hosts without a saved credential (the password is used once and never stored). */
export function PasswordPrompt({ host, onCancel, onSubmit }: { host: SshHost; onCancel: () => void; onSubmit: (pw: string) => void }) {
  const { t } = useI18n();
  const [pw, setPw] = useState('');
  return (
    <Modal title={t('ssh.pw.title', 'Senha para {h}').replace('{h}', `${host.username}@${host.hostname}`)} onClose={onCancel}
      footer={<><button type="button" className="dh-btn" onClick={onCancel}>{t('ssh.cancel', 'Cancelar')}</button><button type="button" className="dh-btn dh-btn-primary" onClick={() => onSubmit(pw)}>{t('ssh.connect', 'Conectar')}</button></>}>
      <input type="password" autoFocus className="dh-input w-full" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(pw); }} />
      <p className="dh-help">{t('ssh.pw.help', 'Usada só nesta conexão. Para não digitar de novo, crie uma credencial no Keychain.')}</p>
    </Modal>
  );
}

export function useConnect(vault: VaultProps['vault']) {
  const [ask, setAsk] = useState<{ host: SshHost; mode: 'terminal' | 'sftp' } | null>(null);
  const connect = (host: SshHost, mode: 'terminal' | 'sftp' = 'terminal') => {
    const cred = host.credentialId ? vault.credentials.find((c) => c.id === host.credentialId) : null;
    if (!cred && mode === 'terminal') { setAsk({ host, mode }); return; }
    if (mode === 'terminal') openTerminal(host.id, host.label);
    else openSftpTab(host.id, host.label);
  };
  const prompt = ask ? (
    <PasswordPrompt host={ask.host} onCancel={() => setAsk(null)} onSubmit={(pw) => { openTerminal(ask.host.id, ask.host.label, undefined, undefined, pw); setAsk(null); }} />
  ) : null;
  return { connect, prompt };
}

export default function HostsView({ vault, reload }: VaultProps) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<SshHost> | null>(null);
  const [grid, setGrid] = useState(true);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<{ count: number; skipped: number; file: string } | null>(null);
  const [msg, setMsg] = useState('');
  const [serial, setSerial] = useState(false);
  const { connect, prompt } = useConnect(vault);

  const hosts = useMemo(() => {
    const s = q.trim().toLowerCase();
    return vault.hosts.filter((h) => (!groupFilter || h.groupId === groupFilter) && (!s || [h.label, h.hostname, h.username, ...h.tags].some((x) => x.toLowerCase().includes(s))));
  }, [vault.hosts, q, groupFilter]);

  const del = async (h: SshHost) => {
    if (!window.confirm(t('ssh.host.confirmDelete', 'Apagar o host "{n}"? Os túneis dele também são apagados.').replace('{n}', h.label))) return;
    const r = await window.darkhub.ssh.deleteHost(h.id);
    if (!r.ok) setMsg(errText(r));
    await reload();
  };
  const saveGroup = async () => {
    if (!groupName?.trim()) return;
    const r = await window.darkhub.ssh.saveGroup({ name: groupName.trim() });
    if (!r.ok) setMsg(errText(r));
    setGroupName(null);
    await reload();
  };
  const delGroup = async (id: string, name: string) => {
    if (!window.confirm(t('ssh.group.confirmDelete', 'Apagar o grupo "{n}"? Os hosts continuam salvos, sem grupo.').replace('{n}', name))) return;
    await window.darkhub.ssh.deleteGroup(id);
    if (groupFilter === id) setGroupFilter(null);
    await reload();
  };
  const previewImport = async () => {
    setMsg('');
    const r = await window.darkhub.ssh.importSshConfig({ dryRun: true });
    if (!r.ok) { setMsg(errText(r)); return; }
    if (!r.imported.length) { setMsg(t('ssh.import.nothing', 'Nada novo para importar de {f}.').replace('{f}', r.file)); return; }
    setImportPreview({ count: r.imported.length, skipped: r.skipped, file: r.file });
  };
  const doImport = async () => {
    const r = await window.darkhub.ssh.importSshConfig({ dryRun: false });
    setImportPreview(null);
    setMsg(r.ok ? t('ssh.import.done', '{n} hosts importados.').replace('{n}', String(r.imported.length)) : errText(r));
    await reload();
  };
  const hostCount = (gid: string) => vault.hosts.filter((h) => h.groupId === gid).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input className="dh-input w-full pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ssh.host.search', 'Buscar por nome, endereço ou tag')} />
        </div>
        <button type="button" className="dh-btn dh-btn-primary" onClick={() => setEditing({})}><Plus size={14} />{t('ssh.host.new', 'Novo host')}</button>
        <button type="button" className="dh-btn" onClick={() => setGroupName('')}><FolderOpen size={14} />{t('ssh.group.new', 'Novo grupo')}</button>
        <button type="button" className="dh-btn" onClick={() => setSerial(true)}><Usb size={14} />{t('ssh.serial.button', 'Serial')}</button>
        <button type="button" className="dh-btn" onClick={previewImport}><Upload size={14} />{t('ssh.import.button', 'Importar ~/.ssh/config')}</button>
        <button type="button" className="dh-btn dh-btn-ghost" aria-label="layout" onClick={() => setGrid((g) => !g)}>{grid ? <List size={14} /> : <LayoutGrid size={14} />}</button>
      </div>
      {msg ? <p className="text-[12.5px] text-zinc-300">{msg}</p> : null}

      {vault.groups.length ? (
        <section className="space-y-2">
          <h2 className="dh-section-title">{t('ssh.groups', 'Grupos')}</h2>
          <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
            {vault.groups.map((g) => (
              <div key={g.id} role="button" tabIndex={0} onClick={() => setGroupFilter(groupFilter === g.id ? null : g.id)}
                className={`group dh-card p-3 flex items-center gap-2 cursor-pointer ${groupFilter === g.id ? 'border-blue-500/60' : ''}`}>
                <FolderOpen size={16} className={groupFilter === g.id ? 'text-blue-300' : 'text-zinc-400'} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-zinc-100 truncate">{g.name}</div>
                  <div className="text-[11.5px] text-zinc-500"><span className="font-mono">{hostCount(g.id)}</span> {t('ssh.hostsWord', 'hosts')}</div>
                </div>
                <button type="button" className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-300" onClick={(e) => { e.stopPropagation(); void delGroup(g.id, g.name); }}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="dh-section-title">{t('ssh.hosts', 'Hosts')}{groupFilter ? <span className="text-zinc-500 font-normal"> · {vault.groups.find((g) => g.id === groupFilter)?.name}</span> : null}</h2>
        {!vault.hosts.length ? (
          <EmptyState text={t('ssh.host.empty', 'Nenhum servidor salvo ainda. Adicione o primeiro para conectar com um duplo clique.')} action={<button type="button" className="dh-btn dh-btn-primary" onClick={() => setEditing({})}><Plus size={14} />{t('ssh.host.new', 'Novo host')}</button>} />
        ) : !hosts.length ? (
          <p className="text-[13px] text-zinc-500">{t('ssh.host.noMatch', 'Nenhum host corresponde à busca.')}</p>
        ) : (
          <div className={grid ? 'grid gap-2 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]' : 'rounded-xl border border-zinc-800/80 divide-y divide-zinc-900'}>
            {hosts.map((h) => {
              const cred = vault.credentials.find((c) => c.id === h.credentialId);
              return (
                <div key={h.id} onDoubleClick={() => connect(h)} className={`group flex gap-3 ${grid ? 'dh-card p-3 flex-col' : 'items-center px-3 py-2'} hover:border-zinc-700`}>
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                  <Server size={18} className="text-zinc-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-zinc-100 truncate" title={h.label}>{h.label}</div>
                    <div className="text-[11.5px] text-zinc-500 font-mono truncate">{cred?.username || h.username}@{h.hostname}{h.port !== 22 ? `:${h.port}` : ''}</div>
                    <div className="flex flex-wrap gap-x-2 text-[11px] text-zinc-500">
                      <span className="dh-tag">{h.osIcon}</span>
                      {cred ? <span className="flex items-center gap-1"><Key size={11} />{cred.label}</span> : null}
                      {h.jumpHostId ? <span>{t('ssh.host.via', 'via')} {vault.hosts.find((x) => x.id === h.jumpHostId)?.label}</span> : null}
                      {h.tags.map((tg) => <span key={tg} className="dh-tag">{tg}</span>)}
                    </div>
                  </div>
                  </div>
                  <div className={`flex items-center gap-1 ${grid ? 'justify-end border-t border-zinc-800/80 pt-2' : 'opacity-60 group-hover:opacity-100'}`}>
                    <button type="button" className="dh-btn dh-btn-sm dh-btn-accent" title={t('ssh.connect', 'Conectar')} onClick={() => connect(h)}><Terminal size={13} />{grid ? t('ssh.connect', 'Conectar') : null}</button>
                    <button type="button" className="dh-btn dh-btn-sm" title="SFTP" onClick={() => connect(h, 'sftp')}><FolderOpen size={13} />{grid ? 'SFTP' : null}</button>
                    {grid ? <span className="flex-1" /> : null}
                    <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" title={t('ssh.edit', 'Editar')} onClick={() => setEditing(h)}><Edit3 size={13} /></button>
                    <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" title={t('ssh.delete', 'Apagar')} onClick={() => del(h)}><Trash2 size={13} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {editing ? <HostDrawer vault={vault} reload={reload} host={editing} onClose={() => setEditing(null)} /> : null}
      {groupName !== null ? (
        <Modal title={t('ssh.group.new', 'Novo grupo')} onClose={() => setGroupName(null)}
          footer={<><button type="button" className="dh-btn" onClick={() => setGroupName(null)}>{t('ssh.cancel', 'Cancelar')}</button><button type="button" className="dh-btn dh-btn-primary" onClick={saveGroup}>{t('ssh.save', 'Salvar')}</button></>}>
          <input className="dh-input w-full" autoFocus value={groupName} onChange={(e) => setGroupName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void saveGroup(); }} placeholder="AWS, Staging..." />
        </Modal>
      ) : null}
      {importPreview ? (
        <Modal title={t('ssh.import.title', 'Importar do ~/.ssh/config')} onClose={() => setImportPreview(null)}
          footer={<><button type="button" className="dh-btn" onClick={() => setImportPreview(null)}>{t('ssh.cancel', 'Cancelar')}</button><button type="button" className="dh-btn dh-btn-primary" onClick={doImport}>{t('ssh.import.confirm', 'Importar')}</button></>}>
          <p>{t('ssh.import.preview', '{n} hosts novos encontrados em {f} ({s} já existem).').replace('{n}', String(importPreview.count)).replace('{f}', importPreview.file).replace('{s}', String(importPreview.skipped))}</p>
          <p className="dh-help">{t('ssh.import.keys', 'Chaves (IdentityFile) não são copiadas: importe-as no Keychain e associe aos hosts.')}</p>
        </Modal>
      ) : null}
      {serial ? <SerialDrawer onClose={() => setSerial(false)} /> : null}
      {prompt}
    </div>
  );
}
