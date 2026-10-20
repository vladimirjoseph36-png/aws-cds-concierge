import { begin, createConversation, onInbound } from './engine.js';
import { tr } from './i18n.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let runs = 0; // gives every demo run its own fictional phone numbers so concurrent runs never collide

/** Two simulated patients drive the real engine: SMS -> RCS card -> email, and a WhatsApp question. */
export function runDemo(lang, sid) {
  const n = String(runs++ % 5000).padStart(4, '0');
  const a = createConversation({ name: 'Amélie Laurent', phone: `+1555010${n}1`, email: 'amelie@example.com', lang, sid });
  const b = createConversation({ name: 'Karim Benali', phone: `+1555010${n}2`, email: 'karim@example.com', lang, preferred: 'wa', sid });
  const log = (e) => console.error('demo error:', e.message);

  (async () => {
    await begin(a);
    await wait(2500);
    await onInbound({ from: a.patient.phone, channel: 'sms', text: tr(lang, 'simYes') });
    await wait(2800);
    await onInbound({ from: a.patient.phone, channel: 'rcs', postback: 'slot:tomorrow-9', text: tr(lang, 'slotTomorrow') });
  })().catch(log);

  (async () => {
    await wait(1200);
    await onInbound({ from: b.patient.phone, channel: 'wa', text: tr(lang, 'simQuestion') });
  })().catch(log);
}
