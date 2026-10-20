import express from 'express';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from './src/config.js';
import { bus, recent, snapshot, seedDemoStats } from './src/bus.js';
import { begin, createConversation, onInbound } from './src/engine.js';
import { runDemo } from './src/demo.js';
import { normalize } from './src/inbound.js';
import { SUPPORTED } from './src/i18n.js';

const app = express();
app.set('trust proxy', 1); // Render terminates TLS in front of the app
app.disable('x-powered-by');
if (config.demo) seedDemoStats();

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; img-src 'self' data:",
  });
  next();
});
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), 'public')));

// ---- helpers -------------------------------------------------------------
const hits = new Map();
const rateLimit = (max, windowMs) => (req, res, next) => {
  const now = Date.now();
  const h = hits.get(req.ip);
  if (!h || h.reset < now) hits.set(req.ip, { n: 1, reset: now + windowMs });
  else if (++h.n > max) return res.sendStatus(429);
  next();
};
const admin = (req, res, next) => {
  const given = Buffer.from(req.get('authorization') || '');
  const want = Buffer.from(`Bearer ${config.adminToken || ''}`);
  if (config.adminToken && given.length === want.length && timingSafeEqual(given, want)) return next();
  res.sendStatus(401);
};
const validateSns = async (msg) => {
  const { default: MessageValidator } = await import('sns-validator');
  return new Promise((resolve, reject) => new MessageValidator().validate(msg, (e) => (e ? reject(e) : resolve())));
};

// ---- public API ----------------------------------------------------------
app.get('/healthz', (req, res) => res.json({ ok: true }));
app.get('/api/config', (req, res) => res.json({ demo: config.demo, langs: SUPPORTED, defaultLang: config.defaultLang }));
app.get('/api/stats', (req, res) => res.json(snapshot()));

app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const emit = (name, data) => res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
  emit('init', { events: config.demo ? [] : recent(60) });
  const onEvent = (e) => emit('msg', e);
  bus.on('event', onEvent);
  const keepAlive = setInterval(() => res.write(':ka\n\n'), 25000);
  req.on('close', () => { clearInterval(keepAlive); bus.off('event', onEvent); });
});

// Demo mode: simulated patients drive the real engine (no AWS call is made).
app.post('/api/demo/start', rateLimit(30, 60_000), (req, res) => {
  if (!config.demo) return res.sendStatus(403);
  const lang = SUPPORTED.includes(req.query.lang) ? req.query.lang : config.defaultLang;
  const sid = /^[a-z0-9]{4,32}$/.test(req.query.sid || '') ? req.query.sid : undefined;
  runDemo(lang, sid);
  res.sendStatus(202);
});

// ---- admin API (live mode) ----------------------------------------------
// Open a real conversation: sends the refill reminder on the patient's preferred channel.
app.post('/api/refill', admin, express.json({ limit: '32kb' }), async (req, res) => {
  const { name, phone, email, lang, preferred } = req.body || {};
  if (!name || !phone) return res.status(400).json({ error: 'name and phone are required' });
  try {
    const conv = createConversation({ name, phone, email, lang: SUPPORTED.includes(lang) ? lang : 'en', preferred });
    await begin(conv);
    res.status(202).json({ conversationId: conv.id });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'delivery failed' });
  }
});

// Simulate an inbound patient message (useful to test live mode without a handset).
app.post('/api/inbound', admin, express.json({ limit: '32kb' }), (req, res) => {
  onInbound(req.body || {}).catch(console.error);
  res.sendStatus(202);
});

// ---- AWS inbound webhook (SNS HTTPS subscription) -------------------------
app.post('/webhooks/sns', express.text({ type: '*/*', limit: '256kb' }), async (req, res) => {
  try {
    const msg = JSON.parse(req.body);
    await validateSns(msg); // verifies the SNS signature
    if (config.sns.topicArn && msg.TopicArn !== config.sns.topicArn) return res.sendStatus(403);
    if (msg.Type === 'SubscriptionConfirmation') {
      const u = new URL(msg.SubscribeURL);
      if (u.protocol === 'https:' && u.hostname.endsWith('.amazonaws.com')) await fetch(u);
      return res.sendStatus(200);
    }
    if (msg.Type === 'Notification') {
      const inbound = normalize(JSON.parse(msg.Message));
      if (inbound) onInbound(inbound).catch(console.error);
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('SNS webhook rejected:', err.message);
    res.sendStatus(400);
  }
});

app.listen(config.port, () => console.log(`Concierge listening on :${config.port} (${config.demo ? 'demo' : 'live'} mode)`));
