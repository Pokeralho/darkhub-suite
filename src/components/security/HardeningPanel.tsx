import React, { useState } from 'react';
import { Loader2, RefreshCw, ShieldCheck, RotateCcw, AlertTriangle, Info } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';
import { SectionHead, OnOff, Skel, fmtDate } from './ui';

type Item = {
  id: string; group: string; requiresDefender?: boolean; hasMode?: boolean; warning?: boolean; reboot?: boolean;
  available: boolean; applied: boolean; managed: boolean; appliedAt?: string | null; detail?: any; options?: { mode?: string } | null;
};

type Props = {
  hardening: { ok?: boolean; defenderActive?: boolean; defender?: any; items?: Item[] } | null;
  busy: string | null;
  run: (key: string, fn: () => Promise<any>, okMsg: (res: any) => string) => Promise<void>;
  reload: () => Promise<void>;
};

const TEXT: Record<string, { name: string; desc: string; warn?: string }> = {
  asr: {
    name: 'Regras de Redução da Superfície de Ataque (ASR)',
    desc: '14 regras do Defender: bloqueia roubo de credenciais do LSASS, drivers vulneráveis, macros do Office criando processos, scripts ofuscados, executáveis de USB não assinados e mais. Comece em Auditoria e passe para Bloqueio depois.'
  },
  pua: { name: 'Proteção contra aplicativos potencialmente indesejados (PUA)', desc: 'O Defender bloqueia adware, mineradores e instaladores com pacotes indesejados.' },
  cfa: {
    name: 'Acesso controlado a pastas',
    desc: 'Proteção anti-ransomware do Defender: só apps confiáveis podem alterar Documentos, Imagens, Área de Trabalho etc.',
    warn: 'Pode bloquear jogos e programas que salvam nessas pastas; libere-os em Segurança do Windows se precisar.'
  },
  smartscreen: { name: 'SmartScreen (Windows e Edge) por política', desc: 'Força o SmartScreen a avisar sobre downloads e sites perigosos, sem que outros programas possam desligá-lo.' },
  smb1: { name: 'Desativar SMBv1', desc: 'Protocolo antigo explorado pelo WannaCry/EternalBlue. Desativa o servidor e o recurso opcional SMB1.' },
  llmnrNetbios: { name: 'Desativar LLMNR e NetBIOS', desc: 'Impede o envenenamento de nomes na rede local (Responder), usado para roubar hashes de senha.' },
  psLogging: { name: 'Registro de blocos de script do PowerShell', desc: 'Grava no log de eventos o código PowerShell executado (inclusive ofuscado), para investigar ataques.' },
  rdpOff: {
    name: 'Desativar a Área de Trabalho Remota (RDP)',
    desc: 'Fecha o acesso remoto por RDP, alvo frequente de força bruta.',
    warn: 'Você não conseguirá acessar este PC remotamente por RDP enquanto estiver aplicado.'
  }
};

