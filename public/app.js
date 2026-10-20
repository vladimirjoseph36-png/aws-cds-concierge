(() => {
  const $ = (id) => document.getElementById(id);
  const CH = { sms: { c: 'var(--sms)', x: 75 }, rcs: { c: 'var(--rcs)', x: 225 }, wa: { c: 'var(--wa)', x: 375 }, mail: { c: 'var(--mail)', x: 525 } };
  const ORDER = Object.keys(CH);
  const LANGS = [['en', 'English'], ['fr', 'Français'], ['es', 'Español'], ['pt', 'Português']];
  const convs = new Map();
  let lang = 'en', cfg = { demo: true }, snap = null, first = true, cur = null, sid = '';

  try {
    const n = (localStorage.getItem('lang') || navigator.language || 'en').slice(0, 2);
    if (LANGS.some((l) => l[0] === n)) lang = n;
  } catch { /* storage unavailable */ }

  const t = (k) => (I18N[lang] && I18N[lang][k]) || I18N.en[k] || k;
  const cname = (k) => t('ch_' + k);
  const num = (n) => Number(n).toLocaleString(lang);

  // ---- language ----------------------------------------------------------
  function applyLang() {
    document.documentElement.lang = lang;
    document.title = t('title');
    document.querySelectorAll('[data-i18n]').forEach((e) => { e.textContent = t(e.dataset.i18n); });
    ORDER.forEach((k) => { $('t-' + k).textContent = cname(k); });
    $('mode').textContent = t(cfg.demo ? 'modeDemo' : 'modeLive');
    $('note').textContent = t(cfg.demo ? 'noteDemo' : 'noteLive');
    $('lang').setAttribute('aria-label', t('langLabel'));
    $('run').hidden = !cfg.demo;
    renderList();
    if (snap) draw(false);
  }

  // ---- live flow ----------------------------------------------------------
  function buildFlow() {
    let l = '', n = '';
    ORDER.forEach((k) => {
      const c = CH[k];
      l += `<path class="ln" id="l-${k}" d="M300 89 C300 140 ${c.x} 130 ${c.x} 168" style="color:${c.c}"/>`;
      n += `<g class="nd" id="n-${k}" style="color:${c.c}"><rect x="${c.x - 50}" y="168" width="100" height="44" rx="12"/><text id="t-${k}" x="${c.x}" y="195"></text></g>`;
    });
    $('lines').innerHTML = l;
    $('nodes').innerHTML = n;
  }

  function pulse(e) {
    document.querySelectorAll('.nd,.ln').forEach((n) => n.classList.remove('on'));
    document.querySelectorAll('.ln').forEach((n) => { n.style.stroke = ''; });
    $('n-' + e.channel).classList.add('on');
    const l = $('l-' + e.channel);
    l.classList.add('on');
    l.style.stroke = CH[e.channel].c;
    const dot = $('dot');
    const a = 'translate(300px,55px)', z = `translate(${CH[e.channel].x}px,190px)`;
    dot.style.fill = CH[e.channel].c;
    dot.setAttribute('opacity', '1');
    dot.style.transition = 'none';
    dot.style.transform = e.direction === 'out' ? a : z;
    void dot.getBoundingClientRect();
    dot.style.transition = '';
    dot.style.transform = e.direction === 'out' ? z : a;
  }

  // ---- conversations -------------------------------------------------------
  function appendMsg(e) {
    const m = document.createElement('div');
    m.className = 'msg ' + e.direction;
    const h = document.createElement('em');
    h.style.color = CH[e.channel].c;
    h.textContent = `${cname(e.channel)} - ${t(e.direction === 'in' ? 'recv' : 'sentL')}`;
    m.append(h, document.createTextNode(e.text));
    $('thread').append(m);
    $('thread').scrollTop = 1e6;
  }

  function appendTrace(e) {
    if (!e.trace) return;
    const li = document.createElement('li');
    li.style.borderColor = CH[e.channel].c;
    const c = document.createElement('code');
    c.textContent = e.trace.tool;
    const p = document.createElement('p');
    p.textContent = e.trace.detail;
    li.append(c, p);
    $('trace').append(li);
  }

  function showConv() {
    $('thread').textContent = '';
    $('trace').textContent = '';
    const c = convs.get(cur);
    if (c) c.events.forEach((e) => { appendMsg(e); appendTrace(e); });
  }

  function renderList() {
    const box = $('list');
    box.textContent = '';
    if (!convs.size) {
      const d = document.createElement('div');
      d.className = 'empty';
      d.textContent = t('waiting');
      box.append(d);
      return;
    }
    [...convs.values()].reverse().forEach((c) => {
      const last = c.events[c.events.length - 1];
      const b = document.createElement('button');
      b.className = 'conv';
      b.setAttribute('aria-pressed', c.id === cur);
      const n = document.createElement('b');
      n.textContent = c.name;
      const s = document.createElement('small');
      s.textContent = `${cname(last.channel)} - ${last.text.replace(/\s+/g, ' ').slice(0, 42)}`;
      b.append(n, s);
      b.onclick = () => { cur = c.id; showConv(); renderList(); };
      box.append(b);
    });
  }

  function onEvent(e) {
    if (cfg.demo && e.sid !== sid) return; // demo runs are private to each browser tab
    let c = convs.get(e.conversationId);
    if (!c) { c = { id: e.conversationId, name: e.patient, events: [] }; convs.set(c.id, c); }
    c.events.push(e);
    if (!cur) cur = c.id;
    if (cur === c.id) { appendMsg(e); appendTrace(e); }
    pulse(e);
    renderList();
  }

  async function startDemo() {
    sid = Math.random().toString(36).slice(2, 12);
    convs.clear();
    cur = null;
    showConv();
    renderList();
    try { await fetch(`/api/demo/start?lang=${lang}&sid=${sid}`, { method: 'POST' }); } catch { /* offline */ }
  }

  // ---- charts ----------------------------------------------------------------
  const niceMax = (m) => { if (m <= 10) return 10; const p = 10 ** Math.floor(Math.log10(m)); return Math.ceil(m / p) * p; };
  const X = (i) => 34 + i * (596 / 23);

  function sm(p) {
    let d = `M${p[0][0]} ${p[0][1]}`;
    for (let i = 1; i < p.length; i++) { const c = (p[i - 1][0] + p[i][0]) / 2; d += ` C${c} ${p[i - 1][1]} ${c} ${p[i][1]} ${p[i][0]} ${p[i][1]}`; }
    return d;
  }

  function vol(anim) {
    const max = niceMax(Math.max(...ORDER.flatMap((k) => snap.series[k])));
    const Y = (v) => 190 - (v / max) * 180;
    let defs = '<defs>', b = '';
    ORDER.forEach((k) => { const c = CH[k].c; defs += `<linearGradient id='g-${k}' x1='0' y1='0' x2='0' y2='1'><stop offset='0' style='stop-color:${c};stop-opacity:.3'/><stop offset='1' style='stop-color:${c};stop-opacity:0'/></linearGradient>`; });
    defs += '</defs>';
    [0, .25, .5, .75, 1].forEach((f) => { const y = Y(max * f); b += `<line class='gl' x1='34' x2='630' y1='${y}' y2='${y}'/><text class='ax' x='26' y='${y + 4}' text-anchor='end'>${Math.round(max * f)}</text>`; });
    ['-24 h', '-18 h', '-12 h', '-6 h', t('now')].forEach((s, i) => { b += `<text class='ax' x='${X([0, 6, 12, 18, 23][i])}' y='212' text-anchor='${i === 4 ? 'end' : i === 0 ? 'start' : 'middle'}'>${s}</text>`; });
    ORDER.forEach((k) => {
      const c = CH[k].c, a = snap.series[k], d = sm(a.map((v, i) => [X(i), Y(v)]));
      b += `<path d='${d} L${X(23)} 190 L${X(0)} 190Z' style='fill:url(#g-${k})'/><path class='sr${anim ? ' dr' : ''}' pathLength='1' d='${d}' style='color:${c};stroke:${c}'/><circle cx='${X(23)}' cy='${Y(a[23])}' r='4' style='fill:${c};filter:drop-shadow(0 0 6px ${c})'/>`;
    });
    $('vol').innerHTML = defs + b;
    $('lg').innerHTML = ORDER.map((k) => `<span><i style='background:${CH[k].c};color:${CH[k].c}'></i>${cname(k)}</span>`).join('');
  }

  function don(anim) {
    const C = 402.1, tot = snap.total || 1;
    let cum = 0, s = `<circle cx='100' cy='100' r='64' fill='none' stroke-width='16' style='stroke:var(--line)'/>`;
    const pcts = ORDER.map((k) => Math.round((100 * snap.byChannel[k]) / tot));
    ORDER.forEach((k, i) => {
      const len = (C * snap.byChannel[k]) / tot, c = CH[k].c;
      s += `<circle class='dn' cx='100' cy='100' r='64' transform='rotate(-90 100 100)' data-l='${Math.max(0, len - 4)}' stroke-dasharray='${anim ? 0 : Math.max(0, len - 4)} ${C}' stroke-dashoffset='${-cum}' style='stroke:${c};filter:drop-shadow(0 0 6px ${c})'/>`;
      cum += len;
    });
    s += `<text x='100' y='102' text-anchor='middle' style='fill:var(--tx);font:700 24px Chakra Petch,sans-serif'>${num(snap.total)}</text><text class='ax' x='100' y='122' text-anchor='middle'>${t('msgs')}</text>`;
    $('don').innerHTML = s;
    $('lg2').innerHTML = ORDER.map((k, i) => `<span><i style='background:${CH[k].c};color:${CH[k].c}'></i>${cname(k)} ${pcts[i]} %</span>`).join('');
    if (anim) setTimeout(() => document.querySelectorAll('.dn').forEach((e) => e.setAttribute('stroke-dasharray', `${e.dataset.l} ${C}`)), 200);
  }

  function funnel() {
    const f = snap.funnel, pct = (v) => (f.sent ? Math.round((100 * v) / f.sent) : 0);
    const rows = [['fSent', 100], ['fReplied', pct(f.replied)], ['fBooked', pct(f.booked)], ['fDone', pct(f.completed)]];
    if (!$('fun').children.length) {
      $('fun').innerHTML = rows.map((r, i) => `<div class='fr'><div class='t'><span id='fl${i}'></span><b id='fv${i}'></b></div><div class='bar'><i id='fb${i}'></i></div></div>`).join('');
    }
    rows.forEach((r, i) => { $('fl' + i).textContent = t(r[0]); $('fv' + i).textContent = r[1] + ' %'; setTimeout(() => { $('fb' + i).style.width = r[1] + '%'; }, 50); });
  }

  function draw(anim) {
    vol(anim); don(anim); funnel();
    const f = snap.funnel;
    $('k1').textContent = num(snap.total);
    $('k2').textContent = (f.sent ? Math.round((100 * f.replied) / f.sent) : 0) + ' %';
    $('k3').textContent = (f.sent ? Math.round((100 * f.completed) / f.sent) : 0) + ' %';
    $('k4').textContent = ORDER.filter((k) => snap.byChannel[k] > 0).length;
  }

  async function poll() {
    try { snap = await (await fetch('/api/stats')).json(); draw(first); first = false; } catch { /* retry on next tick */ }
  }

  // ---- boot --------------------------------------------------------------------
  async function boot() {
    buildFlow();
    $('lang').innerHTML = LANGS.map((l) => `<option value="${l[0]}">${l[1]}</option>`).join('');
    $('lang').value = lang;
    $('lang').onchange = () => {
      lang = $('lang').value;
      try { localStorage.setItem('lang', lang); } catch { /* ignore */ }
      applyLang();
      if (cfg.demo) startDemo(); // restart so the agent answers in the new language
    };
    $('run').onclick = startDemo;
    try { cfg = await (await fetch('/api/config')).json(); } catch { /* keep defaults */ }
    applyLang();
    await poll();
    setInterval(poll, 3000);
    const es = new EventSource('/api/events');
    es.addEventListener('init', (ev) => {
      if (cfg.demo) startDemo();
      else JSON.parse(ev.data).events.forEach(onEvent);
    });
    es.addEventListener('msg', (ev) => onEvent(JSON.parse(ev.data)));
  }
  boot();
})();
