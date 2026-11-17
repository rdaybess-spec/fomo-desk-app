(function () {
  'use strict';

  var NO_LINK = 'افتح الرابط الخاص اللي وصلك مرة وحدة';
  var NO_DATA = 'ما فيه بيانات بعد';
  var STATE_MS = 15000;
  var SCREEN_MS = 60000;
  var TZ = { timeZone: 'Europe/Moscow' };

  var gate = document.getElementById('gate');
  var desk = document.getElementById('desk');
  var statusEl = document.getElementById('status');
  var dot = document.getElementById('dot');
  var statusTime = document.getElementById('status-time');
  var cashEl = document.getElementById('cash');
  var modeEl = document.getElementById('mode');
  var screenSection = document.getElementById('screen-section');
  var screenImg = document.getElementById('screen');
  var screenTimeRow = document.getElementById('screen-time-row');
  var screenTime = document.getElementById('screen-time');
  var extras = document.getElementById('extras');

  var files = Object.create(null);
  var lastScreenSrc = '';
  var stateTimer = 0;
  var screenTimer = 0;
  var pullSeq = 0;
  var latest = Object.create(null);

  function showMessage(text) {
    gate.hidden = false;
    gate.textContent = text;
    desk.hidden = true;
  }

  function moscowTime(date) {
    return date.toLocaleTimeString('ar', TZ);
  }

  function setStatus(ok) {
    statusEl.hidden = false;
    dot.classList.toggle('ok', ok);
    dot.classList.toggle('bad', !ok);
    statusTime.textContent = moscowTime(new Date());
    dot.setAttribute('aria-label', ok ? 'متصل' : 'غير متصل');
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function formatCash(value) {
    if (typeof value === 'string' && value.trim() !== '') value = Number(value);
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    return '$' + value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function modeLabel(value) {
    if (typeof value !== 'string' || value.trim() === '') return 'PAPER';
    return value.trim().toUpperCase();
  }

  function formatValue(value) {
    if (value == null) return '—';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
      return JSON.stringify(value);
    } catch (err) {
      return '';
    }
  }

  function jpegSrc(file) {
    if (!isPlainObject(file) || !isPlainObject(file.body)) return '';
    var b64 = file.body.b64;
    if (typeof b64 !== 'string') return '';
    var cleaned = b64.replace(/\s+/g, '');
    var prefix = 'data:image/jpeg;base64,';
    if (cleaned.indexOf(prefix) === 0) cleaned = cleaned.slice(prefix.length);
    if (!cleaned || !/^[A-Za-z0-9+/=]+$/.test(cleaned)) return '';
    return prefix + cleaned;
  }

  function addRow(key, value) {
    var li = document.createElement('li');
    var k = document.createElement('span');
    var v = document.createElement('span');
    k.className = 'k';
    v.className = 'v';
    k.textContent = String(key);
    v.textContent = formatValue(value);
    li.appendChild(k);
    li.appendChild(v);
    extras.appendChild(li);
  }

  function renderExtras(stateFile) {
    extras.textContent = '';
    if (!isPlainObject(stateFile)) {
      extras.hidden = true;
      return;
    }
    var body = isPlainObject(stateFile.body) ? stateFile.body : null;
    if (body) {
      Object.keys(body).forEach(function (key) {
        if (key === 'cash' || key === 'mode') return;
        addRow(key, body[key]);
      });
    }
    Object.keys(stateFile).forEach(function (key) {
      if (key === 'body') return;
      addRow(key, stateFile[key]);
    });
    extras.hidden = extras.childElementCount === 0;
  }

  function renderScreen(file) {
    var src = jpegSrc(file);
    if (!src) {
      screenSection.hidden = true;
      lastScreenSrc = '';
      screenImg.removeAttribute('src');
      return;
    }
    screenSection.hidden = false;
    if (src !== lastScreenSrc) {
      lastScreenSrc = src;
      screenImg.src = src;
    }
    var stamp = file && file.updated_at;
    if (stamp == null || stamp === '') {
      screenTime.textContent = '';
      screenTimeRow.hidden = true;
      return;
    }
    var dt = new Date(stamp);
    screenTime.textContent = isNaN(dt.getTime()) ? String(stamp) : moscowTime(dt);
    screenTimeRow.hidden = false;
  }

  function render() {
    var stateFile = isPlainObject(files['state.json']) ? files['state.json'] : null;
    var screenFile = isPlainObject(files['screen.jpg']) ? files['screen.jpg'] : null;
    var src = jpegSrc(screenFile);
    if (!stateFile && !src) {
      showMessage(NO_DATA);
      return;
    }
    var body = stateFile && isPlainObject(stateFile.body) ? stateFile.body : null;
    gate.hidden = true;
    desk.hidden = false;
    cashEl.textContent = body ? formatCash(body.cash) : '—';
    var mode = modeLabel(body ? body.mode : '');
    modeEl.textContent = mode;
    modeEl.classList.toggle('live', mode === 'LIVE');
    modeEl.classList.toggle('paper', mode !== 'LIVE');
    renderExtras(stateFile);
    renderScreen(screenFile);
  }

  function endpoint() {
    var cfg = window.DESK_CONFIG || {};
    var base = typeof cfg.url === 'string' ? cfg.url.replace(/\/+$/, '') : '';
    return base + '/rest/v1/rpc/get_desk';
  }

  function anonKey() {
    var cfg = window.DESK_CONFIG || {};
    return typeof cfg.anon === 'string' ? cfg.anon : '';
  }

  function pull(names) {
    var ticket = ++pullSeq;
    names.forEach(function (name) { latest[name] = ticket; });
    var key = anonKey();
    var payload;
    try {
      payload = JSON.stringify({ data_path: secret, names: names });
    } catch (err) {
      setStatus(false);
      return;
    }
    fetch(endpoint(), {
      method: 'POST',
      cache: 'no-store',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json'
      },
      body: payload
    }).then(function (res) {
      if (!res.ok) throw new Error('http');
      return res.json();
    }).then(function (data) {
      var fresh = names.some(function (name) { return latest[name] === ticket; });
      if (!fresh) return;
      if (!isPlainObject(data)) {
        setStatus(false);
        if (!files['state.json'] && !jpegSrc(files['screen.jpg'])) showMessage(NO_DATA);
        return;
      }
      names.forEach(function (name) {
        if (latest[name] !== ticket) return;
        if (isPlainObject(data[name])) files[name] = data[name];
        else delete files[name];
      });
      setStatus(true);
      render();
    }).catch(function () {
      var fresh = names.some(function (name) { return latest[name] === ticket; });
      if (!fresh) return;
      setStatus(false);
      if (!files['state.json'] && !jpegSrc(files['screen.jpg'])) showMessage(NO_DATA);
    });
  }

  function stopPolling() {
    if (stateTimer) clearInterval(stateTimer);
    if (screenTimer) clearInterval(screenTimer);
    stateTimer = 0;
    screenTimer = 0;
  }

  function startPolling() {
    stopPolling();
    if (document.hidden) return;
    stateTimer = setInterval(function () { pull(['state.json']); }, STATE_MS);
    screenTimer = setInterval(function () { pull(['screen.jpg']); }, SCREEN_MS);
  }

  function secretFromHash() {
    var hash = location.hash || '';
    if (hash.indexOf('#d=') !== 0) return '';
    var raw = hash.slice(3);
    if (!raw) return '';
    try {
      return decodeURIComponent(raw);
    } catch (err) {
      return raw;
    }
  }

  function resolveSecret() {
    var fromHash = secretFromHash();
    if (fromHash) {
      try { localStorage.setItem('desk_d', fromHash); } catch (err) {}
      try {
        history.replaceState(null, '', location.pathname + location.search);
      } catch (err) {}
      return fromHash;
    }
    try {
      return localStorage.getItem('desk_d') || '';
    } catch (err) {
      return '';
    }
  }

  var secret = resolveSecret();
  if (!secret) {
    showMessage(NO_LINK);
    return;
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      stopPolling();
      return;
    }
    pull(['state.json', 'screen.jpg']);
    startPolling();
  });

  if (!document.hidden) {
    pull(['state.json', 'screen.jpg']);
    startPolling();
  }
})();
