import test from 'node:test';
import assert from 'node:assert/strict';
import { heuristic, tr } from '../src/i18n.js';
import { createConversation, onInbound, begin } from '../src/engine.js';
import { bus, recent } from '../src/bus.js';
import { rcsContent, whatsappPayload } from '../src/channels.js';
import { normalize } from '../src/inbound.js';

test('language heuristic detects supported languages', () => {
  assert.equal(heuristic('Can I take my pill after a meal?'), 'en');
  assert.equal(heuristic('Puis-je prendre mon comprimé après le repas ?'), 'fr');
  assert.equal(heuristic('¿Puedo tomar mi pastilla después de la comida?'), 'es');
  assert.equal(heuristic('Posso tomar meu comprimido depois da refeição?'), 'pt');
});

test('templates fall back to English and fill variables', () => {
  assert.match(tr('fr', 'reminder', { name: 'Amélie' }), /Amélie/);
  assert.equal(tr('xx', 'slotOther'), 'Other time');
});

test('refill flow: SMS reminder -> RCS card -> email confirmation, in the patient language', async () => {
  const conv = createConversation({ name: 'Test Patient', phone: '+15550000001', email: 't@example.com', lang: 'fr' });
  await begin(conv);
  await onInbound({ from: conv.patient.phone, channel: 'sms', text: 'OUI' });
  await onInbound({ from: conv.patient.phone, channel: 'rcs', postback: 'slot:tomorrow-9', text: 'Demain 9 h' });
  const mine = recent(50).filter((e) => e.conversationId === conv.id);
  assert.deepEqual(mine.map((e) => `${e.direction}:${e.channel}`), ['out:sms', 'in:sms', 'out:rcs', 'in:rcs', 'out:mail']);
  assert.match(mine[0].text, /Bonjour/);
  assert.deepEqual(mine[4].actions, ['booked', 'completed']);
});

test('RCS and WhatsApp payloads follow the documented shapes', () => {
  const card = { title: 'T', description: 'D', suggestions: [{ text: 'Yes', data: 'slot:a' }] };
  const rcs = rcsContent('x', card).Content.RichCard.StandaloneCard;
  assert.equal(rcs.CardOrientation, 'VERTICAL');
  assert.equal(rcs.CardContent.Suggestions[0].Reply.PostbackData, 'slot:a');
  const wa = whatsappPayload('+15550000001', 'x', card);
  assert.equal(wa.to, '15550000001');
  assert.equal(wa.interactive.action.buttons[0].reply.id, 'slot:a');
});

test('inbound normalization handles SMS and WhatsApp events', () => {
  assert.deepEqual(normalize({ originationNumber: '+1555', messageBody: 'YES' }), { from: '+1555', channel: 'sms', text: 'YES' });
  const entry = { changes: [{ value: { messages: [{ from: '1555', text: { body: 'hola' } }] } }] };
  assert.equal(normalize({ whatsAppWebhookEntry: JSON.stringify(entry) }).from, '+1555');
  assert.equal(normalize({ foo: 1 }), null);
});

test('two demo runs never mix their conversations', async () => {
  const { runDemo } = await import('../src/demo.js');
  const seen = [];
  const on = (e) => seen.push(e);
  bus.on('event', on);
  runDemo('en', 'runa');
  runDemo('fr', 'runb');
  await new Promise((r) => setTimeout(r, 1800));
  bus.off('event', on);
  const convsBySid = (sid) => new Set(seen.filter((e) => e.sid === sid).map((e) => e.conversationId));
  const a = convsBySid('runa'), b = convsBySid('runb');
  assert.equal(a.size, 2);
  assert.equal(b.size, 2);
  assert.ok([...a].every((id) => !b.has(id)));
});
