import { randomUUID } from 'node:crypto';
import { send } from './channels.js';
import { record } from './bus.js';
import { decide, startRefill } from './agent.js';
import { detectLanguage } from './i18n.js';

const convs = new Map();
const key = (v) => String(v || '').toLowerCase();

export function createConversation({ name, phone, email, lang = 'en', preferred = 'sms', sid }) {
  const conv = { id: randomUUID(), sid, lang, state: 'idle', patient: { name, phone, email, preferred } };
  convs.set(conv.id, conv);
  if (convs.size > 500) convs.delete(convs.keys().next().value);
  return conv;
}

// Most recent conversation wins when a contact appears more than once.
export function findByContact(from) {
  let found;
  for (const c of convs.values()) if (key(c.patient.phone) === key(from) || key(c.patient.email) === key(from)) found = c;
  return found;
}

async function deliver(conv, step) {
  const to = step.channel === 'mail' ? conv.patient.email : conv.patient.phone;
  await send({ ...step, to });
  record({
    conversationId: conv.id, sid: conv.sid, patient: conv.patient.name, lang: conv.lang,
    direction: 'out', channel: step.channel, text: step.text, trace: step.trace, actions: step.actions,
  });
}

/** Start a conversation by sending the first outbound message. */
export async function begin(conv) {
  for (const step of startRefill(conv)) await deliver(conv, step);
}

/** Handle a patient reply (text or button postback) coming from any channel. */
export async function onInbound({ from, channel, text = '', postback }) {
  const conv = findByContact(from);
  if (!conv) return console.warn('Inbound message from an unknown contact ignored');
  if (!postback) conv.lang = await detectLanguage(text, conv.lang);
  record({ conversationId: conv.id, sid: conv.sid, patient: conv.patient.name, lang: conv.lang, direction: 'in', channel, text: text || postback });
  for (const step of await decide(conv, { text, postback, channel })) await deliver(conv, step);
}
