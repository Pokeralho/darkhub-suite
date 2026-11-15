import React, { useEffect, useState } from 'react';
import { Loader2, RefreshCw, KeyRound } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';
import type { SshAuthPrompt, SshSerialOptions, SshTerminalSettings } from '../../global';
import { Drawer, Field, errText } from './ui';
import { openSerial } from './sshStore';
import { TERMINAL_THEMES } from './terminalThemes';

const BAUDS = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];
const LAST_KEY = 'darkhub.ssh.serial.last';

export function SerialDrawer({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [ports, setPorts] = useState<{ port: string; name: string }[] | null>(null);
  const [err, setErr] = useState('');
  const [o, setO] = useState<SshSerialOptions>(() => {
    try { return { port: '', baud: 115200, dataBits: 8, parity: 'None', stopBits: 'One', flow: 'None', newline: 'cr', localEcho: false, ...JSON.parse(localStorage.getItem(LAST_KEY) || '{}') }; } catch { return { port: '', baud: 115200 }; }
  });
  const load = async () => {
    setPorts(null); setErr('');
    const r = await window.darkhub.ssh.serialPorts();
    if (!r.ok) { setErr(errText(r)); setPorts([]); return; }
    setPorts(r.ports);
    if (!o.port && r.ports[0]) setO((x) => ({ ...x, port: r.ports[0].port }));
  };
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (p: Partial<SshSerialOptions>) => setO((x) => ({ ...x, ...p }));
  const connect = () => {
    try { localStorage.setItem(LAST_KEY, JSON.stringify(o)); } catch { /* storage off */ }
    openSerial(o);
    onClose();
  };
  return (
    <Drawer title={t('ssh.serial.title', 'Conexão serial')} onClose={onClose}
      footer={<><button type="button" className="dh-btn" onClick={onClose}>{t('ssh.cancel', 'Cancelar')}</button><button type="button" className="dh-btn dh-btn-primary" disabled={!o.port} onClick={connect}>{t('ssh.connect', 'Conectar')}</button></>}>
      <p className="dh-help">{t('ssh.serial.help', 'Console de roteadores, switches, Arduino, ESP32 e placas por porta COM (USB-serial ou Bluetooth).')}</p>
      <Field label={t('ssh.serial.port', 'Porta')}>
        <div className="flex gap-2">
          <select className="dh-input flex-1" value={o.port} onChange={(e) => set({ port: e.target.value })}>
            {ports === null ? <option>{t('ssh.serial.searching', 'Procurando portas...')}</option> : null}
            {ports?.length === 0 ? <option value="">{t('ssh.serial.none', 'Nenhuma porta COM encontrada')}</option> : null}
            {ports?.map((p) => <option key={p.port} value={p.port}>{p.name}</option>)}
          </select>
          <button type="button" className="dh-btn" onClick={load}>{ports === null ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}</button>
        </div>
      </Field>
      <Field label={t('ssh.serial.baud', 'Velocidade (baud)')}>
        <select className="dh-input w-full font-mono" value={o.baud} onChange={(e) => set({ baud: Number(e.target.value) })}>{BAUDS.map((b) => <option key={b} value={b}>{b}</option>)}</select>
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label={t('ssh.serial.dataBits', 'Bits de dados')}><select className="dh-input w-full" value={o.dataBits} onChange={(e) => set({ dataBits: Number(e.target.value) as 5 | 6 | 7 | 8 })}>{[8, 7, 6, 5].map((b) => <option key={b} value={b}>{b}</option>)}</select></Field>
        <Field label={t('ssh.serial.parity', 'Paridade')}><select className="dh-input w-full" value={o.parity} onChange={(e) => set({ parity: e.target.value as SshSerialOptions['parity'] })}>{['None', 'Even', 'Odd', 'Mark', 'Space'].map((b) => <option key={b} value={b}>{b}</option>)}</select></Field>
        <Field label={t('ssh.serial.stopBits', 'Bits de parada')}><select className="dh-input w-full" value={o.stopBits} onChange={(e) => set({ stopBits: e.target.value as SshSerialOptions['stopBits'] })}><option value="One">1</option><option value="OnePointFive">1.5</option><option value="Two">2</option></select></Field>
      </div>
      <Field label={t('ssh.serial.flow', 'Controle de fluxo')}>
        <select className="dh-input w-full" value={o.flow} onChange={(e) => set({ flow: e.target.value as SshSerialOptions['flow'] })}>
          <option value="None">{t('ssh.none', 'Nenhum')}</option><option value="XOnXOff">XON/XOFF</option><option value="RequestToSend">RTS/CTS</option><option value="RequestToSendXOnXOff">RTS/CTS + XON/XOFF</option>
        </select>
      </Field>
      <Field label={t('ssh.serial.newline', 'Enter envia')}>
        <select className="dh-input w-full" value={o.newline} onChange={(e) => set({ newline: e.target.value as SshSerialOptions['newline'] })}><option value="cr">CR (\r)</option><option value="lf">LF (\n)</option><option value="crlf">CR+LF</option></select>
      </Field>
      <label className="flex items-center gap-2 text-[13px] text-zinc-300"><input type="checkbox" checked={Boolean(o.localEcho)} onChange={(e) => set({ localEcho: e.target.checked })} />{t('ssh.serial.echo', 'Eco local (mostrar o que eu digito)')}</label>
      {err ? <p className="text-[12.5px] text-red-300">{err}</p> : null}
    </Drawer>
  );
}

export function TerminalSettingsDrawer({ settings, onClose, onSaved }: { settings: SshTerminalSettings; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [s, setS] = useState(settings);
  const [err, setErr] = useState('');
  const set = (p: Partial<SshTerminalSettings>) => setS((x) => ({ ...x, ...p }));
  const save = async () => {
    const r = await window.darkhub.ssh.saveSettings({ terminal: s });
    if (!r.ok) { setErr(errText(r)); return; }
    onSaved(); onClose();
  };
  const check = (key: keyof SshTerminalSettings, label: string, help?: string) => (
    <label className="flex items-start gap-2 text-[13px] text-zinc-300"><input type="checkbox" className="mt-0.5" checked={Boolean(s[key])} onChange={(e) => set({ [key]: e.target.checked } as Partial<SshTerminalSettings>)} />
      <span>{label}{help ? <span className="block dh-help">{help}</span> : null}</span></label>
  );
  return (
    <Drawer title={t('ssh.set.title', 'Configurações do terminal')} onClose={onClose}
      footer={<><button type="button" className="dh-btn" onClick={onClose}>{t('ssh.cancel', 'Cancelar')}</button><button type="button" className="dh-btn dh-btn-primary" onClick={save}>{t('ssh.save', 'Salvar')}</button></>}>
      <div className="space-y-2">
        <span className="dh-label">{t('ssh.set.mode', 'Jeito de usar o terminal')}</span>
        <div className="grid grid-cols-2 gap-2">
          {([
            ['simple', t('ssh.set.modeSimple', 'Simples'), t('ssh.set.modeSimpleHelp', 'Como no Bloco de Notas e no VS Code: Ctrl+C copia o que está selecionado, Ctrl+V cola, Ctrl+A seleciona tudo, Ctrl+F busca, botão direito abre um menu. Sem nada selecionado, Ctrl+C para o comando.')],
            ['classic', t('ssh.set.modeClassic', 'Clássico'), t('ssh.set.modeClassicHelp', 'Como no PuTTY e no Linux: todas as teclas vão para o servidor (Ctrl+C interrompe, Ctrl+A vai para o início da linha). Copiar e colar com Ctrl+Shift+C e Ctrl+Shift+V.')]
          ] as const).map(([id, name, help]) => (
            <button type="button" key={id} onClick={() => set({ keyMode: id })} aria-pressed={s.keyMode === id}
              className={`dh-card p-3 text-left space-y-1 ${s.keyMode === id ? 'border-blue-500/60' : ''}`}>
              <span className={`block text-[13px] font-medium ${s.keyMode === id ? 'text-blue-200' : 'text-zinc-200'}`}>{name}</span>
              <span className="block text-[11.5px] leading-snug text-zinc-400">{help}</span>
            </button>
          ))}
        </div>
      </div>
      {check('commandBox', t('ssh.set.commandBox', 'Caixa de comando sob o terminal'), t('ssh.set.commandBoxHelp', 'Escreva e corrija o comando como num editor de texto (setas, seleção com o mouse, Ctrl+Z) e aperte Enter para enviar. ↑ e ↓ trazem os comandos anteriores. Também dá para ligar só em um painel pelo botão de lápis.'))}
      {check('confirmPaste', t('ssh.set.confirmPaste', 'Confirmar antes de colar várias linhas'), t('ssh.set.confirmPasteHelp', 'Cada linha colada vira um comando executado. Mostra o texto antes, para não rodar nada sem querer.'))}
      <div className="h-px bg-zinc-800/80" />
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('ssh.set.fontSize', 'Tamanho da fonte')}><input type="number" min={8} max={32} className="dh-input w-full font-mono" value={s.fontSize} onChange={(e) => set({ fontSize: Number(e.target.value) })} /></Field>
        <Field label={t('ssh.set.lineHeight', 'Altura da linha')}><input type="number" min={1} max={2} step={0.05} className="dh-input w-full font-mono" value={s.lineHeight} onChange={(e) => set({ lineHeight: Number(e.target.value) })} /></Field>
      </div>
      <Field label={t('ssh.set.font', 'Fonte')} help={t('ssh.set.fontHelp', 'Qualquer fonte monoespaçada instalada no Windows, ex.: Cascadia Code, JetBrains Mono, Consolas.')}>
        <input className="dh-input w-full" value={s.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })} list="dh-mono-fonts" />
        <datalist id="dh-mono-fonts">{['Geist Mono Variable', 'Cascadia Code', 'Cascadia Mono', 'Consolas', 'JetBrains Mono', 'Fira Code', 'Courier New', 'Lucida Console'].map((f) => <option key={f} value={f} />)}</datalist>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('ssh.set.cursor', 'Cursor')}>
          <select className="dh-input w-full" value={s.cursorStyle} onChange={(e) => set({ cursorStyle: e.target.value as SshTerminalSettings['cursorStyle'] })}>
            <option value="block">{t('ssh.set.block', 'Bloco')}</option><option value="bar">{t('ssh.set.bar', 'Barra')}</option><option value="underline">{t('ssh.set.underline', 'Sublinhado')}</option>
          </select>
        </Field>
        <Field label={t('ssh.set.scrollback', 'Linhas de histórico')}><input type="number" min={500} max={200000} step={500} className="dh-input w-full font-mono" value={s.scrollback} onChange={(e) => set({ scrollback: Number(e.target.value) })} /></Field>
      </div>
      <Field label={t('ssh.set.defaultTheme', 'Tema padrão de novos hosts')}>
        <select className="dh-input w-full" value={s.defaultThemeId} onChange={(e) => set({ defaultThemeId: e.target.value })}>{TERMINAL_THEMES.map((th) => <option key={th.id} value={th.id}>{th.name}</option>)}</select>
      </Field>
      {check('cursorBlink', t('ssh.set.blink', 'Cursor piscando'))}
      {check('copyOnSelect', t('ssh.set.copyOnSelect', 'Copiar ao selecionar'), t('ssh.set.copyOnSelectHelp', 'Como no PuTTY: selecionar já copia.'))}
      {s.keyMode === 'classic' ? check('rightClickPaste', t('ssh.set.rightClick', 'Botão direito copia a seleção ou cola')) : null}
      {check('bell', t('ssh.set.bell', 'Som do sino (BEL)'))}
      {check('confirmClose', t('ssh.set.confirmClose', 'Confirmar antes de fechar abas com sessões ativas'))}
      {check('logByDefault', t('ssh.set.logDefault', 'Gravar log de todas as sessões'), t('ssh.set.logDefaultHelp', 'Os logs ficam em texto puro, sem cores, na pasta de logs do DarkHub.'))}
      <p className="dh-help">{t('ssh.set.zoomHelp', 'No terminal: Ctrl + = e Ctrl + - mudam o tamanho só daquele painel; Ctrl + 0 volta ao normal.')}</p>
      {err ? <p className="text-[12.5px] text-red-300">{err}</p> : null}
    </Drawer>
  );
}

