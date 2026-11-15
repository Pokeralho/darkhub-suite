import React, { useState } from 'react';
import { Plus, Key, KeyRound, Trash2, Copy, Edit3, Loader2, Lock, ShieldCheck, Trash2 as Revoke, History } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';
import type { SshCredentialInput, SshCredentialSummary } from '../../global';
import { Drawer, Field, EmptyState, errText, fmtDate, type VaultProps } from './ui';

function CredentialDrawer({ reload, cred, onClose }: { reload: VaultProps['reload']; cred: Partial<SshCredentialSummary> | null; onClose: () => void }) {
  const { t } = useI18n();
  const [f, setF] = useState<SshCredentialInput>({ id: cred?.id, label: cred?.label ?? '', kind: cred?.kind ?? 'password', username: cred?.username ?? '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<SshCredentialInput>) => setF((x) => ({ ...x, ...p }));
  const save = async () => {
    setBusy(true); setErr('');
    const r = await window.darkhub.ssh.saveCredential(f);
    setBusy(false);
    if (!r.ok) { setErr(r.code === 'KEY_PASSPHRASE' ? t('ssh.key.needPassphrase', 'A chave está protegida: informe a passphrase correta.') : errText(r)); return; }
    await reload();
    onClose();
  };
  const editing = Boolean(cred?.id);
  return (
    <Drawer title={editing ? t('ssh.key.edit', 'Editar credencial') : t('ssh.key.new', 'Nova credencial')} onClose={onClose}
      footer={<><button type="button" className="dh-btn" onClick={onClose}>{t('ssh.cancel', 'Cancelar')}</button><button type="button" className="dh-btn dh-btn-primary" disabled={busy || !f.label} onClick={save}>{busy ? <Loader2 size={14} className="animate-spin" /> : null}{t('ssh.save', 'Salvar')}</button></>}>
      <Field label={t('ssh.key.label', 'Nome')}><input className="dh-input w-full" autoFocus value={f.label} onChange={(e) => set({ label: e.target.value })} /></Field>
      <Field label={t('ssh.key.kind', 'Tipo')}>
        <select className="dh-input w-full" value={f.kind} onChange={(e) => set({ kind: e.target.value as SshCredentialInput['kind'] })}>
          <option value="password">{t('ssh.key.kind.password', 'senha')}</option>
          <option value="ssh_key">{t('ssh.key.kind.key', 'chave SSH privada')}</option>
          <option value="agent">{t('ssh.key.kind.agent', 'agente SSH (OpenSSH/Pageant)')}</option>
        </select>
      </Field>
      <Field label={t('ssh.key.username', 'Usuário (opcional, substitui o do host)')}><input className="dh-input w-full font-mono" value={f.username} onChange={(e) => set({ username: e.target.value })} /></Field>
      {f.kind === 'password' ? (
        <Field label={t('ssh.key.password', 'Senha')} help={editing ? t('ssh.key.keepSecret', 'Deixe vazio para manter a atual.') : undefined}>
          <input type="password" className="dh-input w-full" value={f.secret ?? ''} onChange={(e) => set({ secret: e.target.value })} />
        </Field>
      ) : null}
      {f.kind === 'ssh_key' ? (
        <>
          <Field label={t('ssh.key.private', 'Chave privada (OpenSSH, PEM ou PPK)')} help={editing ? t('ssh.key.keepSecret', 'Deixe vazio para manter a atual.') : undefined}>
            <textarea className="dh-input w-full h-40 font-mono text-[11.5px]" spellCheck={false} value={f.privateKey ?? ''} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" onChange={(e) => set({ privateKey: e.target.value })} />
          </Field>
          <Field label={t('ssh.key.passphrase', 'Passphrase (se a chave tiver)')}><input type="password" className="dh-input w-full" value={f.passphrase ?? ''} onChange={(e) => set({ passphrase: e.target.value })} /></Field>
        </>
      ) : null}
      {f.kind === 'agent' ? <p className="dh-help">{t('ssh.key.agentHelp', 'Usa as chaves carregadas no agente do OpenSSH do Windows (ssh-agent). Nada secreto é guardado aqui.')}</p> : null}
      <p className="dh-help flex items-center gap-1.5"><Lock size={12} />{t('ssh.key.encrypted', 'Senhas e chaves ficam criptografadas (AES-256-GCM) e nunca saem do processo principal.')}</p>
      {err ? <p className="text-[12.5px] text-red-300">{err}</p> : null}
    </Drawer>
  );
}

function GenerateDrawer({ reload, onClose }: { reload: VaultProps['reload']; onClose: () => void }) {
  const { t } = useI18n();
  const [label, setLabel] = useState('');
  const [algorithm, setAlgorithm] = useState<'ed25519' | 'rsa-4096'>('ed25519');
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pub, setPub] = useState('');
  const gen = async () => {
    setBusy(true); setErr('');
    const r = await window.darkhub.ssh.generateKey({ label, algorithm, passphrase: passphrase || undefined });
    setBusy(false);
    if (!r.ok) { setErr(errText(r)); return; }
    setPub(r.publicKey);
    await reload();
  };
  return (
    <Drawer title={t('ssh.key.generate', 'Gerar par de chaves')} onClose={onClose}
      footer={pub ? <button type="button" className="dh-btn dh-btn-primary" onClick={onClose}>{t('ssh.done', 'Concluir')}</button>
        : <><button type="button" className="dh-btn" onClick={onClose}>{t('ssh.cancel', 'Cancelar')}</button><button type="button" className="dh-btn dh-btn-primary" disabled={busy || !label} onClick={gen}>{busy ? <Loader2 size={14} className="animate-spin" /> : null}{t('ssh.key.generateBtn', 'Gerar')}</button></>}>
      {pub ? (
        <>
          <p className="text-[13px] text-zinc-300">{t('ssh.key.generated', 'Chave criada. Copie a chave pública para ~/.ssh/authorized_keys do servidor:')}</p>
          <textarea readOnly className="dh-input w-full h-28 font-mono text-[11.5px]" value={pub} />
          <button type="button" className="dh-btn" onClick={() => void navigator.clipboard.writeText(pub)}><Copy size={14} />{t('ssh.copy', 'Copiar')}</button>
        </>
      ) : (
        <>
          <Field label={t('ssh.key.label', 'Nome')}><input className="dh-input w-full" autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="laptop-2026" /></Field>
          <Field label={t('ssh.key.algorithm', 'Algoritmo')} help={t('ssh.key.algoHelp', 'Ed25519 é rápido e moderno. RSA 4096 serve para servidores antigos.')}>
            <select className="dh-input w-full" value={algorithm} onChange={(e) => setAlgorithm(e.target.value as 'ed25519' | 'rsa-4096')}>
              <option value="ed25519">Ed25519</option>
              <option value="rsa-4096">RSA 4096</option>
            </select>
          </Field>
          <Field label={t('ssh.key.passphraseOpt', 'Passphrase (opcional)')}><input type="password" className="dh-input w-full" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} /></Field>
        </>
      )}
      {err ? <p className="text-[12.5px] text-red-300">{err}</p> : null}
    </Drawer>
  );
}

