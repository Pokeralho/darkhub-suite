import React, { useEffect, useState } from 'react';
import { Play, Loader2, CheckCircle2, XCircle, Info } from '../components/icons';
import PageHeader from '../components/ui/PageHeader';
import { useI18n } from '../i18n/I18nProvider';
import type { MaintState, MaintTask, MaintHistoryEntry } from '../global';

function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative w-9 h-5 shrink-0 rounded-full border transition-colors duration-150 ease-out ${on ? 'bg-blue-500 border-blue-400' : 'bg-zinc-800 border-zinc-700'} disabled:opacity-50`}>
      <span className={`absolute top-[2px] ${on ? 'left-[18px]' : 'left-[2px]'} w-3.5 h-3.5 rounded-full bg-zinc-50 transition-all duration-150 ease-out`} />
    </button>
  );
}

const TASK_IDS = ['cleanTemp', 'saveBackups', 'securityLists', 'clamav', 'wingetUpdates'];
const mb = (b: unknown) => `${(Number(b || 0) / 1048576).toFixed(0)} MB`;

export default function Maintenance() {
  const { t, lang } = useI18n();
  const [state, setState] = useState<MaintState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const api = () => window.darkhub?.maint;

  const load = async () => { const s = await api()?.state().catch(() => null); if (s?.ok) setState(s); };
  useEffect(() => {
    void load();
    return api()?.onEvent(() => { void load(); });
  }, []);

  const title = (id: string) => ({
    cleanTemp: t('maint.task.cleanTemp', 'Limpar arquivos temporários'),
    securityLists: t('maint.task.securityLists', 'Atualizar listas de segurança'),
    clamav: t('maint.task.clamav', 'Atualizar assinaturas do ClamAV'),
    saveBackups: t('maint.task.saves', 'Backup dos saves dos jogos'),
    wingetUpdates: t('maint.task.winget', 'Atualizações de programas (winget)')
  } as Record<string, string>)[id] ?? id;
  const desc = (id: string) => ({
    cleanTemp: t('maint.desc.cleanTemp', 'Apaga o conteúdo das pastas temporárias. Arquivos em uso são pulados.'),
    securityLists: t('maint.desc.securityLists', 'Baixa de novo as listas da comunidade ativadas na Segurança Avançada. Não altera o que já está aplicado.'),
    clamav: t('maint.desc.clamav', 'Roda o freshclam se o ClamAV estiver instalado.'),
    saveBackups: t('maint.desc.saves', 'Guarda uma nova versão dos saves de cada jogo que mudou desde o último backup.'),
    wingetUpdates: t('maint.desc.winget', 'Verifica quais programas têm atualização. Só instala se você ligar a opção abaixo.')
  } as Record<string, string>)[id] ?? '';

  const update = async (id: string, patch: Parameters<NonNullable<typeof window.darkhub>['maint']['setTask']>[0]['patch']) => {
    setError(null);
    const s = await api()?.setTask({ id, patch }).catch((e) => ({ ok: false, error: String(e?.message ?? e) } as MaintState));
    if (s?.ok) setState(s); else setError(s?.error ?? 'error');
  };
  const runNow = async (id: string) => {
    setError(null);
    const r = await api()?.runNow({ id }).catch((e) => ({ ok: false, error: String(e?.message ?? e) }));
    if (!r?.ok) setError(r?.error ?? 'error');
    await load();
  };

  const summary = (h: MaintHistoryEntry) => {
    if (!h.ok) return h.error ?? '';
    const s = h.summary || {};
    if (h.id === 'cleanTemp') return t('maint.sum.clean', '{mb} liberados, {n} arquivos').replace('{mb}', mb(s.freedBytes)).replace('{n}', String(s.files ?? 0));
    if (h.id === 'securityLists') return s.note === 'no-lists' ? t('maint.sum.noLists', 'nenhuma lista ativada') : t('maint.sum.lists', '{n} listas atualizadas').replace('{n}', String(s.updated ?? 0));
    if (h.id === 'saveBackups') return t('maint.sum.saves', '{s} jogos com backup novo, {u} sem mudanças').replace('{s}', String(s.saved ?? 0)).replace('{u}', String(s.unchanged ?? 0));
    if (h.id === 'clamav') return s.note === 'not-installed' ? t('maint.sum.noClam', 'ClamAV não instalado') : t('maint.sum.clam', 'assinaturas atualizadas');
    if (h.id === 'wingetUpdates') return s.installed != null
      ? t('maint.sum.wingetInstalled', '{i} de {n} atualizados').replace('{i}', String(s.installed)).replace('{n}', String(s.available))
      : t('maint.sum.winget', '{n} atualizações disponíveis').replace('{n}', String(s.available ?? 0));
    return '';
  };

  // 2026-10-25 is a Sunday, so index 0 = Sunday like Date.getDay(); names follow the app language
  const weekdays = [0, 1, 2, 3, 4, 5, 6].map((d) => new Date(2026, 9, 25 + d).toLocaleDateString(lang, { weekday: 'long' }));

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      <PageHeader
        title={t('nav.maintenance', 'Manutenção agendada')}
        subtitle={t('maint.subtitle', 'Tarefas que rodam sozinhas no horário escolhido enquanto o DarkHub estiver aberto (inclusive na bandeja). Se o PC estiver desligado na hora, a tarefa roda uma vez quando o DarkHub abrir de novo.')}
      />
      {error && <p role="alert" className="text-[12.5px] text-red-400">{error}</p>}

      <div className="space-y-3">
        {TASK_IDS.map((id) => {
          const task: MaintTask | undefined = state?.tasks[id];
          const running = state?.running === id;
          return (
            <section key={id} className="rounded-xl border border-zinc-800/80 p-4">
              <div className="flex items-start gap-3">
                <Switch on={Boolean(task?.enabled)} disabled={!task} onChange={(v) => void update(id, { enabled: v })} label={title(id)} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] text-zinc-100">{title(id)}</p>
                  <p className="dh-help mt-0.5">{desc(id)}</p>
                  {task && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-zinc-300">
                      <select className="dh-input" value={task.freq} onChange={(e) => void update(id, { freq: e.target.value as MaintTask['freq'] })}>
                        <option value="daily">{t('maint.daily', 'Todo dia')}</option>
                        <option value="weekly">{t('maint.weekly', 'Toda semana')}</option>
                        <option value="monthly">{t('maint.monthly', 'Todo mês')}</option>
                      </select>
                      {task.freq === 'weekly' && (
                        <select className="dh-input" value={task.weekday} onChange={(e) => void update(id, { weekday: Number(e.target.value) })}>
                          {weekdays.map((w, i) => <option key={i} value={i}>{w}</option>)}
                        </select>
                      )}
                      {task.freq === 'monthly' && (
                        <label className="flex items-center gap-1.5">{t('maint.day', 'dia')}
                          <input type="number" min={1} max={28} className="dh-input w-16" value={task.day} onChange={(e) => void update(id, { day: Number(e.target.value) })} />
                        </label>
                      )}
                      <label className="flex items-center gap-1.5">{t('maint.at', 'às')}
                        <input type="time" className="dh-input w-28" value={task.time} onChange={(e) => e.target.value && void update(id, { time: e.target.value })} />
                      </label>
                      {id === 'wingetUpdates' && (
                        <label className="flex items-center gap-2 select-none" title={t('maint.installHelp', 'Instala todas as atualizações em modo silencioso, aceitando os termos de cada programa.')}>
                          <input type="checkbox" checked={task.options.install === true} onChange={(e) => void update(id, { options: { install: e.target.checked } })} />
                          {t('maint.install', 'Instalar automaticamente')}
                        </label>
                      )}
                    </div>
                  )}
                  <p className="mt-2 text-[11.5px] text-zinc-500">
                    {task?.lastRunAt ? t('maint.last', 'Última vez: {d}').replace('{d}', new Date(task.lastRunAt).toLocaleString()) : t('maint.never', 'Nunca rodou')}
                    {task?.nextRunAt ? ` · ${t('maint.next', 'Próxima: {d}').replace('{d}', new Date(task.nextRunAt).toLocaleString())}` : ''}
                  </p>
                </div>
                <button type="button" onClick={() => void runNow(id)} disabled={!!state?.running} className="dh-btn dh-btn-sm shrink-0">
                  {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}{t('maint.runNow', 'Rodar agora')}
                </button>
              </div>
            </section>
          );
        })}
      </div>

      <p className="flex items-start gap-2 dh-help"><Info size={13} className="mt-0.5 shrink-0" />{t('maint.tray', 'Para as tarefas rodarem sem você abrir o app, deixe o DarkHub iniciar com o Windows (ele fica na bandeja).')}</p>

      {(state?.history.length ?? 0) > 0 && (
        <section>
          <h2 className="dh-section-title mb-2">{t('maint.history', 'Histórico')}</h2>
          <div className="rounded-xl border border-zinc-800/80 divide-y divide-zinc-900">
            {state!.history.slice(0, 20).map((h, i) => (
              <div key={`${h.at}-${i}`} className="flex items-center gap-3 px-3 py-2 text-[12.5px] min-w-0">
                {h.ok ? <CheckCircle2 size={14} className="text-emerald-400 shrink-0" /> : <XCircle size={14} className="text-red-400 shrink-0" />}
                <span className="text-zinc-500 tabular-nums shrink-0">{new Date(h.at).toLocaleString()}</span>
                <span className="text-zinc-200 shrink-0">{title(h.id)}</span>
                <span className={`truncate ${h.ok ? 'text-zinc-400' : 'text-red-300'}`}>{summary(h)}</span>
                {h.manual && <span className="ml-auto text-[11px] text-zinc-600 shrink-0">{t('maint.manual', 'manual')}</span>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
