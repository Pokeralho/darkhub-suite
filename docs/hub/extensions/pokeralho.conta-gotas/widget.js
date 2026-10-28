var t = darkhub.t, hist = [];
function $(id) { return document.getElementById(id); }
$('pick').textContent = t('Pegar cor', 'Pick color');

function draw() {
  var c = hist[0];
  $('sw').style.background = c ? Colors.hex(c) : 'transparent';
  $('hex').textContent = c ? Colors.hex(c) : '—';
  var row = $('recent'); row.textContent = '';
  hist.slice(1, 9).forEach(function (rgb) {
    var hex = Colors.hex(rgb);
    var b = document.createElement('button'); b.type = 'button'; b.style.background = hex;
    b.title = hex; b.setAttribute('aria-label', t('Copiar ', 'Copy ') + hex);
    b.onclick = function () { darkhub.clipboard.writeText(hex).then(function () { $('msg').textContent = t('Copiado ', 'Copied ') + hex; }); };
    row.appendChild(b);
  });
}

darkhub.storage.get('history').then(function (h) { hist = Array.isArray(h) ? h : []; draw(); });

$('pick').onclick = function () {
  darkhub.screen.pickColor().then(function (r) {
    if (!r) return;
    var hex = Colors.hex(r.rgb);
    hist = [r.rgb].concat(hist.filter(function (x) { return Colors.hex(x) !== hex; })).slice(0, 24);
    darkhub.storage.set('history', hist);
    darkhub.clipboard.writeText(hex).then(function () { $('msg').textContent = t('Copiado', 'Copied'); });
    draw();
  }, function (e) { $('msg').textContent = e.message; });
};
