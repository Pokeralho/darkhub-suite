import React, { useCallback, useEffect, useState } from 'react';
import type { RescueSector } from '../../global';
import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';
import { api, ErrorLine } from './rescueUtils';

/** DiskEditor-style read-only sector viewer: 16 hex columns + ASCII, LBA navigation and a decoded-fields panel. */
export default function SectorHexViewer({ target }: { target: string }) {
  const { t } = useI18n();
  const [lbaInput, setLbaInput] = useState('0');
  const [sector, setSector] = useState<RescueSector | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const load = useCallback(async (lba: number) => {
    setBusy(true); setError(null);
    try {
      const r = await api()?.readSector({ target, lba });
      if (r?.ok) { setSector(r); setLbaInput(String(r.lba)); } else setError(r?.error || t('rescue.hex.fail', 'Não foi possível ler o setor.'));
    } finally { setBusy(false); }
  }, [target, t]);

  useEffect(() => { setSector(null); void load(0); }, [load]);

  const go = (lba: number) => void load(lba);
  const bytes = sector ? sector.raw_hex.match(/../g)?.map((h) => parseInt(h, 16)) ?? [] : [];
  const d = sector?.decoded;
  const sigOff = sector ? sector.sector_size - 2 : -1;
  const ascii = (b: number) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.');

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="dh-card p-4 space-y-3 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <label className="dh-label" htmlFor="rescue-lba">LBA</label>
          <input id="rescue-lba" className="dh-input w-36 font-mono" value={lbaInput} onChange={(e) => setLbaInput(e.target.value.replace(/[^0-9-]/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') go(Number(lbaInput) || 0); }} />
          <button type="button" className="dh-btn dh-btn-sm" disabled={busy} onClick={() => go(Number(lbaInput) || 0)}>{t('rescue.hex.go', 'Ir')}</button>
          <span className="mx-1 h-5 w-px bg-zinc-800" />
          <button type="button" className="dh-btn dh-btn-sm" disabled={busy} onClick={() => go(0)}>LBA 0</button>
          <button type="button" className="dh-btn dh-btn-sm" disabled={busy} onClick={() => go(1)}>LBA 1</button>
          <button type="button" className="dh-btn dh-btn-sm" disabled={busy} onClick={() => go(-1)}>LBA -1</button>
          <span className="mx-1 h-5 w-px bg-zinc-800" />
          <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" aria-label={t('rescue.hex.prev', 'Setor anterior')} disabled={busy || !sector || sector.lba === 0} onClick={() => sector && go(sector.lba - 1)}><ChevronLeft size={14} /></button>
          <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" aria-label={t('rescue.hex.next', 'Próximo setor')} disabled={busy || !sector || sector.lba + 1 >= sector.total_sectors} onClick={() => sector && go(sector.lba + 1)}><ChevronRight size={14} /></button>
          <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" aria-label={t('rescue.reload', 'Recarregar')} disabled={busy} onClick={() => sector && go(sector.lba)}>{busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}</button>
          {sector ? <span className="ml-auto font-mono text-[11px] text-zinc-500">{sector.lba} / {sector.total_sectors - 1} · {sector.sector_size} B</span> : null}
        </div>
        <ErrorLine text={error} />
        {!sector && !error ? <div className="h-[420px] rounded-lg bg-zinc-900 animate-pulse" /> : null}
        {sector ? (
          <div className="overflow-auto max-h-[560px] rounded-lg border border-zinc-800/80 bg-zinc-950 font-mono text-[12px] leading-[20px]" onMouseLeave={() => setHover(null)}>
            <table className="border-collapse">
              <thead className="sticky top-0 bg-zinc-950 text-zinc-600">
                <tr>
                  <th className="px-3 text-left font-normal">offset</th>
                  {Array.from({ length: 16 }, (_, i) => <th key={i} className="w-[22px] text-center font-normal">{i.toString(16).toUpperCase().padStart(2, '0')}</th>)}
                  <th className="px-3 text-left font-normal">ascii</th>
                </tr>
              </thead>
              <tbody>
                {sector.rows.map((row, r) => (
                  <tr key={row.offset}>
                    <td className="px-3 text-zinc-500 select-none">{row.offset.toString(16).toUpperCase().padStart(10, '0')}</td>
                    {Array.from({ length: 16 }, (_, c) => {
                      const i = r * 16 + c;
                      if (i >= bytes.length) return <td key={c} />;
                      const b = bytes[i];
                      const inSector = i % sector.sector_size;
                      const sig = inSector === sigOff || inSector === sigOff + 1;
                      return (
                        <td key={c} onMouseEnter={() => setHover(i)}
                          className={`w-[22px] text-center ${hover === i ? 'bg-blue-500/30 text-zinc-50' : sig ? 'text-blue-300' : b === 0 ? 'text-zinc-700' : 'text-zinc-200'}`}>
                          {b.toString(16).toUpperCase().padStart(2, '0')}
                        </td>
                      );
                    })}
                    <td className="px-3 whitespace-pre text-zinc-400">
                      {Array.from({ length: 16 }, (_, c) => {
                        const i = r * 16 + c;
                        if (i >= bytes.length) return null;
                        return <span key={c} onMouseEnter={() => setHover(i)} className={hover === i ? 'bg-blue-500/30 text-zinc-50' : ''}>{ascii(bytes[i])}</span>;
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {sector && hover !== null ? (
          <p className="font-mono text-[11px] text-zinc-500">
            {t('rescue.hex.offset', 'offset')} 0x{hover.toString(16).toUpperCase()} ({hover}) · u8 {bytes[hover]}
            {hover + 1 < bytes.length ? <> · u16le {bytes[hover] | (bytes[hover + 1] << 8)}</> : null}
            {hover + 3 < bytes.length ? <> · u32le {(bytes[hover] | (bytes[hover + 1] << 8) | (bytes[hover + 2] << 16)) + bytes[hover + 3] * 2 ** 24}</> : null}
          </p>
        ) : null}
      </div>

      <aside className="dh-card p-4 space-y-3 text-[12.5px]">
        <h3 className="dh-section-title">{t('rescue.hex.decoded', 'Campos decodificados')}</h3>
        {!d ? <div className="h-32 rounded bg-zinc-900 animate-pulse" /> : (
          <dl className="space-y-2">
            <Field k={t('rescue.hex.sig', 'Assinatura 0x55AA')} v={d.signature_55aa ? t('rescue.yes', 'presente') : t('rescue.no', 'ausente')} ok={d.signature_55aa} />
            {d.vbr ? <Field k={t('rescue.hex.vbr', 'Setor de boot de volume')} v={`${d.vbr.fs}${d.vbr.label ? ` "${d.vbr.label}"` : ''} · ${d.vbr.sectors} ${t('rescue.sectors', 'setores')}`} /> : null}
            {d.oem_id && d.vbr ? <Field k="OEM ID" v={d.oem_id} mono /> : null}
            {d.gpt_header ? (
              <>
                <Field k={t('rescue.hex.gpt', 'Cabeçalho GPT')} v={d.gpt_header.crc_ok ? t('rescue.hex.crcOk', 'CRC32 confere') : t('rescue.hex.crcBad', 'CRC32 inválido')} ok={d.gpt_header.crc_ok} />
                <Field k="MyLBA / AlternateLBA" v={`${d.gpt_header.my_lba} / ${d.gpt_header.alternate_lba}`} mono />
                <Field k={t('rescue.hex.entries', 'Entradas')} v={`${d.gpt_header.num_entries} @ LBA ${d.gpt_header.entries_lba}`} mono />
                <Field k="Disk GUID" v={d.gpt_header.disk_guid} mono />
              </>
            ) : null}
            {d.mbr_entries.length ? (
              <div className="pt-1">
                <dt className="dh-label mb-1">{t('rescue.hex.mbrTable', 'Tabela MBR')}</dt>
                <ul className="divide-y divide-zinc-800/80">
                  {d.mbr_entries.map((e) => (
                    <li key={e.slot} className="py-1.5 font-mono text-[11.5px] text-zinc-300">
                      #{e.slot} {e.type} <span className="font-sans text-zinc-400">{e.type_name}</span>
                      {e.boot_flag ? <span className="ml-1 text-blue-300">boot</span> : null}
                      <span className="block text-zinc-500">LBA {e.lba_start} · {e.sectors} {t('rescue.sectors', 'setores')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {!d.signature_55aa && !d.gpt_header ? <p className="dh-help">{t('rescue.hex.plain', 'Setor sem estrutura reconhecida (dados ou área livre).')}</p> : null}
          </dl>
        )}
      </aside>
    </div>
  );
}

function Field({ k, v, ok, mono }: { k: string; v: string; ok?: boolean; mono?: boolean }) {
  return (
    <div>
      <dt className="dh-label">{k}</dt>
      <dd className={`${mono ? 'font-mono text-[11.5px] break-all' : ''} ${ok === true ? 'text-emerald-300' : ok === false ? 'text-red-400' : 'text-zinc-200'}`}>{v}</dd>
    </div>
  );
}
