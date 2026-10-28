import React, { useEffect, useState } from 'react';
import { Usb, FolderOpen, RefreshCw, Loader2, CheckCircle2, AlertTriangle, ShieldCheck } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';
import type { DarkOSIso, DarkOSUsbDisk } from '../../types/darkos';

const gb = (b: number) => `${(b / 1e9).toFixed(1).replace('.', ',')} GB`;

type Hash = { state: 'idle' | 'running' | 'official' | 'other' | 'error'; percent?: number; text?: string };

/**
 * Writes a DarkOS ISO to a USB drive (MBR + FAT32: boots on UEFI and BIOS PCs). Only USB drives are listed, never the system disk; the
 * drive is erased only after the user ticks the confirmation, and the main process re-checks it is the same drive.
 */
export default function DarkOSUsbCard() {
  const { t } = useI18n();
  const api = () => window.darkhub?.darkos;
  const [isos, setIsos] = useState<DarkOSIso[]>([]);
  const [iso, setIso] = useState<DarkOSIso | null>(null);
  const [official, setOfficial] = useState<string | null>(null);
  const [hash, setHash] = useState<Hash>({ state: 'idle' });
  const [disks, setDisks] = useState<DarkOSUsbDisk[] | null>(null);
  const [diskErr, setDiskErr] = useState('');
  const [disk, setDisk] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [run, setRun] = useState<{ step: string; percent: number; file: string } | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const loadDisks = () => {
    setDisks(null); setDiskErr('');
    void api()?.usbDisks().then((r) => { if (r?.ok) setDisks(r.disks ?? []); else { setDisks([]); setDiskErr(r?.error || ''); } });
  };

  useEffect(() => {
    void api()?.usbFindIsos().then((r) => { const list = r?.isos ?? []; setIsos(list); if (list[0]) setIso(list[0]); });
    void api()?.latestRelease().then((r) => setOfficial(r?.release?.sha256?.toLowerCase() || null)).catch(() => {});
    loadDisks();
    const off = api()?.onUsbEvent((e) => {
      if (e.step === 'hash') setHash({ state: 'running', percent: e.percent ?? 0 });
      else setRun((prev) => ({ step: e.step ?? prev?.step ?? 'copy', percent: e.percent ?? prev?.percent ?? 0, file: e.file ?? prev?.file ?? '' }));
    });
    return () => { off?.(); };
  }, []);

  useEffect(() => { setHash({ state: 'idle' }); }, [iso?.path]);

  const pickIso = async () => {
    const r = await api()?.usbPickIso();
    if (r?.ok && r.iso) { setIsos((l) => [r.iso!, ...l.filter((x) => x.path !== r.iso!.path)]); setIso(r.iso); }
  };

  const verify = async () => {
    if (!iso) return;
    setHash({ state: 'running', percent: 0 });
    const r = await api()?.usbHashIso({ path: iso.path });
    if (!r?.ok || !r.sha256) { setHash({ state: 'error', text: r?.error || '' }); return; }
    setHash(official && r.sha256 === official ? { state: 'official' } : { state: 'other', text: r.sha256 });
  };

  const chosen = disks?.find((d) => d.number === disk) ?? null;

  const write = async () => {
    if (!iso || !chosen) return;
    setResult(null);
    setRun({ step: 'prepare', percent: 0, file: '' });
    const r = await api()?.usbWrite({ diskNumber: chosen.number, expectedSize: chosen.size, isoPath: iso.path });
    setRun(null);
    setConfirm(false);
    if (r?.ok) setResult({ ok: true, text: t('darkos.usb.done', 'Pronto: o pendrive {d} tem o instalador do DarkOS.').replace('{d}', r.drive || '') });
    else setResult({ ok: false, text: errorText(r?.error, r?.detail) });
    loadDisks();
  };

  const errorText = (code?: string, detail?: string) => ({
    admin: t('darkos.usb.err.admin', 'Gravar um pendrive precisa do DarkHub aberto como administrador.'),
    'not-usb': t('darkos.usb.err.notUsb', 'Esse disco não é um pendrive USB. Nada foi apagado.'),
    changed: t('darkos.usb.err.changed', 'O pendrive mudou desde que você escolheu (foi trocado ou removido). Nada foi apagado; escolha de novo.'),
    'iso-missing': t('darkos.usb.err.iso', 'A ISO não foi encontrada.'),
    busy: t('darkos.usb.err.busy', 'Já há um pendrive sendo gravado.')
  } as Record<string, string>)[code || ''] ?? `${t('darkos.usb.err.failed', 'A gravação falhou.')} ${detail || code || ''}`.trim();

  const stepLabel = (s: string) => ({
    prepare: t('darkos.usb.step.prepare', 'Apagando e formatando o pendrive…'),
    mount: t('darkos.usb.step.mount', 'Abrindo a ISO…'),
    copy: t('darkos.usb.step.copy', 'Copiando os arquivos…'),
    split: t('darkos.usb.step.split', 'Dividindo a imagem do Windows em partes de até 4 GB…'),
    verify: t('darkos.usb.step.verify', 'Conferindo o pendrive…')
  } as Record<string, string>)[s] ?? s;

  const busy = Boolean(run);

  return (
    <section className="dh-card p-4 space-y-4">
      <div>
        <h2 className="dh-section-title flex items-center gap-2"><Usb size={15} />{t('darkos.usb.title', 'Criar pendrive de instalação')}</h2>
        <p className="dh-help max-w-[70ch]">{t('darkos.usb.body', 'Grava a ISO do DarkOS num pendrive que dá boot em qualquer PC com UEFI. Sem Rufus e sem Ventoy.')}</p>
      </div>

      <div className="space-y-2">
        <p className="dh-label">1. {t('darkos.usb.iso', 'ISO')}</p>
        <div className="flex flex-wrap items-center gap-2">
          {isos.length ? (
            <select className="dh-input max-w-md" value={iso?.path ?? ''} disabled={busy} onChange={(e) => setIso(isos.find((x) => x.path === e.target.value) ?? null)}>
              {isos.map((i) => <option key={i.path} value={i.path}>{`${i.name} · ${gb(i.size)}`}</option>)}
            </select>
          ) : <span className="text-[12.5px] text-zinc-400">{t('darkos.usb.noIso', 'Nenhuma ISO do DarkOS em Downloads. Baixe acima ou escolha o arquivo.')}</span>}
          <button type="button" className="dh-btn dh-btn-sm" disabled={busy} onClick={() => void pickIso()}><FolderOpen size={13} />{t('darkos.usb.pickIso', 'Escolher ISO')}</button>
          {iso ? (
            <button type="button" className="dh-btn dh-btn-sm" disabled={busy || hash.state === 'running'} onClick={() => void verify()}>
              {hash.state === 'running' ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
              {hash.state === 'running' ? `${t('darkos.usb.hashing', 'Conferindo')} ${hash.percent ?? 0}%` : t('darkos.usb.verify', 'Conferir com o site')}
            </button>
          ) : null}
        </div>
        {hash.state === 'official' ? <p className="flex items-center gap-2 text-[12.5px] text-emerald-300"><CheckCircle2 size={13} />{t('darkos.usb.official', 'ISO oficial: o SHA-256 é igual ao publicado em darkos.darkhub.ink.')}</p> : null}
        {hash.state === 'other' ? <p className="flex items-center gap-2 text-[12.5px] text-amber-300"><AlertTriangle size={13} />{t('darkos.usb.notOfficial', 'Essa ISO não é a versão publicada no site (SHA-256 diferente). Use só se você sabe de onde ela veio.')}</p> : null}
        {hash.state === 'error' ? <p className="text-[12.5px] text-red-400">{hash.text}</p> : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <p className="dh-label">2. {t('darkos.usb.drive', 'Pendrive')}</p>
          <button type="button" className="dh-btn dh-btn-ghost dh-btn-sm" disabled={busy} onClick={loadDisks} aria-label={t('darkos.usb.refresh', 'Procurar pendrives de novo')}><RefreshCw size={13} /></button>
        </div>
        {disks === null ? <p className="dh-help flex items-center gap-2"><Loader2 size={13} className="animate-spin" />{t('darkos.usb.searching', 'Procurando pendrives…')}</p> : null}
        {disks && !disks.length ? <p className="text-[12.5px] text-zinc-400">{diskErr || t('darkos.usb.noDisk', 'Nenhum pendrive USB de 8 GB ou mais conectado.')}</p> : null}
        {disks?.length ? (
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t('darkos.usb.drive', 'Pendrive')}>
            {disks.map((d) => (
              <button key={d.number} type="button" role="radio" aria-checked={disk === d.number} disabled={busy} onClick={() => { setDisk(d.number); setConfirm(false); }}
                className={`text-left rounded-lg border p-3 ${disk === d.number ? 'border-blue-400/70 bg-zinc-800/60' : 'border-zinc-800 hover:border-zinc-700'}`}>
                <p className="text-[13px] font-medium text-zinc-100 truncate">{d.name}</p>
                <p className="dh-help">{gb(d.size)}{d.letters ? ` · ${d.letters.split(',').map((l) => `${l}:`).join(' ')}` : ''}</p>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {chosen && iso && !busy ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 space-y-3">
          <label className="flex items-start gap-2 text-[12.5px] text-zinc-200 cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
            <span>{t('darkos.usb.confirm', 'Entendo que tudo em {d} ({s}) será apagado.').replace('{d}', chosen.name).replace('{s}', gb(chosen.size))}</span>
          </label>
          <button type="button" className="dh-btn dh-btn-primary" disabled={!confirm} onClick={() => void write()}><Usb size={14} />{t('darkos.usb.write', 'Apagar e criar o pendrive')}</button>
        </div>
      ) : null}

      {run ? (
        <div className="space-y-2" role="status" aria-live="polite">
          <div className="flex items-center justify-between text-[12.5px] text-zinc-300">
            <span className="flex items-center gap-2"><Loader2 size={13} className="animate-spin" />{stepLabel(run.step)}</span>
            <span className="font-mono tabular-nums">{run.percent}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden"><div className="h-full bg-blue-500 transition-[width] duration-300" style={{ width: `${run.percent}%` }} /></div>
          {run.file ? <p className="dh-help font-mono truncate">{run.file}</p> : null}
          <p className="dh-help">{t('darkos.usb.dontRemove', 'Não remova o pendrive até terminar.')}</p>
        </div>
      ) : null}

      {result ? (
        <p role="alert" className={`flex items-start gap-2 text-[12.5px] ${result.ok ? 'text-emerald-300' : 'text-red-400'}`}>
          {result.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
          <span>{result.text}{result.ok ? ` ${t('darkos.usb.howBoot', 'Para instalar, ligue o PC pelo pendrive (menu de boot: F12, F11, F8 ou Esc, depende da placa) em modo UEFI.')}` : ''}</span>
        </p>
      ) : null}
    </section>
  );
}