export default function KeychainView({ vault, reload }: VaultProps) {
  const { t } = useI18n();
  const [editing, setEditing] = useState<Partial<SshCredentialSummary> | null>(null);
  const [gen, setGen] = useState(false);
  const del = async (c: SshCredentialSummary) => {
    const used = vault.hosts.filter((h) => h.credentialId === c.id).length;
    if (!window.confirm(t('ssh.key.confirmDelete', 'Apagar "{n}"? {u} hosts deixam de usar esta credencial.').replace('{n}', c.label).replace('{u}', String(used)))) return;
    await window.darkhub.ssh.deleteCredential(c.id);
    await reload();
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="dh-btn dh-btn-primary" onClick={() => setEditing({})}><Plus size={14} />{t('ssh.key.new', 'Nova credencial')}</button>
        <button type="button" className="dh-btn" onClick={() => setGen(true)}><KeyRound size={14} />{t('ssh.key.generate', 'Gerar par de chaves')}</button>
      </div>
      {vault.keyProtection !== 'dpapi' ? <p className="text-[12.5px] text-amber-300">{t('ssh.key.noDpapi', 'A proteção do Windows (DPAPI) não está disponível: a chave do cofre fica sem proteção extra nesta máquina.')}</p> : null}
      {!vault.credentials.length ? (
        <EmptyState text={t('ssh.key.empty', 'Nenhuma senha ou chave salva. Guarde aqui para conectar sem digitar.')} />
      ) : (
        <div className="rounded-xl border border-zinc-800/80 divide-y divide-zinc-900">
          {vault.credentials.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-3 py-2.5">
              <Key size={16} className="text-zinc-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-zinc-100">{c.label} <span className="dh-tag">{c.kind === 'ssh_key' ? c.algorithm ?? 'key' : c.kind}</span></div>
                <div className="text-[11.5px] text-zinc-500 font-mono truncate">{c.fingerprintSha256 ?? (c.username ? `${c.username}` : '')}</div>
                <div className="text-[11px] text-zinc-500">{vault.hosts.filter((h) => h.credentialId === c.id).length} {t('ssh.hostsWord', 'hosts')}{c.hasPassphrase ? ` · ${t('ssh.key.hasPassphrase', 'com passphrase')}` : ''}</div>
              </div>
              {c.publicKey ? <button type="button" className="dh-btn dh-btn-sm" title={t('ssh.key.copyPublic', 'Copiar chave pública')} onClick={() => void navigator.clipboard.writeText(c.publicKey!)}><Copy size={13} />{t('ssh.key.public', 'Pública')}</button> : null}
              <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" onClick={() => setEditing(c)}><Edit3 size={13} /></button>
              <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" onClick={() => del(c)}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
      {editing ? <CredentialDrawer reload={reload} cred={editing} onClose={() => setEditing(null)} /> : null}
      {gen ? <GenerateDrawer reload={reload} onClose={() => setGen(false)} /> : null}
    </div>
  );
}

export function KnownHostsView({ vault, reload }: VaultProps) {
  const { t } = useI18n();
  const revoke = async (id: string, name: string) => {
    if (!window.confirm(t('ssh.kh.confirmRevoke', 'Esquecer a chave de {h}? Na próxima conexão ela será pedida de novo.').replace('{h}', name))) return;
    await window.darkhub.ssh.deleteKnownHost(id);
    await reload();
  };
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="dh-section-title flex items-center gap-2"><ShieldCheck size={16} className="text-zinc-400" />{t('ssh.kh.title', 'Servidores confiáveis')}</h2>
        <p className="dh-help">{t('ssh.kh.help', 'Impressões digitais aceitas na primeira conexão. Se um servidor aparecer com outra chave, o DarkHub avisa antes de conectar.')}</p>
        {!vault.knownHosts.length ? <EmptyState text={t('ssh.kh.empty', 'Nenhum servidor confiado ainda.')} /> : (
          <div className="rounded-xl border border-zinc-800/80 divide-y divide-zinc-900">
            {vault.knownHosts.map((k) => (
              <div key={k.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-zinc-100 font-mono">{k.hostname}{k.port !== 22 ? `:${k.port}` : ''} <span className="dh-tag">{k.keyType}</span></div>
                  <div className="text-[11.5px] text-zinc-500 font-mono truncate">{k.fingerprintSha256}</div>
                  <div className="text-[11px] text-zinc-500">{t('ssh.kh.trusted', 'Confiado em')} {fmtDate(k.trustedAt)} · {t('ssh.kh.seen', 'visto em')} {fmtDate(k.lastSeenAt)}</div>
                </div>
                <button type="button" className="dh-btn dh-btn-sm dh-btn-danger" onClick={() => revoke(k.id, k.hostname)}><Revoke size={13} />{t('ssh.kh.revoke', 'Revogar')}</button>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <h2 className="dh-section-title flex items-center gap-2 flex-1"><History size={16} className="text-zinc-400" />{t('ssh.logs.title', 'Histórico de sessões')}</h2>
          <button type="button" className="dh-btn dh-btn-sm" onClick={() => void window.darkhub.ssh.openLogsFolder()}>{t('ssh.logs.folder', 'Abrir pasta de logs')}</button>
        </div>
        {!vault.sessionLogs.length ? <p className="text-[13px] text-zinc-500">{t('ssh.logs.empty', 'Nenhuma sessão registrada.')}</p> : (
          <div className="rounded-xl border border-zinc-800/80 divide-y divide-zinc-900 text-[12px]">
            {vault.sessionLogs.map((l) => (
              <div key={l.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-3 py-1.5">
                <span className="font-mono text-zinc-300 truncate">{l.hostSnapshot}</span>
                <span className={l.status === 'closed' || l.status === 'connected' ? 'text-zinc-400' : l.status === 'connecting' ? 'text-amber-300' : 'text-red-300'}>{l.status}{l.errorCode ? ` (${l.errorCode})` : ''}</span>
                <span className="font-mono text-zinc-500">{fmtDate(l.startedAt)}</span>
                {l.logFilePath ? <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" title={l.logFilePath} onClick={() => void window.darkhub.ssh.openLog(l.id)}>{t('ssh.logs.open', 'Ver log')}</button> : <span className="w-[62px]" />}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function HostKeyPrompt({ prompt, onDone }: { prompt: import('../../global').SshHostKeyPrompt; onDone: () => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const mismatch = prompt.status === 'mismatch';
  const answer = async (accept: boolean) => {
    setBusy(true);
    if (accept) await window.darkhub.ssh.trustHostKey({ requestId: prompt.requestId });
    else await window.darkhub.ssh.rejectHostKey(prompt.requestId);
    setBusy(false);
    onDone();
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
      <div className={`w-[min(560px,100%)] dh-card p-5 space-y-4 ${mismatch ? 'border-red-500/60' : ''}`}>
        <h2 className="dh-section-title">{mismatch ? t('ssh.hk.mismatchTitle', 'A chave deste servidor mudou') : t('ssh.hk.unknownTitle', 'Primeira conexão com este servidor')}</h2>
        <p className="text-[13px] text-zinc-300">
          {mismatch
            ? t('ssh.hk.mismatchText', 'O servidor {h} apresentou uma chave diferente da que foi confiada antes. Pode ser uma reinstalação ou alguém interceptando a conexão. Só aceite se você souber o motivo.').replace('{h}', `${prompt.hostname}:${prompt.port}`)
            : t('ssh.hk.unknownText', 'Confira se a impressão digital abaixo é a do servidor {h} antes de confiar.').replace('{h}', `${prompt.hostname}:${prompt.port}`)}
        </p>
        <div className="space-y-1 text-[12px]">
          <div className="text-zinc-500">{prompt.keyType}</div>
          <div className="font-mono text-zinc-100 break-all">{prompt.fingerprintSha256}</div>
          {mismatch && prompt.knownFingerprint ? <div className="font-mono text-zinc-500 break-all line-through">{prompt.knownFingerprint}</div> : null}
        </div>
        <div className="flex items-center justify-end gap-2">
          <button type="button" className="dh-btn" disabled={busy} onClick={() => answer(false)}>{t('ssh.hk.reject', 'Cancelar conexão')}</button>
          <button type="button" className={`dh-btn ${mismatch ? 'dh-btn-danger' : 'dh-btn-primary'}`} disabled={busy} onClick={() => answer(true)}>{mismatch ? t('ssh.hk.replace', 'Substituir e conectar') : t('ssh.hk.trust', 'Confiar e conectar')}</button>
        </div>
      </div>
    </div>
  );
}