export default function HardeningPanel({ hardening, busy, run, reload }: Props) {
  const { t } = useI18n();
  const [asrMode, setAsrMode] = useState<'audit' | 'block'>('audit');
  const items = hardening?.items ?? [];
  const working = busy !== null;
  const sec = window.darkhub?.security;
  const appliedCount = items.filter((i) => i.applied).length;

  const statusLabel = (i: Item) => {
    if (i.id === 'asr' && i.detail?.mode && i.detail.mode !== 'off') {
      return t(`secx.hd.asrMode.${i.detail.mode}`, i.detail.mode === 'block' ? 'Bloqueio' : i.detail.mode === 'audit' ? 'Auditoria' : 'Parcial');
    }
    return i.applied ? t('secx.applied', 'Aplicado') : t('secx.notApplied', 'Não aplicado');
  };

  return (
    <section className="animate-in">
      <SectionHead
        title={t('secx.hd.title', 'Endurecimento do Windows')}
        desc={t('secx.hd.desc', 'Proteções reais e reversíveis. O estado é lido do sistema; ao aplicar, o DarkHub guarda o valor anterior exato e Restaurar o devolve.')}
        actions={
          <button onClick={() => reload()} disabled={working} className="dh-btn">
            <RefreshCw size={14} /> {t('secx.refresh', 'Atualizar')}
          </button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-[12.5px]">
        {hardening ? <span className="text-zinc-300"><span className="font-mono text-zinc-100">{appliedCount}/{items.length}</span> {t('secx.hd.appliedCount', 'proteções ativas')}</span> : <Skel w="w-32" />}
        {hardening ? (
          <OnOff on={Boolean(hardening.defenderActive)} onLabel={t('secx.hd.defenderOn', 'Microsoft Defender ativo')} offLabel={t('secx.hd.defenderOff', 'Microsoft Defender não está ativo: itens do Defender indisponíveis')} warn />
        ) : null}
      </div>

      <ul className="divide-y divide-zinc-800/80 border-y border-zinc-800/80">
        {items.map((i) => {
          const tx = TEXT[i.id] || { name: i.id, desc: '' };
          return (
            <li key={i.id} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-x-8 gap-y-2 py-4">
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-zinc-100">
                  {t(`secx.hd.${i.id}.name`, tx.name)}
                  {i.managed ? <span className="dh-tag ml-2">{t('secx.hd.managed', 'aplicado pelo DarkHub')}</span> : null}
                </div>
                <p className="dh-help mt-0.5 max-w-[70ch]">{t(`secx.hd.${i.id}.desc`, tx.desc)}</p>
                {tx.warn ? <p className="mt-1 flex items-start gap-1.5 text-[11.5px] text-amber-400"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{t(`secx.hd.${i.id}.warn`, tx.warn)}</p> : null}
                {i.reboot ? <p className="mt-1 flex items-start gap-1.5 text-[11.5px] text-zinc-500"><Info size={12} className="mt-0.5 shrink-0" />{t('secx.hd.reboot', 'Pode exigir reiniciar para valer por completo.')}</p> : null}
                {i.appliedAt ? <p className="mt-1 text-[11px] text-zinc-500">{t('secx.lastApplied', 'Aplicado em')} {fmtDate(i.appliedAt)}</p> : null}
              </div>
              <div className="flex flex-wrap md:flex-nowrap items-center gap-2 md:justify-end text-[12.5px]">
                {!i.available ? (
                  <span className="text-zinc-500">{t('secx.unavailable', 'Indisponível')}</span>
                ) : (
                  <OnOff on={i.applied} onLabel={statusLabel(i)} offLabel={statusLabel(i)} />
                )}
                {i.hasMode ? (
                  <select value={asrMode} onChange={(e) => setAsrMode(e.target.value as 'audit' | 'block')} disabled={working || !i.available} className="dh-input h-8 w-auto" aria-label={t('secx.hd.asrModeLabel', 'Modo das regras ASR')}>
                    <option value="audit">{t('secx.hd.asrMode.audit', 'Auditoria')}</option>
                    <option value="block">{t('secx.hd.asrMode.block', 'Bloqueio')}</option>
                  </select>
                ) : null}
                <button
                  disabled={working || !i.available}
                  className="dh-btn dh-btn-accent dh-btn-sm"
                  onClick={() => {
                    if (i.warning && !confirm(t(`secx.hd.${i.id}.warn`, tx.warn || ''))) return;
                    run(`hd:${i.id}`, () => sec.advHardeningApply({ id: i.id, mode: asrMode }), (r) => r?.reboot ? t('secx.hd.appliedReboot', 'Aplicado. Reinicie para concluir.') : t('secx.applied', 'Aplicado'));
                  }}
                >
                  {busy === `hd:${i.id}` ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} {t('secx.apply', 'Aplicar')}
                </button>
                <button
                  disabled={working || !i.managed}
                  title={i.managed ? undefined : t('secx.hd.noSnapshot', 'Só é possível restaurar o que o DarkHub aplicou.')}
                  className="dh-btn dh-btn-sm"
                  onClick={() => run(`hdr:${i.id}`, () => sec.advHardeningRestore({ id: i.id }), () => t('secx.restored', 'Restaurado ao estado anterior.'))}
                >
                  {busy === `hdr:${i.id}` ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} {t('secx.restore', 'Restaurar')}
                </button>
              </div>
            </li>
          );
        })}
        {!hardening ? [0, 1, 2, 3].map((k) => <li key={k} className="py-4"><div className="h-8 rounded-md bg-zinc-900 animate-pulse" /></li>) : null}
      </ul>
    </section>
  );
}
