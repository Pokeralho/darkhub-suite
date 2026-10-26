import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Loader2, ExternalLink, Plus, Trash2, Search, X, Play, Pause, Eye, EyeOff, AlertTriangle, CheckCircle2, Gamepad2, Power } from '../components/icons';
import PageHeader from '../components/ui/PageHeader';
import { useI18n } from '../i18n/I18nProvider';
import type { KgAccount, KgDashboard, KgEntitlement, KgGame, KgLoginAttempt, KgMe, KgPlan, KgStatus } from '../global';

const api = () => window.darkhub?.kakugan;
const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Kakugan (kakugan.darkhub.ink) inside DarkHub: plans, Steam accounts farming hours and cards, QR sign-in. */
export default function Kakugan() {
  const { t, lang } = useI18n();
  const [status, setStatus] = useState<KgStatus | null>(null);
  const [plans, setPlans] = useState<KgPlan[]>([]);
  const [me, setMe] = useState<KgMe | null>(null);
  const [dash, setDash] = useState<KgDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [names, setNames] = useState<Record<number, KgGame>>({});
  const [login, setLogin] = useState<{ planId?: string; accountId?: string } | null>(null);
  const [prefs, setPrefs] = useState<{ notify?: boolean; autoPause?: boolean }>({});
  useEffect(() => { api()?.getSettings().then((r) => { if (r?.ok) setPrefs({ notify: r.notify, autoPause: r.autoPause }); }); }, []);
  const setPref = async (patch: { notify?: boolean; autoPause?: boolean }) => { const r = await api()?.setSettings(patch); if (r?.ok) setPrefs({ notify: r.notify, autoPause: r.autoPause }); };

  const loadDash = useCallback(async () => {
    const r = await api()?.dashboard();
    if (r?.ok && r.dashboard) setDash(r.dashboard);
    else if (r?.status === 401) { setMe(null); setDash(null); }
    else if (r && !r.ok) setMsg({ ok: false, text: r.error || '' });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api()?.state();
      if (!r?.ok) { setMsg({ ok: false, text: r?.error || t('kg.err.offline', 'Could not reach Kakugan.') }); return; }
      setStatus(r.status ?? null);
      setPlans(r.plans ?? []);
      setMe(r.me ?? null);
      if (r.me) await loadDash();
    } finally { setLoading(false); }
  }, [loadDash, t]);

  useEffect(() => { load(); }, [load]);
  // live state of the accounts while the screen is open
  useEffect(() => {
    if (!me) return;
    const id = window.setInterval(() => { if (!document.hidden) loadDash(); }, 30000);
    return () => window.clearInterval(id);
  }, [me, loadDash]);

  // game names for the appIDs the accounts play
  const allIds = useMemo(() => [...new Set((dash?.plans ?? []).flatMap((p) => p.accounts.flatMap((a) => a.games)))], [dash]);
  useEffect(() => {
    const missing = allIds.filter((id) => !names[id]);
    if (!missing.length) return;
    api()?.gameNames({ ids: missing }).then((r) => { if (r?.ok && r.games) setNames((n) => ({ ...n, ...Object.fromEntries(r.games!.map((g) => [g.id, g])) })); });
  }, [allIds, names]);

  const act = async (fn: () => Promise<{ ok: boolean; error?: string } | undefined>, okText?: string) => {
    const r = await fn();
    if (r?.ok) { if (okText) setMsg({ ok: true, text: okText }); await loadDash(); }
    else setMsg({ ok: false, text: r?.error || t('kg.err.generic', 'Failed') });
    return Boolean(r?.ok);
  };

  const open = (page: string) => api()?.openSite({ page });

  return (
    <div className="w-full max-w-5xl mx-auto">
      <PageHeader
        title={<span className="inline-flex items-center gap-2.5">Kakugan <span className="text-zinc-500 font-normal">赫眼</span></span>}
        subtitle={t('kg.subtitle', 'Your Steam playing 24 hours a day: hours and cards on autopilot, on a server that never sleeps.')}
        actions={(
          <div className="flex items-center gap-2">
            {status ? (
              <span className={`inline-flex items-center gap-1.5 text-[12px] ${status.asfOnline ? 'text-emerald-300' : 'text-amber-300'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${status.asfOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                {status.asfOnline ? t('kg.farmOnline', 'Farm online') : t('kg.farmOffline', 'Farm offline')}
              </span>
            ) : null}
            <button onClick={load} disabled={loading} className="dh-btn dh-btn-sm"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />{t('kg.refresh', 'Refresh')}</button>
          </div>
        )}
      />

      {msg ? (
        <p role="status" className={`mb-4 text-[12.5px] ${msg.ok ? 'text-emerald-300' : 'text-amber-300'}`}>{msg.text}</p>
      ) : null}

      {loading && !status ? <p className="dh-help flex items-center gap-2"><Loader2 size={14} className="animate-spin" />{t('kg.loading', 'Connecting to Kakugan...')}</p> : null}

      {!loading && !me ? (
        <LoginBox onDone={(m) => { setMe(m); setMsg(null); loadDash(); }} openSite={open} />
      ) : null}

      {me ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[13px] text-zinc-300">{t('kg.signedAs', 'Signed in as')} <span className="text-zinc-100 font-medium">{me.name}</span> <span className="text-zinc-500">({me.email})</span></p>
            <div className="flex gap-2">
              <button onClick={() => open('/painel')} className="dh-btn dh-btn-sm"><ExternalLink size={13} />{t('kg.openPanel', 'Open on the website')}</button>
              <button onClick={async () => { await api()?.logout(); setMe(null); setDash(null); }} className="dh-btn dh-btn-sm"><Power size={13} />{t('kg.logout', 'Sign out')}</button>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[12.5px] text-zinc-300">
            <label className="flex items-center gap-2"><input type="checkbox" checked={prefs.notify !== false} onChange={(e) => void setPref({ notify: e.target.checked })} />
              {t('kg.pref.notify', 'Avisar na bandeja (código da Steam, plano vencendo, farm fora do ar)')}</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={prefs.autoPause !== false} onChange={(e) => void setPref({ autoPause: e.target.checked })} />
              {t('kg.pref.autoPause', 'Pausar o farm enquanto eu jogo pela Biblioteca')}</label>
          </div>

          {dash && !dash.asfOnline ? <p className="text-[12.5px] text-amber-300 flex items-center gap-2"><AlertTriangle size={14} />{t('kg.asfDown', 'The farm server is offline right now: hours resume when it is back.')}</p> : null}

          {dash?.plans.length ? dash.plans.map((p) => (
            <PlanCard key={p.id} plan={p} names={names} lang={lang}
              onConnect={() => setLogin({ planId: p.id })}
              onRelogin={(a) => setLogin({ accountId: a.id })}
              onPatch={(a, patch) => act(() => api()!.updateAccount({ id: a.id, patch }))}
              onInput={(a, kind, value) => act(() => api()!.accountInput({ id: a.id, kind, value }), t('kg.inputSent', 'Sent to the farm.'))}
              onRemove={(a) => act(() => api()!.removeAccount({ id: a.id }), t('kg.removed', 'Account removed from Kakugan.'))}
            />
          )) : dash ? <p className="dh-help">{t('kg.noPlans', 'You have no active plan. Pick one below; payment happens on the website (Pix, card or boleto).')}</p> : null}

          <Plans plans={plans} onBuy={(id) => open(`/assinar/${id}`)} />
        </div>
      ) : null}

      {!me && plans.length ? <div className="mt-8"><Plans plans={plans} onBuy={(id) => open(`/assinar/${id}`)} /></div> : null}

      {login ? <SteamLoginModal target={login} onClose={(done) => { setLogin(null); if (done) { setMsg({ ok: true, text: t('kg.connected', 'Steam account connected. It starts farming in a few seconds.') }); loadDash(); } }} /> : null}

      <p className="mt-8 dh-help max-w-[80ch]">{t('kg.risk', '')}</p>
    </div>
  );
}

function LoginBox({ onDone, openSite }: { onDone: (me: KgMe) => void; openSite: (p: string) => void }) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    const r = await api()?.login({ email, password });
    setBusy(false);
    if (r?.ok && r.me) onDone(r.me); else setError(r?.error || t('kg.err.generic', 'Failed'));
  };
  return (
    <form onSubmit={submit} className="dh-card p-5 max-w-md space-y-3">
      <h2 className="dh-section-title">{t('kg.login.title', 'Sign in to Kakugan')}</h2>
      <label className="block space-y-1"><span className="dh-label">E-mail</span>
        <input className="dh-input w-full" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="block space-y-1"><span className="dh-label">{t('kg.login.password', 'Password')}</span>
        <input className="dh-input w-full" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {error ? <p role="alert" className="text-[12.5px] text-amber-300">{error}</p> : null}
      <div className="flex items-center gap-2 flex-wrap">
        <button type="submit" disabled={busy} className="dh-btn dh-btn-primary">{busy ? <Loader2 size={14} className="animate-spin" /> : null}{t('kg.login.submit', 'Sign in')}</button>
        <button type="button" onClick={() => openSite('/criar-conta')} className="dh-btn"><ExternalLink size={13} />{t('kg.login.create', 'Create an account on the website')}</button>
      </div>
      <p className="dh-help">{t('kg.login.note', 'Your Kakugan session stays encrypted on this PC. Your Steam password is never stored.')}</p>
    </form>
  );
}

function Plans({ plans, onBuy }: { plans: KgPlan[]; onBuy: (id: string) => void }) {
  const { t } = useI18n();
  if (!plans.length) return null;
  return (
    <section>
      <h2 className="dh-section-title mb-3">{t('kg.plans', 'Plans')}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((p) => (
          <div key={p.id} className={`dh-card p-4 flex flex-col gap-2 ${p.highlight ? 'border-blue-400/50' : ''}`}>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[14px] font-medium text-zinc-100">{p.name}</p>
              <p className="font-mono text-[13px] text-zinc-200">{brl(p.priceCents)}</p>
            </div>
            <p className="dh-help">{p.summary}</p>
            <ul className="text-[12px] text-zinc-400 space-y-0.5 flex-1">{p.features.map((f) => <li key={f}>· {f}</li>)}</ul>
            <button onClick={() => onBuy(p.id)} className={`dh-btn dh-btn-sm ${p.highlight ? 'dh-btn-primary' : ''}`}><ExternalLink size={13} />{t('kg.buy', 'Subscribe on the website')}</button>
          </div>
        ))}
      </div>
    </section>
  );
}

type Patch = { games?: number[]; farmCards?: boolean; invisible?: boolean; paused?: boolean; customGame?: string | null };

function PlanCard({ plan, names, lang, onConnect, onRelogin, onPatch, onInput, onRemove }: {
  plan: KgEntitlement; names: Record<number, KgGame>; lang: string;
  onConnect: () => void; onRelogin: (a: KgAccount) => void; onPatch: (a: KgAccount, p: Patch) => Promise<boolean>;
  onInput: (a: KgAccount, kind: 'password' | 'email_code' | 'app_code', value: string) => Promise<boolean>; onRemove: (a: KgAccount) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const expires = new Date(plan.expiresAt).toLocaleDateString(lang === 'en-US' ? 'en-US' : 'pt-BR');
  const hoursLeft = plan.kind === 'HOURS' ? Math.max(0, Math.floor((plan.minutesTotal - plan.minutesUsed) / 60)) : null;
  return (
    <section className="dh-card p-0 overflow-hidden">
      <header className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap border-b border-zinc-800">
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-zinc-100">{plan.name} {plan.active ? null : <span className="ml-2 text-[11.5px] text-amber-300">{t('kg.expired', 'expired')}</span>}</p>
          <p className="dh-help">
            {t('kg.until', 'Valid until')} {expires}
            {hoursLeft !== null ? ` · ${hoursLeft} ${t('kg.hoursLeft', 'hours left')}` : ''}
            {` · ${plan.accounts.length}/${plan.slots} ${t('kg.accounts', 'accounts')}`}
          </p>
        </div>
        {plan.active && plan.accounts.length < plan.slots ? (
          <button onClick={onConnect} className="dh-btn dh-btn-sm dh-btn-primary"><Plus size={13} />{t('kg.connect', 'Connect a Steam account')}</button>
        ) : null}
      </header>
      {plan.accounts.length ? (
        <ul>{plan.accounts.map((a) => <AccountRow key={a.id} a={a} plan={plan} names={names} onRelogin={() => onRelogin(a)} onPatch={(p) => onPatch(a, p)} onInput={(k, v) => onInput(a, k, v)} onRemove={() => onRemove(a)} />)}</ul>
      ) : <p className="px-4 py-3 dh-help">{t('kg.noAccounts', 'No Steam account connected to this plan yet.')}</p>}
    </section>
  );
}

const STATE_TONE: Record<KgAccount['state'], string> = {
  online: 'text-emerald-300', connecting: 'text-blue-300', paused: 'text-zinc-400', stopped: 'text-zinc-400', expired: 'text-amber-300',
  offline: 'text-amber-300', missing: 'text-amber-300', needs_password: 'text-amber-300', needs_email_code: 'text-amber-300', needs_app_code: 'text-amber-300'
};

function AccountRow({ a, plan, names, onRelogin, onPatch, onInput, onRemove }: {
  a: KgAccount; plan: KgEntitlement; names: Record<number, KgGame>;
  onRelogin: () => void; onPatch: (p: Patch) => Promise<boolean>; onInput: (k: 'password' | 'email_code' | 'app_code', v: string) => Promise<boolean>; onRemove: () => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const run = async (fn: () => Promise<boolean>) => { setBusy(true); try { return await fn(); } finally { setBusy(false); } };
  const need = a.state === 'needs_password' ? 'password' : a.state === 'needs_email_code' ? 'email_code' : a.state === 'needs_app_code' ? 'app_code' : null;

  return (
    <li className="px-4 py-3 border-b border-zinc-800/60 last:border-b-0 space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        {a.avatar ? <img src={a.avatar} alt="" className="w-9 h-9 rounded-md" /> : <div className="w-9 h-9 rounded-md bg-zinc-800 grid place-items-center"><Gamepad2 size={16} className="text-zinc-500" /></div>}
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-zinc-100 truncate">{a.nickname || a.steamLogin} <span className="text-zinc-500">· {a.steamLogin}</span></p>
          <p className={`text-[12px] ${STATE_TONE[a.state]}`}>
            {t(`kg.state.${a.state}`, a.state)}
            {a.playingElsewhere ? <span className="text-zinc-400"> · {t('kg.playingElsewhere', 'you are playing on another PC: the farm waits')}</span> : null}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={() => run(() => onPatch({ paused: a.state !== 'paused' }))} disabled={busy || !plan.active} className="dh-btn dh-btn-sm">
            {a.state === 'paused' ? <Play size={13} /> : <Pause size={13} />}{a.state === 'paused' ? t('kg.resume', 'Resume') : t('kg.pause', 'Pause')}
          </button>
          <button onClick={() => run(() => onPatch({ invisible: !a.invisible }))} disabled={busy} className="dh-btn dh-btn-sm" title={t('kg.invisibleHelp', 'Appear offline to friends while farming')}>
            {a.invisible ? <EyeOff size={13} /> : <Eye size={13} />}{a.invisible ? t('kg.invisible', 'Invisible') : t('kg.visible', 'Visible')}
          </button>
          {plan.kind === 'UNLIMITED' ? (
            <button onClick={() => run(() => onPatch({ farmCards: !a.farmCards }))} disabled={busy} className="dh-btn dh-btn-sm">{a.farmCards ? t('kg.cardsOn', 'Cards: on') : t('kg.cardsOff', 'Cards: off')}</button>
          ) : null}
          {plan.kind !== 'CARDS' ? <button onClick={() => setEditing((v) => !v)} className="dh-btn dh-btn-sm"><Gamepad2 size={13} />{t('kg.games', 'Games')} ({a.games.length})</button> : null}
          {a.state === 'missing' || a.state === 'stopped' || need ? <button onClick={onRelogin} disabled={!plan.active} className="dh-btn dh-btn-sm">{t('kg.relogin', 'Sign in with QR again')}</button> : null}
          {confirmRemove ? (
            <>
              <button onClick={() => run(onRemove)} disabled={busy} className="dh-btn dh-btn-sm dh-btn-danger">{t('kg.removeConfirm', 'Remove for good')}</button>
              <button onClick={() => setConfirmRemove(false)} className="dh-btn dh-btn-sm">{t('kg.cancel', 'Cancel')}</button>
            </>
          ) : <button onClick={() => setConfirmRemove(true)} className="dh-btn dh-btn-sm dh-btn-ghost" aria-label={t('kg.remove', 'Remove account')}><Trash2 size={13} /></button>}
        </div>
      </div>

      {need ? (
        <form className="flex items-center gap-2 flex-wrap" onSubmit={async (e) => { e.preventDefault(); if (await run(() => onInput(need, code))) setCode(''); }}>
          <span className="text-[12px] text-amber-300">{t(`kg.need.${need}`, need)}</span>
          <input className="dh-input w-48" type={need === 'password' ? 'password' : 'text'} value={code} onChange={(e) => setCode(e.target.value)} maxLength={need === 'password' ? 128 : 5} required />
          <button type="submit" disabled={busy} className="dh-btn dh-btn-sm">{t('kg.send', 'Send')}</button>
        </form>
      ) : null}

      {a.cards?.farming.length ? (
        <p className="text-[12px] text-zinc-400">
          {t('kg.cardsFarming', 'Farming cards')}: {a.cards.farming.map((g) => `${g.name} (${g.cardsRemaining})`).join(', ')}
          {` · ${a.cards.cardsLeft} ${t('kg.cardsLeft', 'cards left in')} ${a.cards.gamesLeft} ${t('kg.gamesWord', 'games')}`}
        </p>
      ) : null}
      {!editing && a.games.length ? (
        <p className="text-[12px] text-zinc-400 truncate">{t('kg.hoursIn', 'Hours in')}: {a.games.map((id) => names[id]?.name || `App ${id}`).join(', ')}</p>
      ) : null}
      {editing ? <GamesEditor games={a.games} names={names} onSave={async (games) => { if (await run(() => onPatch({ games }))) setEditing(false); }} onCancel={() => setEditing(false)} /> : null}
    </li>
  );
}

function GamesEditor({ games, names, onSave, onCancel }: { games: number[]; names: Record<number, KgGame>; onSave: (g: number[]) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [list, setList] = useState<number[]>(games);
  const [known, setKnown] = useState<Record<number, KgGame>>(names);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<KgGame[]>([]);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(timer.current);
    if (q.trim().length < 2) { setHits([]); return; }
    timer.current = window.setTimeout(async () => {
      const r = await api()?.searchGames({ q: q.trim() });
      if (r?.ok) setHits(r.games ?? []);
    }, 350);
  }, [q]);
  const add = (g: KgGame) => { if (list.length < 32 && !list.includes(g.id)) { setList([...list, g.id]); setKnown((k) => ({ ...k, [g.id]: g })); } };
  return (
    <div className="dh-raised rounded-lg p-3 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {list.map((id) => (
          <span key={id} className="dh-tag inline-flex items-center gap-1">{known[id]?.name || `App ${id}`}
            <button onClick={() => setList(list.filter((x) => x !== id))} aria-label={t('kg.removeGame', 'Remove game')}><X size={11} /></button></span>
        ))}
        {!list.length ? <span className="dh-help">{t('kg.noGames', 'No game chosen: pick up to 32.')}</span> : null}
      </div>
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input className="dh-input w-full pl-8" placeholder={t('kg.searchGames', 'Search a Steam game or type its AppID')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {hits.length ? (
        <ul className="max-h-48 overflow-auto divide-y divide-zinc-800/60">
          {hits.map((g) => (
            <li key={g.id}><button onClick={() => add(g)} disabled={list.includes(g.id) || list.length >= 32} className="w-full flex items-center gap-2 px-2 py-1.5 text-left text-[12.5px] text-zinc-200 hover:bg-zinc-800/60 disabled:opacity-50">
              <img src={g.image} alt="" className="h-5 w-11 object-cover rounded-sm" />{g.name}<span className="ml-auto font-mono text-[11px] text-zinc-500">{g.id}</span></button></li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <button onClick={() => onSave(list)} className="dh-btn dh-btn-sm dh-btn-primary">{t('kg.save', 'Save')} ({list.length}/32)</button>
        <button onClick={onCancel} className="dh-btn dh-btn-sm">{t('kg.cancel', 'Cancel')}</button>
      </div>
    </div>
  );
}

function SteamLoginModal({ target, onClose }: { target: { planId?: string; accountId?: string }; onClose: (done: boolean) => void }) {
  const { t } = useI18n();
  const [attempt, setAttempt] = useState<KgLoginAttempt | null>(null);
  const [error, setError] = useState('');
  const idRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer = 0;
    const poll = async () => {
      if (!alive || !idRef.current) return;
      const r = await api()?.steamLoginPoll({ id: idRef.current });
      if (!alive) return;
      if (r?.ok && r.attempt) {
        setAttempt(r.attempt);
        if (r.attempt.state === 'done') { idRef.current = null; onClose(true); return; }
        if (r.attempt.state === 'failed') { setError(r.attempt.error || t('kg.err.generic', 'Failed')); return; }
      } else if (r) { setError(r.error || ''); return; }
      timer = window.setTimeout(poll, 2000);
    };
    api()?.steamLoginStart(target).then((r) => {
      if (!alive) return;
      if (r?.ok && r.attempt) { idRef.current = r.attempt.id; setAttempt(r.attempt); timer = window.setTimeout(poll, 2000); }
      else setError(r?.error || t('kg.err.generic', 'Failed'));
    });
    return () => {
      alive = false;
      window.clearTimeout(timer);
      if (idRef.current) api()?.steamLoginCancel({ id: idRef.current });
    };
  }, []);

  return (
    <div role="dialog" aria-modal="true" aria-label={t('kg.qr.title', 'Connect with the Steam app')} className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => onClose(false)}>
      <div className="dh-card p-5 w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="dh-section-title">{t('kg.qr.title', 'Connect with the Steam app')}</h2>
          <button onClick={() => onClose(false)} className="dh-btn dh-btn-sm dh-btn-ghost" aria-label={t('kg.cancel', 'Cancel')}><X size={14} /></button>
        </div>
        <p className="dh-help">{t('kg.qr.howto', 'In the Steam app on your phone, open the shield (Steam Guard) and tap "Scan QR code". No password is typed or stored.')}</p>
        <div className="grid place-items-center min-h-[260px]">
          {error ? <p role="alert" className="text-[12.5px] text-amber-300 text-center">{error}</p>
            : attempt?.state === 'scanned' ? <p className="text-[13px] text-blue-300 flex items-center gap-2"><Loader2 size={14} className="animate-spin" />{t('kg.qr.scanned', 'Scanned: approve on your phone...')}</p>
              : attempt?.qrDataUrl ? <img src={attempt.qrDataUrl} alt={t('kg.qr.alt', 'QR code to sign in with Steam')} className="w-[240px] h-[240px] rounded-md" />
                : <Loader2 size={20} className="animate-spin text-zinc-500" />}
        </div>
        {attempt?.state === 'done' ? <p className="text-[12.5px] text-emerald-300 flex items-center gap-2"><CheckCircle2 size={14} />{t('kg.connected', 'Connected')}</p> : null}
      </div>
    </div>
  );
}
