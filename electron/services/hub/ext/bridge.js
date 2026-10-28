/* DarkHub extension bridge (injected into every extension page). window.darkhub talks to the app with postMessage;
   the app answers only what the extension's permissions allow. ASCII only. */
(function () {
  'use strict';
  var meta = window.__DARKHUB_EXT__ || {};
  var seq = 0;
  var pending = {};
  var listeners = {};
  var host = window.parent;

  function send(msg) { msg.__dh = 1; host.postMessage(msg, '*'); }

  window.addEventListener('message', function (e) {
    if (e.source !== host) return;
    var m = e.data;
    if (!m || m.__dh !== 1) return;
    if (m.type === 'result' && pending[m.id]) {
      var p = pending[m.id];
      delete pending[m.id];
      if (m.ok) p.resolve(m.value); else p.reject(new Error(m.error || 'erro'));
    } else if (m.type === 'event') {
      (listeners[m.name] || []).forEach(function (f) { try { f(m.data); } catch (err) { console.error(err); } });
    }
  });

  function call(method, params) {
    return new Promise(function (resolve, reject) {
      var id = ++seq;
      pending[id] = { resolve: resolve, reject: reject };
      send({ type: 'call', id: id, method: method, params: params || {} });
    });
  }

  function text(x) {
    if (typeof x === 'string') return x;
    if (x instanceof Error) return x.stack || x.message;
    try { return JSON.stringify(x); } catch (err) { return String(x); }
  }
  ['log', 'info', 'warn', 'error'].forEach(function (level) {
    var orig = console[level] ? console[level].bind(console) : function () {};
    console[level] = function () {
      var args = Array.prototype.slice.call(arguments);
      orig.apply(null, args);
      try { send({ type: 'log', level: level, args: args.map(text) }); } catch (err) { /* host gone */ }
    };
  });
  window.addEventListener('error', function (e) { console.error((e.message || 'erro') + (e.lineno ? ' (linha ' + e.lineno + ')' : '')); });
  window.addEventListener('unhandledrejection', function (e) { console.error('Promise rejeitada: ' + text(e.reason)); });

  // widgets grow with their content
  if (window.ResizeObserver) {
    new ResizeObserver(function () { send({ type: 'height', value: Math.ceil(document.documentElement.scrollHeight) }); }).observe(document.documentElement);
  }

  function on(name, fn) {
    (listeners[name] = listeners[name] || []).push(fn);
    return function () { listeners[name] = (listeners[name] || []).filter(function (f) { return f !== fn; }); };
  }

  window.darkhub = Object.freeze({
    extension: Object.freeze({ id: meta.id, version: meta.version }),
    lang: meta.lang || 'pt-BR',
    t: function (pt, en) { return (meta.lang === 'en-US' && en) ? en : pt; },
    on: on,
    app: Object.freeze({
      info: function () { return call('app.info'); },
      openExternal: function (url) { return call('app.openExternal', { url: url }); },
      navigate: function (page) { send({ type: 'navigate', page: String(page) }); },
      toast: function (msg) { send({ type: 'toast', text: String(msg).slice(0, 300) }); }
    }),
    storage: Object.freeze({
      get: function (key) { return call('storage.get', { key: key }); },
      set: function (key, value) { return call('storage.set', { key: key, value: value }); },
      delete: function (key) { return call('storage.delete', { key: key }); },
      keys: function () { return call('storage.keys'); }
    }),
    hardware: Object.freeze({ info: function () { return call('hardware.info'); } }),
    sensors: Object.freeze({
      read: function () { return call('sensors.read'); },
      subscribe: function (fn, everyMs) {
        var alive = true;
        var tick = function () {
          if (!alive) return;
          call('sensors.read').then(fn, function (err) { console.error(err.message); }).then(function () { if (alive) setTimeout(tick, Math.max(500, everyMs || 1000)); });
        };
        tick();
        return function () { alive = false; };
      }
    }),
    tweaks: Object.freeze({
      status: function () { return call('tweaks.status'); },
      list: function () { return call('tweaks.list'); }
    }),
    net: Object.freeze({
      fetch: function (url, init) {
        return call('net.fetch', { url: String(url), init: init || {} }).then(function (r) {
          r.json = function () { return JSON.parse(r.body); };
          r.text = function () { return r.body; };
          return r;
        });
      }
    }),
    notify: function (title, body) { return call('ui.notify', { title: title, body: body }); },
    clipboard: Object.freeze({ writeText: function (t) { return call('clipboard.write', { text: t }); } }),
    screen: Object.freeze({ pickColor: function () { return call('screen.pickColor', {}); } }),
    packages: Object.freeze({
      preview: function (pkg, lang) { return call('packages.preview', { pkg: pkg, lang: lang }); },
      install: function (pkg) { return call('packages.install', { pkg: pkg }); },
      installFromHub: function (id) { return call('packages.hubInstall', { id: id }); }
    })
  });
})();
