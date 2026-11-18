/* pump.fun Desk PWA (STEP 10, plan B; platform moved from FOMO to pump.fun 2026-11-18). Reads the
   desk's files from Supabase get_desk with the private data path (#d=… once, then localStorage).
   Every pump.fun (or old FOMO) link shown here is a "link" field the desk wrote with links.py;
   this file never builds a platform URL. All data is
   rendered with textContent (no HTML from data). Never a made-up number. */
(function () {
  'use strict';
  var STATE_MS = 15000, SCREEN_MS = 15000, TZ = { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' };
  var C = { scanner: '#64d2ff', analyst: '#ffd60a', brain: '#bf5af2', executor: '#00d35a', risk: '#ff6b9a' };
  var files = {}, lastGood = 0, failN = 0, retryAt = 0, range = 'LIVE', tab = 'home', loaded = false;

  function $(id) { return document.getElementById(id); }
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'cls') e.className = attrs[k];
      else if (k === 'style') e.setAttribute('style', attrs[k]);
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); return e; }
  function num(v) { return typeof v === 'number' && isFinite(v); }
  function money(v) { return num(v) ? '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'; }
  function pct(v) { return num(v) ? (v >= 0 ? '+' : '') + v.toFixed(2) + '%' : '—'; }
  function hm(ts) { return num(ts) ? new Date(ts * 1000).toLocaleTimeString('en-GB', TZ) : '—'; }
  function body(name) { var f = files[name]; return f && f.body ? f.body : null; }
  var HOSTS = { 'https://pump.fun/': 'pump.fun', 'https://fomo.family/': 'FOMO' };
  var CHART = 'https://dexscreener.com/solana/';   /* live chart embeds written by links.py */
  function hostName(link) {   /* only pump.fun / fomo.family links written by the desk */
    if (typeof link !== 'string') return null;
    for (var p in HOSTS) if (link.indexOf(p) === 0) return HOSTS[p];
    return null;
  }
  function fomo(link) {
    var n = hostName(link); if (!n) return null;
    return h('a', { cls: 'fomo', href: link, target: '_blank', rel: 'noopener', text: 'Open on ' + n });
  }

  /* ---------------- data ---------------- */
  var secret = (function () {
    var m = (location.hash || '').match(/^#d=(.+)$/);
    if (m) { try { localStorage.setItem('desk_d', decodeURIComponent(m[1])); } catch (e) {}
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
    try { return localStorage.getItem('desk_d') || ''; } catch (e) { return ''; }
  })();
  function pull(names) {
    var cfg = window.DESK_CONFIG || {};
    return fetch(String(cfg.url || '').replace(/\/+$/, '') + '/rest/v1/rpc/get_desk', {
      method: 'POST', cache: 'no-store',
      headers: { apikey: cfg.anon, Authorization: 'Bearer ' + cfg.anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data_path: secret, names: names })
    }).then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); }).then(function (d) {
      if (!d || typeof d !== 'object') throw new Error('shape');
      names.forEach(function (n) { if (d[n]) files[n] = d[n]; });
      lastGood = Date.now(); failN = 0; loaded = true; render(); return d;
    }).catch(function () {
      failN++; retryAt = Date.now() + STATE_MS; loaded = true; render();   /* keep the last good numbers */
    });
  }
  function errRow() {
    var e = $('err');
    if (!failN) { e.hidden = true; return; }
    var n = Math.max(0, Math.round((retryAt - Date.now()) / 1000));
    e.hidden = false;
    e.textContent = 'Desk offline · retrying in ' + n + 's · last update ' + (lastGood ? new Date(lastGood).toLocaleTimeString('en-GB', TZ) : '—');
  }

  /* ---------------- odometer ---------------- */
  var shown = '';
  function odometer(el, text) {
    if (text === shown && el.childElementCount) return;
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    clear(el);
    text.split('').forEach(function (ch, i) {
      var d = h('span', { cls: 'digit' }), inner = h('span', { text: ch });
      d.appendChild(inner); el.appendChild(d);
      if (!reduce && /\d/.test(ch) && shown[i] !== ch) {
        inner.style.transform = 'translateY(100%)';
        setTimeout(function () { inner.style.transitionDelay = (i * 30) + 'ms'; inner.style.transform = 'translateY(0)'; }, 16);
      }
    });
    shown = text;
  }

  /* ---------------- chart ---------------- */
  var RANGES = { LIVE: 3600 * 12, '1H': 3600, '4H': 4 * 3600, '1D': 86400, '1W': 7 * 86400, ALL: Infinity };
  function drawChart(cv, ch, start) {
    var dpr = window.devicePixelRatio || 1, w = cv.clientWidth, H = 180;
    cv.width = w * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
    var g = cv.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, w, H);
    var now = Date.now() / 1000, pts = ((ch && ch.points) || []).filter(function (p) { return now - p[0] <= RANGES[range]; });
    if (pts.length < 2) { g.fillStyle = 'rgba(235,235,245,0.3)'; g.font = '13px -apple-system'; g.fillText('Waiting for the first trade', 0, H / 2); return; }
    var t0 = pts[0][0], t1 = pts[pts.length - 1][0], vs = pts.map(function (p) { return p[1]; });
    if (num(start)) vs.push(start);
    var lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs), top = 40, bot = H - 8;
    if (hi === lo) { hi += 1; lo -= 1; }
    function X(t) { return (t - t0) / Math.max(1, t1 - t0) * w; }
    function Y(v) { return bot - (v - lo) / (hi - lo) * (bot - top); }
    if (num(start)) { g.setLineDash([4, 4]); g.strokeStyle = 'rgba(235,235,245,0.3)'; g.beginPath(); g.moveTo(0, Y(start)); g.lineTo(w, Y(start)); g.stroke(); g.setLineDash([]); }
    var grad = g.createLinearGradient(0, top, 0, bot); grad.addColorStop(0, 'rgba(0,211,90,0.25)'); grad.addColorStop(1, 'rgba(0,211,90,0)');
    g.beginPath(); pts.forEach(function (p, i) { i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])); });
    g.strokeStyle = '#00d35a'; g.lineWidth = 2; g.stroke();
    g.lineTo(X(t1), bot); g.lineTo(X(t0), bot); g.closePath(); g.fillStyle = grad; g.fill();
    var rows = [], col = { blue: '#0a84ff', green: '#00d35a', red: '#ff453a' };
    ((ch && ch.marks) || []).filter(function (m) { return m.ts >= t0; }).forEach(function (m) {
      g.font = '600 11px -apple-system'; var tw = g.measureText(m.text || '').width + 10, x = Math.min(Math.max(0, X(m.ts) - tw / 2), w - tw), r = 0;
      while (rows[r] && rows[r].some(function (s) { return x < s[1] && x + tw > s[0]; })) r++;   /* a later mark moves up a row */
      (rows[r] = rows[r] || []).push([x, x + tw]);
      var y = 2 + r * 16; g.fillStyle = col[m.color] || '#fff'; g.fillText(m.text || '', x + 5, y + 11);
    });
  }

  /* ---------------- screens ---------------- */
  function skeleton(el, blocks) { clear(el); blocks.forEach(function (hgt) { el.appendChild(h('div', { cls: 'sk', style: 'height:' + hgt + 'px;margin:10px 0' })); }); }
  function checks(c) {
    c = c || {};
    if (c.screen == null && c.api == null && c.chain == null) return h('span', { cls: 'checks na', text: 'PAPER fill · no checks' });
    function one(k, v) { return h('span', { cls: v === 'n/a' ? 'na' : v ? 'ok' : 'no', text: (v === 'n/a' ? '–' : v ? '✓' : '✗') + ' ' + k }); }
    return h('span', { cls: 'checks' }, [one('screen', c.screen), one('api', c.api), one('chain', c.chain)]);
  }
  function actRow(r) {
    var open = function () { if (r.kind === 'rejected') openAudit(r.mint); else if (r.mint) openCoin(r.mint); };
    return h('div', { cls: 'row', onclick: open }, [
      h('div', { cls: 'm' }, [h('div', { cls: 't', text: r.title || '' }), h('div', { cls: 's', text: r.subtitle || '' })]),
      h('div', { cls: 'v' }, [h('div', { text: r.value || '', style: 'color:' + (r.kind === 'stopped' ? 'var(--red)' : r.kind === 'sold' ? 'var(--green)' : 'var(--text)') }), fomo(r.link)])
    ]);
  }
  function botCard(b, full) {
    var kids = [h('div', { cls: 'bname' }, [h('i', { cls: 'sdot' + (b.alive && !b.paused ? ' on' : '') }), h('span', { text: b.bot.charAt(0).toUpperCase() + b.bot.slice(1), style: 'color:' + (C[b.bot] || '#fff') }), b.paused ? h('span', { cls: 's', text: '· paused' }) : null]),
      h('div', { cls: 'count', text: b.count || '' })];
    if (b.bot === 'scanner') kids.push(h('div', { cls: 'feed' }, (b.feed || []).map(function (f) {
      return h('div', { cls: f.verdict === 'kill' ? 'killed' : '', text: (f.symbol || (f.mint || '').slice(0, 6)) + (f.verdict === 'kill' ? ' · ' + (f.reason || '') : ' → Analyst') });
    })));
    if (b.bot === 'analyst') {
      var s = h('div', { cls: 'strips' }); for (var i = 1; i <= 8; i++) { var l = (b.layers || []).filter(function (x) { return x.n === i; })[0]; s.appendChild(h('i', { cls: l ? (l.pass ? 'g' : 'r') : '' })); }
      kids.push(s, h('div', {}, [h('span', { cls: 'ring', text: num(b.score) ? String(b.score) : '—', style: 'color:' + (num(b.score) && b.score >= 70 ? 'var(--green)' : 'var(--t2)') }), h('span', { cls: 's', text: num(b.social) && b.social ? '  Social +' + b.social : (b.social_plan === 'A' || b.social_plan === 'B') ? '  Social: on · waiting for an 8/8 coin' : '  Social: off' })]));
    }
    if (b.bot === 'brain') kids.push(h('div', { text: b.last ? money(b.last.usd) + ' · ' + (num(b.last.pct) ? b.last.pct + '% of cash' : '') : 'Sizing' }), h('div', { cls: 's', text: b.rule || '' }));
    if (b.bot === 'executor') kids.push(h('div', { text: b.bar || 'Idle' }));
    if (b.bot === 'risk') kids.push(h('div', { cls: 'pills' }, (b.pills || []).map(function (p, i) { return h('span', { cls: 'pill ' + (i ? 'pg' : 'pr'), text: p }); })));
    if (full) kids.push(h('div', { cls: 'note', text: b.bot === 'risk' && b.locked ? 'Pause locked while a position is open' : 'Pause / resume: send "pause ' + b.bot + '" in Telegram or the Grok Bot chat' }));
    return h('div', { cls: 'card', style: full ? 'margin-bottom:10px' : '' }, kids);
  }

  function renderHome() {
    var el = $('home-body'), st = body('state.json');
    if (!loaded) { skeleton(el, [70, 180, 44, 200, 120, 160]); return; }
    if (!st) { clear(el).appendChild(h('div', { cls: 'empty', text: 'Waiting for the first trade' })); return; }
    clear(el);
    var bal = h('div', { cls: 'balance num' }); odometer(bal, money(num(st.balance) ? st.balance : st.cash));
    el.appendChild(h('div', { cls: 'balrow' }, [bal, st.mode !== 'LIVE' ? h('span', { cls: 'pill paper', text: 'PAPER' }) : null]));
    el.appendChild(h('div', { cls: 'today' + (num(st.todayPct) && st.todayPct < 0 ? ' neg' : '') }, [pct(st.todayPct) + ' today  ', num(st.multiplier) ? h('span', { cls: 'pill mult', text: st.multiplier.toFixed(2) + '×' }) : null]));
    var cv = h('canvas', { id: 'chart' }); el.appendChild(cv);
    var rs = h('div', { cls: 'ranges' }); Object.keys(RANGES).forEach(function (r) { rs.appendChild(h('button', { cls: r === range ? 'on' : '', text: r, onclick: function () { range = r; render(); } })); });
    el.appendChild(rs);
    var scr = files['screen.jpg'], age = scr && scr.updated_at ? (Date.now() - new Date(scr.updated_at).getTime()) / 1000 : Infinity;
    var box = h('div', { cls: 'screen', onclick: openFull }, [
      h('div', { cls: 'tl' }, [h('i', { cls: 'ldot' + (age < 5 ? ' live' : '') }), age < 5 ? "Live · Bot's computer" : 'Last frame ' + (isFinite(age) ? new Date(scr.updated_at).toLocaleTimeString('en-GB', TZ) : '—')]),
      h('div', { cls: 'tr', text: st.lane || 'Idle' })]);
    var img = screenImg(); if (img) box.appendChild(img);
    el.appendChild(box);
    var lo = st.lastOrder;
    el.appendChild(h('div', { cls: 'lastorder' }, lo ? [(lo.side === 'buy' ? 'Bought ' : 'Sold ') + (lo.mint || '').slice(0, 6) + ' · ' + money(lo.usd) + ' · ' + lo.status + ' ', checks(lo.checks)] : ['No orders yet']));
    var running = (st.bots || []).filter(function (b) { return b.alive && !b.paused; }).length;
    el.appendChild(h('h2', { text: 'Bots · ' + running + ' running' }));
    el.appendChild(h('div', { cls: 'carousel' }, (st.bots || []).map(function (b) { return botCard(b, false); })));
    el.appendChild(h('h2', {}, ['Activity', h('button', { text: 'See all', onclick: function () { go('activity'); } })]));
    var rows = st.activity5 || [];
    el.appendChild(rows.length ? h('div', { cls: 'list' }, rows.map(actRow)) : h('div', { cls: 'empty', text: 'Nothing yet tonight' }));
    if (st.copy) {   /* the PAPER copier's own book (copy.db), shown only when the desk published it */
      var cp = st.copy;
      el.appendChild(h('h2', {}, ['Copy · PAPER', h('button', { text: 'See all', onclick: openCopy })]));
      el.appendChild(h('div', { cls: 'list' }, [h('div', { cls: 'row', onclick: openCopy }, [
        h('div', { cls: 'm' }, [h('div', { cls: 't', text: 'Copy cash ' + money(cp.cash) }),
          h('div', { cls: 's', text: cp.leaders + ' leaders · ' + cp.open + ' open · ' + cp.closed + ' closed' })]),
        h('div', { cls: 'v', text: (num(cp.pnlUsd) && cp.pnlUsd >= 0 ? '+' : '') + money(cp.pnlUsd), style: 'color:' + (num(cp.pnlUsd) && cp.pnlUsd < 0 ? 'var(--red)' : 'var(--green)') })])]));
      var coins = cp.coins || [];   /* every coin the copier entered, open first */
      el.appendChild(h('h2', { text: 'Coins · ' + coins.length }));
      el.appendChild(coins.length ? h('div', { cls: 'list' }, coins.map(function (r) { return copyRow(r, r.valueUsd !== null && r.valueUsd !== undefined); }))
        : h('div', { cls: 'empty', text: 'No coins yet' }));
    }
    requestAnimationFrame(function () { drawChart(cv, body('chart.json'), st.multiplier && st.balance ? st.balance / st.multiplier : null); });
  }
  var imgs = [new Image(), new Image()], front = 0, lastSrc = '';
  function screenImg() {   /* double buffered: swap only after the new frame decoded */
    var f = files['screen.jpg'], b = f && f.body && f.body.b64;
    if (typeof b !== 'string' || !/^[A-Za-z0-9+/=\s]+$/.test(b)) return null;
    var src = 'data:image/jpeg;base64,' + b.replace(/\s+/g, '');
    if (!lastSrc) { imgs[front].src = src; lastSrc = src; }
    if (src !== lastSrc) {
      var back = imgs[1 - front];
      if (back.src !== src) { back.onload = function () { if (lastSrc !== src) { front = 1 - front; lastSrc = src; render(); } }; back.src = src; }
      if (back.complete && back.naturalWidth && lastSrc !== src) { front = 1 - front; lastSrc = src; }
    }
    var cur = imgs[front].cloneNode(); cur.alt = ''; return cur.src ? cur : null;
  }
  function openFull() { var i = screenImg(); if (!i) return; $('fs-img').src = i.src; $('fs').classList.add('on'); }
  $('fs').addEventListener('click', function () { $('fs').classList.remove('on'); });

  function renderBots() {
    var el = clear($('tab-bots')), st = body('state.json');
    el.appendChild(h('h2', { text: 'Bots' }));
    if (!st) { skeleton(el, [120, 120, 120, 120, 120]); return; }
    (st.bots || []).forEach(function (b) { el.appendChild(botCard(b, true)); });
    el.appendChild(h('button', { cls: 'btn s', text: 'Settings', onclick: function () { go('account'); } }));
  }
  function renderActivity() {
    var el = clear($('tab-activity')), a = body('activity.json');
    el.appendChild(h('h2', { text: 'Activity' }));
    if (!a) { skeleton(el, [56, 56, 56, 56]); return; }
    el.appendChild((a.rows || []).length ? h('div', { cls: 'list' }, a.rows.map(actRow)) : h('div', { cls: 'empty', text: 'Nothing yet tonight' }));
    var o = body('orders.json');
    if (o && (o.rows || []).length) {
      el.appendChild(h('h2', { text: 'Orders' }));
      el.appendChild(h('div', { cls: 'list' }, o.rows.map(function (r) {
        return h('div', { cls: 'row' }, [h('div', { cls: 'm' }, [h('div', { cls: 't', text: '#' + r.id + ' ' + r.side + ' · ' + r.status }), h('div', { cls: 's', text: (r.quote_text || r.error || r.reason || '') })]), h('div', { cls: 'v' }, [checks(r.checks), fomo(r.link)])]);
      })));
    }
  }
  function renderAccount() {
    var el = clear($('tab-account')), a = body('account.json');
    el.appendChild(h('h2', { text: 'Account' }));
    if (!a) { skeleton(el, [60, 60, 200]); return; }
    el.appendChild(h('div', { cls: 'list' }, [
      h('div', { cls: 'row' }, [h('div', { cls: 'm' }, [h('div', { cls: 't', text: a.mode === 'LIVE' ? 'LIVE' : 'PAPER' }), h('div', { cls: 's', text: 'LIVE: type LIVE in Telegram or the Grok Bot chat (locked until 1 PAPER night + STEP 15)' })])]),
      h('div', { cls: 'row' }, [h('div', { cls: 'm' }, [h('div', { cls: 't', text: 'Cash' }), h('div', { cls: 's', text: money(a.cash) })])]),
      a.profile ? h('a', { cls: 'row fomo', href: a.profile, target: '_blank', rel: 'noopener', text: 'Your ' + (a.platform || 'pump.fun') + ' profile' }) : null,
      h('div', { cls: 'row', onclick: function () { invite(a.invite); } }, [h('div', { cls: 'm' }, [h('div', { cls: 't', text: 'Invite a friend' }), h('div', { cls: 's', text: a.platform ? 'Platform: ' + a.platform : '' })])]),
      h('div', { cls: 'row' }, [h('div', { cls: 'm' }, [h('div', { cls: 't', text: 'Pushes' }), h('div', { cls: 's', text: a.pushes || '' })])]),
      h('div', { cls: 'row' }, [h('div', { cls: 'm' }, [h('div', { cls: 't', text: 'Copy picks' }), h('div', { cls: 's', text: a.copyPicks || 'off' })])])]));
    el.appendChild(h('div', { cls: 'note', text: 'Settings: send "set <name> to <value>" in Telegram or the Grok Bot chat. Out of range is refused with the range.' }));
    Object.keys(a.settings || {}).forEach(function (sec) {
      el.appendChild(h('h2', { text: sec.charAt(0).toUpperCase() + sec.slice(1) }));
      el.appendChild(h('div', { cls: 'list' }, a.settings[sec].map(function (s) {
        var kids = [h('span', { text: s.key.split('.')[1] })];
        if (num(s.min) && num(s.max) && num(s.value)) kids.push(h('input', { type: 'range', min: s.min, max: s.max, value: s.value, disabled: 'disabled' }));
        kids.push(h('span', { cls: 'mono', text: String(s.value) }));
        return h('div', { cls: 'set' }, kids);
      })));
    });
  }
  function invite(url) {
    if (typeof url !== 'string') return;
    if (navigator.share) navigator.share({ url: url }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { alert('Link copied'); });
  }

  /* ---------------- sheets: Audit, Coin ---------------- */
  function sheet(kids) { var s = clear($('sheet')); s.appendChild(h('button', { cls: 'back', text: '‹ Back', onclick: function () { s.classList.remove('on'); } })); kids.forEach(function (k) { if (k) s.appendChild(k); }); s.classList.add('on'); }
  function openAudit(mint) {
    var n = 'audit/' + mint + '.json';
    sheet([h('div', { cls: 'sk', style: 'height:300px' })]);
    pull([n]).then(function () {
      var a = body(n); if (!a) { sheet([h('div', { cls: 'empty', text: 'No audit for this coin' })]); return; }
      var discs = h('div', { cls: 'discs' });
      for (var i = 1; i <= 8; i++) { var l = (a.layers || []).filter(function (x) { return x.n === i; })[0];
        discs.appendChild(h('div', { cls: 'disc ' + (l ? (l.pass ? 'g' : 'r') : '') }, [h('b', { text: l ? (l.pass ? '✓' : '✗') : '·' }), h('span', { text: l ? l.value || '' : '' })])); }
      sheet([h('h2', { text: (a.symbol || a.mint.slice(0, 6)) + ' · Audit' }), discs, h('div', { cls: 'note', text: a.social || 'Social: off' }), fomo(a.link)]);
      var d = discs.children, k = 0; (function beam() { if (k > 0) d[k - 1].classList.remove('beam'); if (k < d.length) { d[k].classList.add('beam'); k++; setTimeout(beam, 250); } })();
    });
  }
  function copyRow(r, open) {
    var v = open ? money(r.valueUsd) + ' now' : (num(r.pnlUsd) && r.pnlUsd >= 0 ? '+' : '') + money(r.pnlUsd) + (num(r.pnlPct) ? ' (' + pct(r.pnlPct) + ')' : '');
    return h('div', { cls: 'row', onclick: function (e) { if (e.target.tagName !== 'A') openLive(r.mint); } }, [h('div', { cls: 'm' }, [h('div', { cls: 't', text: (open ? '🟢 ' : '') + (r.symbol || (r.mint || '').slice(0, 6)) + ' · copying ' + (r.leader || '?') }),
      h('div', { cls: 's', text: money(r.costUsd) + ' in · bought ' + hm(r.openedTs) + (open ? ' · open' : ' · sold ' + hm(r.closedTs)) + (r.reason ? ' · ' + r.reason : '') })]),
      h('div', { cls: 'v' }, [h('div', { text: v, style: 'color:' + (!open && num(r.pnlUsd) && r.pnlUsd < 0 ? 'var(--red)' : 'var(--text)') }), fomo(r.link)])]);
  }
  var liveMint = null;
  function liveRow(r) {   /* the coin's latest numbers from the copier, refreshed on every publish */
    var open = r.valueUsd !== null && r.valueUsd !== undefined, pnl = num(r.pnlUsd) ? r.pnlUsd : null;
    return h('div', { cls: 'note', id: 'live-nums' }, [(open ? 'LIVE · value ' + money(r.valueUsd) : 'Closed · ' + (r.reason || '')) +
      ' · P&L ' + (pnl !== null && pnl >= 0 ? '+' : '') + money(pnl) + (num(r.pnlPct) ? ' (' + pct(r.pnlPct) + ')' : '') +
      (num(r.lastPrice) ? ' · price ' + r.lastPrice.toPrecision(4) : '') + (num(r.entryPrice) ? ' · entry ' + r.entryPrice.toPrecision(4) : '') +
      ' · ' + money(r.costUsd) + ' in at ' + hm(r.openedTs)]);
  }
  function findCoin(mint) { var st = body('state.json'), cs = st && st.copy && st.copy.coins || []; return cs.filter(function (c) { return c.mint === mint; })[0]; }
  function openLive(mint) {
    var r = findCoin(mint); if (!r) return;
    liveMint = mint;
    var kids = [h('h2', {}, [(r.symbol || mint.slice(0, 6)) + ' · copying ' + (r.leader || '?'), h('span', { cls: 'pill paper', text: 'PAPER' })]), liveRow(r)];
    if (typeof r.chart === 'string' && r.chart.indexOf(CHART) === 0)
      kids.push(h('iframe', { src: r.chart, style: 'width:100%;height:420px;border:0;border-radius:12px;background:#000', title: 'Live chart' }));
    kids.push(fomo(r.link));
    sheet(kids);
  }
  function refreshLive() {   /* keep the open coin sheet's numbers live without reloading the chart */
    var el = $('live-nums'); if (!liveMint || !el || !$('sheet').classList.contains('on')) return;
    var r = findCoin(liveMint); if (r) el.parentNode.replaceChild(liveRow(r), el);
  }
  function openCopy() {
    sheet([h('div', { cls: 'sk', style: 'height:300px' })]);
    pull(['copy.json']).then(function () {
      var c = body('copy.json'); if (!c) { sheet([h('div', { cls: 'empty', text: 'Copy is not running' })]); return; }
      sheet([h('h2', {}, ['Copy', h('span', { cls: 'pill paper', text: 'PAPER' })]),
        h('div', { cls: 'note', text: 'Cash ' + money(c.cash) + ' of ' + money(c.startCash) + ' · P&L ' + money(c.pnlUsd) + ' · separate from the desk balance' }),
        h('h2', { text: 'Open copies' }), (c.open || []).length ? h('div', { cls: 'list' }, c.open.map(function (r) { return copyRow(r, true); })) : h('div', { cls: 'empty', text: 'None open' }),
        h('h2', { text: 'Closed copies' }), (c.closed || []).length ? h('div', { cls: 'list' }, c.closed.map(function (r) { return copyRow(r, false); })) : h('div', { cls: 'empty', text: 'None closed yet' }),
        h('h2', { text: 'Leaders' }), h('div', { cls: 'list' }, (c.leaders || []).map(function (l) {
          return h('div', { cls: 'row' }, [h('div', { cls: 'm' }, [h('div', { cls: 't', text: l.username || (l.wallet || '').slice(0, 6) }), h('div', { cls: 's', text: (l.boards || []).join(' · ') })]), fomo(l.link)]); }))]);
    });
  }
  function openCoin(mint) {
    var n = 'coin/' + mint + '.json';
    sheet([h('div', { cls: 'sk', style: 'height:300px' })]);
    pull([n]).then(function () {
      var c = body(n); if (!c) { sheet([h('div', { cls: 'empty', text: 'No data for this coin yet' })]); return; }
      var p = c.position || {}, cv = h('canvas');
      var kids = [h('h2', {}, [(c.symbol || mint.slice(0, 6)) + ' · Solana', body('state.json') && body('state.json').mode !== 'LIVE' ? h('span', { cls: 'pill paper', text: 'PAPER' }) : null]),
        h('span', { cls: 'pill pg', text: c.shield || '' }),
        h('div', { cls: 'balance num', style: 'font-size:44px;margin:10px 0', text: num(c.price) ? '$' + c.price.toPrecision(4) : '—' }),
        h('div', { cls: 'today', text: num(p.sinceEntryPct) ? '▲ ' + p.sinceEntryPct.toFixed(1) + '% since entry' : '' }), cv,
        p.mint ? h('div', { cls: 'note', text: 'Your position · ' + money(p.sizeUsd) + ' in · Executor' }) : null];
      var link = fomo(c.link); if (link) { link.className = 'btn p'; kids.push(link); }
      if (p.mint) kids.push(h('div', { cls: 'note', text: 'Sell now: send "sell ' + (c.symbol || mint) + ' 25|50|100" in Telegram or the Grok Bot chat' }));
      sheet(kids);
      requestAnimationFrame(function () { candles(cv, c.candles || [], p.stop); });
    });
  }
  function candles(cv, cs, exitLine) {
    var dpr = window.devicePixelRatio || 1, w = cv.clientWidth, H = 200; cv.width = w * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
    var g = cv.getContext('2d'); g.scale(dpr, dpr); if (!cs.length) return;
    var lo = Math.min.apply(null, cs.map(function (c) { return c[3]; })), hi = Math.max.apply(null, cs.map(function (c) { return c[2]; }));
    if (num(exitLine)) { lo = Math.min(lo, exitLine); hi = Math.max(hi, exitLine); } if (hi === lo) hi = lo * 1.01 + 1e-12;
    function Y(v) { return H - 6 - (v - lo) / (hi - lo) * (H - 12); } var bw = Math.max(2, w / cs.length - 2);
    cs.forEach(function (c, i) { var x = i * (w / cs.length); g.strokeStyle = g.fillStyle = c[4] >= c[1] ? '#00d35a' : '#ff453a';
      g.beginPath(); g.moveTo(x + bw / 2, Y(c[2])); g.lineTo(x + bw / 2, Y(c[3])); g.stroke(); g.fillRect(x, Math.min(Y(c[1]), Y(c[4])), bw, Math.max(1, Math.abs(Y(c[1]) - Y(c[4])))); });
    if (num(exitLine)) { g.setLineDash([5, 4]); g.strokeStyle = '#ff9f0a'; g.beginPath(); g.moveTo(0, Y(exitLine)); g.lineTo(w, Y(exitLine)); g.stroke(); }
  }

  /* ---------------- search ---------------- */
  $('nav-search').addEventListener('click', function () { $('search').classList.toggle('on'); $('search-in').focus(); });
  $('search-in').addEventListener('input', function () {
    var q = this.value.trim().toLowerCase(), out = clear($('search-out')), st = body('state.json');
    if (!q || !st) return;
    var seen = {}, rows = [];
    (st.positions || []).concat((body('activity.json') || {}).rows || []).forEach(function (r) {
      if (!r.mint || seen[r.mint]) return; var s = ((r.symbol || '') + ' ' + (r.name || '') + ' ' + r.mint + ' ' + (r.title || '')).toLowerCase();
      if (s.indexOf(q) >= 0) { seen[r.mint] = 1; rows.push(r); } });
    out.appendChild(h('div', { cls: 'list' }, rows.slice(0, 8).map(function (r) { return h('div', { cls: 'row', onclick: function () { openCoin(r.mint); } }, [h('div', { cls: 'm', text: r.symbol || r.title || r.mint }), fomo(r.link)]); })));
  });
  $('nav-avatar').addEventListener('click', function () { go('account'); });
  $('nav-bell').addEventListener('click', function () {
    var p = body('pushes.json'); sheet([h('h2', { text: 'Pushes' }), p && (p.rows || []).length ? h('div', { cls: 'list' }, p.rows.slice().reverse().map(function (r) { return h('div', { cls: 'row' }, [h('div', { cls: 'm' }, [h('div', { cls: 't', text: r.text }), h('div', { cls: 's', text: 'Grok Bot · ' + hm(r.ts) })]), fomo(r.link)]); })) : h('div', { cls: 'empty', text: 'No pushes yet' })]);
    try { localStorage.setItem('desk_seen_push', String(Date.now() / 1000)); } catch (e) {}
  });

  /* ---------------- shell ---------------- */
  function go(t) { tab = t; ['home', 'bots', 'activity', 'account'].forEach(function (x) { $('tab-' + x).hidden = x !== t; });
    Array.prototype.forEach.call(document.querySelectorAll('.tabbar button'), function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === t); });
    if (t === 'account') pull(['account.json']); if (t === 'activity') pull(['activity.json', 'orders.json']); render(); }
  Array.prototype.forEach.call(document.querySelectorAll('.tabbar button'), function (b) { b.addEventListener('click', function () { go(b.getAttribute('data-tab')); }); });
  function render() {
    errRow();
    var p = body('pushes.json'), seen = 0; try { seen = Number(localStorage.getItem('desk_seen_push') || 0); } catch (e) {}
    $('bell-dot').hidden = !(p && (p.rows || []).some(function (r) { return r.ts > seen; }));
    if (tab === 'home') renderHome(); else if (tab === 'bots') renderBots(); else if (tab === 'activity') renderActivity(); else renderAccount();
    refreshLive();
  }
  window.__desk = { files: files, render: render, go: go, openAudit: openAudit, openCoin: openCoin, openCopy: openCopy, setLoaded: function (v) { loaded = v; }, fail: function (n) { failN = n; retryAt = Date.now() + 9000; } };
  if (!secret && !window.__deskPreview) { $('gate').hidden = false; $('gate').textContent = 'Open the private link once'; $('app').hidden = true; return; }
  var timers = [];
  function start() { timers.forEach(clearInterval); timers = []; if (document.hidden || window.__deskPreview) return;
    pull(['state.json', 'chart.json', 'activity.json', 'pushes.json', 'screen.jpg']);
    timers.push(setInterval(function () { pull(['state.json', 'chart.json', 'pushes.json']); }, STATE_MS));
    timers.push(setInterval(function () { pull(['screen.jpg']); }, SCREEN_MS));
    timers.push(setInterval(errRow, 1000)); }
  document.addEventListener('visibilitychange', start);
  render(); start();
})();
