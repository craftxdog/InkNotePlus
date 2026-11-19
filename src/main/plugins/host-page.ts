import { randomBytes } from 'node:crypto';

// Runs inside a sandboxed frame with an opaque origin. Plugins reach the app
// only through these messages, and the app decides what each one may do.
export const pluginRuntimeSource = String.raw`
'use strict';
var pending = new Map();
var commands = new Map();
var nextId = 1;
var plugin = null;
var send = function (message) { parent.postMessage(message, '*'); };
var call = function (method, params) {
  return new Promise(function (resolve, reject) {
    var id = nextId++;
    pending.set(id, { resolve: resolve, reject: reject });
    send({ type: 'request', id: id, method: method, params: params || {} });
  });
};
var settings = {};
var notify = function (level) {
  return function (message, options) {
    return call('notifications.add', {
      level: level,
      message: String(message),
      detail: options && options.detail ? String(options.detail) : undefined,
    });
  };
};
var database = {
  notes: {
    get: function (id) { return call('notes.get', { id: id }); },
    put: function (doc) { return call('notes.put', { doc: doc }); },
    all: function (options) { return call('notes.all', options); },
  },
  books: { all: function () { return call('books.all'); } },
  tags: { all: function () { return call('tags.all'); } },
};
var api = {
  isInkNote: true,
  commands: {
    add: function (_target, map) {
      var names = Object.keys(map);
      names.forEach(function (name) { commands.set(name, map[name]); });
      send({ type: 'commands', names: names });
      return { dispose: function () {
        names.forEach(function (name) { commands.delete(name); });
        send({ type: 'commands-removed', names: names });
      } };
    },
    dispatch: function (target, name) {
      return call('commands.dispatch', { name: typeof target === 'string' ? target : name });
    },
  },
  notifications: {
    addInfo: notify('info'),
    addSuccess: notify('success'),
    addWarning: notify('warning'),
    addError: notify('error'),
  },
  main: { dataStore: { getLocalDB: function () { return database; } } },
  config: {
    get: function (key) { return settings[key]; },
    set: function (key, value) { settings[key] = value; },
  },
  editor: {
    getValue: function () { return call('editor.getValue'); },
    getSelection: function () { return call('editor.getSelection'); },
    replaceSelection: function (text) { return call('editor.replaceSelection', { text: String(text) }); },
  },
};
var inkdrop = new Proxy(api, {
  get: function (target, key) {
    if (typeof key === 'symbol' || key in target) return target[key];
    throw new Error('InkNote no admite inkdrop.' + String(key) + ' en plugins aislados.');
  },
});
function start(bundle) {
  var cache = {};
  var resolve = function (from, name) {
    var joined = name.charAt(0) === '.' ? from.split('/').slice(0, -1).concat(name.split('/')) : name.split('/');
    var parts = [];
    joined.forEach(function (part) {
      if (part === '..') parts.pop();
      else if (part && part !== '.') parts.push(part);
    });
    var base = parts.join('/');
    return [base, base + '.js', base + '.json', base + '/index.js'].find(function (file) {
      return Object.prototype.hasOwnProperty.call(bundle.files, file);
    });
  };
  var load = function (file) {
    if (cache[file]) return cache[file].exports;
    var module = { exports: {} };
    cache[file] = module;
    if (/\.json$/.test(file)) {
      module.exports = JSON.parse(bundle.files[file]);
      return module.exports;
    }
    var require = function (name) {
      if (name === 'inkdrop') return inkdrop;
      var target = name.charAt(0) === '.' ? resolve(file, name) : resolve('', 'node_modules/' + name);
      if (!target) throw new Error('Este plugin necesita "' + name + '", que no está disponible en InkNote.');
      return load(target);
    };
    new Function('module', 'exports', 'require', 'inkdrop', bundle.files[file] + '\n//# sourceURL=plugin://' + bundle.name + '/' + file)(module, module.exports, require, inkdrop);
    return module.exports;
  };
  return Promise.resolve().then(function () {
    var loaded = load(bundle.main);
    plugin = loaded && loaded.default ? loaded.default : loaded;
    var config = (plugin && plugin.config) || {};
    Object.keys(config).forEach(function (key) { settings[key] = config[key] && config[key].default; });
    return plugin && plugin.activate ? plugin.activate() : undefined;
  });
}
window.addEventListener('message', function (event) {
  if (event.source !== parent) return;
  var message = event.data || {};
  if (message.type === 'start') {
    start(message.bundle).then(
      function () { send({ type: 'started' }); },
      function (error) { send({ type: 'failed', message: String((error && error.message) || error) }); }
    );
  } else if (message.type === 'response') {
    var request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.ok) request.resolve(message.value);
    else request.reject(new Error(message.error));
  } else if (message.type === 'command') {
    var command = commands.get(message.name);
    if (command) command({ target: document.body });
  } else if (message.type === 'stop') {
    if (plugin && plugin.deactivate) plugin.deactivate();
  }
});
send({ type: 'ready' });
`;

export function pluginHostResponse() {
  const nonce = randomBytes(18).toString('base64');
  const html = `<!doctype html><meta charset="utf-8"><title>Plugin</title><script nonce="${nonce}">${pluginRuntimeSource}</script>`;
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      // The sandbox keeps the frame opaque even if the embedding page changes.
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}' 'unsafe-eval'; base-uri 'none'; form-action 'none'; sandbox allow-scripts`,
    },
  });
}