/** keyboard-interactive login: 2FA codes, OTP, custom PAM questions. */
export function AuthPromptModal({ prompt, onDone }: { prompt: SshAuthPrompt; onDone: () => void }) {
  const { t } = useI18n();
  const [answers, setAnswers] = useState<string[]>(() => prompt.prompts.map(() => ''));
  const send = async (cancel = false) => {
    await window.darkhub.ssh.respondAuth(prompt.requestId, cancel ? null : answers);
    onDone();
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
      <form className="w-[min(480px,100%)] dh-card p-5 space-y-4" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <h2 className="dh-section-title flex items-center gap-2"><KeyRound size={16} className="text-zinc-400" />{prompt.name || t('ssh.auth.title', 'Verificação de login')}</h2>
        <p className="text-[12.5px] text-zinc-400">{prompt.hostLabel} <span className="font-mono">({prompt.hostname})</span></p>
        {prompt.instructions ? <p className="text-[13px] text-zinc-300 whitespace-pre-wrap">{prompt.instructions}</p> : null}
        {prompt.prompts.map((p, i) => (
          <Field key={i} label={p.prompt.trim() || t('ssh.auth.answer', 'Resposta')}>
            <input autoFocus={i === 0} type={p.echo ? 'text' : 'password'} autoComplete="one-time-code" className="dh-input w-full font-mono" value={answers[i]} onChange={(e) => setAnswers((a) => a.map((x, j) => (j === i ? e.target.value : x)))} />
          </Field>
        ))}
        <div className="flex justify-end gap-2">
          <button type="button" className="dh-btn" onClick={() => send(true)}>{t('ssh.cancel', 'Cancelar')}</button>
          <button type="submit" className="dh-btn dh-btn-primary">{t('ssh.auth.send', 'Enviar')}</button>
        </div>
      </form>
    </div>
  );
}
