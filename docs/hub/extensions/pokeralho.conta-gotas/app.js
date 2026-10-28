var t = darkhub.t;
var MAX = 24;
var state = { current: null, history: [], autocopy: true, fmt: 'hex' };

function $(id) { return document.getElementById(id); }
function setText(id, pt, en) { $(id).textContent = t(pt, en); }

setText('l-pick', 'Pegar cor da tela', 'Pick a color from the screen');
setText('l-how', 'A janela some, você clica no ponto (em qualquer monitor) e ela volta. Setas movem 1 pixel, Esc cancela.',
  'The window hides, you click the spot (on any monitor) and it comes back. Arrows move 1 pixel, Esc cancels.');
setText('l-auto', 'Copiar automaticamente em', 'Copy automatically as');
setText('l-recent', 'Últimas cores', 'Recent colors');
setText('l-clear', 'Limpar', 'Clear');
setText('empty', 'As cores que você pegar aparecem aqui.', 'The colors you pick show up here.');

function status(text, kind) { var s = $('status'); s.textContent = text || ''; s.className = 'status ' + (kind || ''); }

function copy(text) {
  return darkhub.clipboard.writeText(text).then(function () { status(t('Copiado: ', 'Copied: ') + text, 'ok'); });
}

function show(rgb) {
  state.current = rgb;
  var f = Colors.formats(rgb);
  var sw = $('swatch');
  sw.style.background = f.hex;
  sw.style.color = Colors.ink(rgb);
  $('swatch-hex').textContent = f.hex;
  var box = $('formats');
  box.hidden = false;
  box.textContent = '';
  [['hex', 'HEX'], ['rgb', 'RGB'], ['hsl', 'HSL'], ['oklch', 'OKLCH']].forEach(function (k) {
    var row = document.createElement('div'); row.className = 'fmt';
    var b = document.createElement('b'); b.textContent = k[1];
    var c = document.createElement('code'); c.textContent = f[k[0]];
    var btn = document.createElement('button'); btn.className = 'dh-btn'; btn.type = 'button'; btn.textContent = t('Copiar', 'Copy');
    btn.setAttribute('aria-label', t('Copiar ', 'Copy ') + k[1]);
    btn.onclick = function () { copy(f[k[0]]); };
    row.append(b, c, btn);
    box.appendChild(row);
  });
  renderHistory();
}

function renderHistory() {
  var h = $('history'); h.textContent = '';
  $('empty').hidden = state.history.length > 0;
  $('clear').disabled = !state.history.length;
  state.history.forEach(function (rgb) {
    var hex = Colors.hex(rgb);
    var chip = document.createElement('button');
    chip.type = 'button'; chip.className = 'chip'; chip.textContent = hex;
    chip.style.background = hex; chip.style.color = Colors.ink(rgb);
    chip.setAttribute('aria-pressed', String(Boolean(state.current) && Colors.hex(state.current) === hex));
    chip.onclick = function () { show(rgb); };
    h.appendChild(chip);
  });
}

function save() {
  return Promise.all([
    darkhub.storage.set('history', state.history),
    darkhub.storage.set('prefs', { autocopy: state.autocopy, fmt: state.fmt })
  ]);
}

function remember(rgb) {
  var hex = Colors.hex(rgb);
  state.history = [rgb].concat(state.history.filter(function (x) { return Colors.hex(x) !== hex; })).slice(0, MAX);
  return save();
}

function pick() {
  var btn = $('pick'); btn.disabled = true; status('');
  darkhub.screen.pickColor().then(function (r) {
    btn.disabled = false;
    if (!r) { status(t('Cancelado.', 'Canceled.')); return; }
    remember(r.rgb).then(function () { show(r.rgb); });
    if (state.autocopy) copy(Colors.formats(r.rgb)[state.fmt]);
  }, function (err) { btn.disabled = false; status(err.message, 'err'); });
}

$('pick').onclick = pick;
$('autocopy').onchange = function (e) { state.autocopy = e.target.checked; save(); };
$('fmt').onchange = function (e) { state.fmt = e.target.value; save(); };
$('clear').onclick = function () { state.history = []; save().then(renderHistory); };

Promise.all([darkhub.storage.get('history'), darkhub.storage.get('prefs')]).then(function (v) {
  state.history = Array.isArray(v[0]) ? v[0] : [];
  var p = v[1] || {};
  state.autocopy = p.autocopy !== false;
  state.fmt = ['hex', 'rgb', 'hsl', 'oklch'].indexOf(p.fmt) >= 0 ? p.fmt : 'hex';
  $('autocopy').checked = state.autocopy;
  $('fmt').value = state.fmt;
  if (state.history.length) show(state.history[0]); else renderHistory();
});
