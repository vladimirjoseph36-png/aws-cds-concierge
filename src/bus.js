import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

export const bus = new EventEmitter();
bus.setMaxListeners(200);

const HOUR = 3600e3;
const CHANNELS = ['sms', 'rcs', 'wa', 'mail'];
const history = [];
const stats = {
  byChannel: { sms: 0, rcs: 0, wa: 0, mail: 0 },
  series: Object.fromEntries(CHANNELS.map((c) => [c, new Map()])),
  funnel: { sent: 0, replied: 0, booked: 0, completed: 0 },
};

/** Store an event, update counters and broadcast it to every SSE client. */
export function record(ev) {
  const e = { id: randomUUID(), ts: Date.now(), ...ev };
  history.push(e);
  if (history.length > 200) history.shift();
  stats.byChannel[e.channel]++;
  const h = Math.floor(e.ts / HOUR);
  const m = stats.series[e.channel];
  m.set(h, (m.get(h) || 0) + 1);
  if (e.direction === 'out') stats.funnel.sent++;
  else stats.funnel.replied++;
  const a = e.actions || [];
  if (a.includes('booked')) stats.funnel.booked++;
  if (a.includes('completed')) stats.funnel.completed++;
  bus.emit('event', e);
  return e;
}

export const recent = (n = 60) => history.slice(-n);

/** Counters shown by the dashboard charts (24 hourly buckets per channel). */
export function snapshot() {
  const now = Math.floor(Date.now() / HOUR);
  const series = {};
  for (const c of CHANNELS) series[c] = Array.from({ length: 24 }, (_, i) => stats.series[c].get(now - 23 + i) || 0);
  const total = Object.values(stats.byChannel).reduce((a, b) => a + b, 0);
  return { byChannel: stats.byChannel, series, funnel: stats.funnel, total };
}

/** Demo mode only: pre-fill the counters so the charts look populated on first load. */
export function seedDemoStats() {
  const now = Math.floor(Date.now() / HOUR);
  const weight = { sms: 1, rcs: 0.8, wa: 0.7, mail: 0.45 };
  for (const c of CHANNELS) {
    let sum = 0;
    for (let i = 0; i < 24; i++) {
      const b = now - 23 + i;
      const hod = b % 24;
      const v = Math.round((14 + 62 * Math.max(0, Math.sin(((hod - 4) / 19) * Math.PI))) * weight[c] * 3 + ((b * 7 + CHANNELS.indexOf(c) * 13) % 17));
      stats.series[c].set(b, v);
      sum += v;
    }
    stats.byChannel[c] = sum * 5;
  }
  Object.assign(stats.funnel, { sent: 7000, replied: 5880, booked: 5110, completed: 4760 });
}
