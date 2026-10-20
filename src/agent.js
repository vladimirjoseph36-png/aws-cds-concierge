import { createHash } from 'node:crypto';
import { config } from './config.js';
import { tr } from './i18n.js';

const AFFIRM = new Set(['yes', 'y', 'ok', 'okay', 'yep', 'oui', 'si', 'sim', 'claro']);
const isYes = (t) => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z]+/).some((w) => AFFIRM.has(w));
const firstName = (conv) => conv.patient.name.split(' ')[0];

/** Outbound entry point: the refill reminder that opens a conversation. */
export function startRefill(conv) {
  conv.state = 'refill_asked';
  const channel = conv.patient.preferred || 'sms';
  return [{
    channel,
    text: tr(conv.lang, 'reminder', { name: firstName(conv) }),
    trace: { tool: 'detect_refill_due', detail: `Prescription ends in 3 days, patient eligible for renewal. Preferred channel: ${channel}.` },
  }];
}

/**
 * Decide the next steps for an inbound message.
 * Uses the Bedrock AgentCore runtime when AGENTCORE_RUNTIME_ARN is set (live mode);
 * otherwise, or on failure, falls back to the deterministic rules below.
 */
export async function decide(conv, input) {
  if (config.agent.arn && !config.demo) {
    try { return await viaAgentCore(conv, input); } catch (err) { console.error('AgentCore failed, using local rules:', err.message); }
  }
  return local(conv, input);
}

let acClient;
async function viaAgentCore(conv, input) {
  const { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } = await import('@aws-sdk/client-bedrock-agentcore');
  acClient ??= new BedrockAgentCoreClient({ region: config.region });
  const res = await acClient.send(new InvokeAgentRuntimeCommand({
    agentRuntimeArn: config.agent.arn,
    qualifier: config.agent.qualifier,
    runtimeSessionId: createHash('sha256').update(conv.id).digest('hex'), // >= 33 chars, stable per patient
    contentType: 'application/json',
    payload: JSON.stringify({ language: conv.lang, state: conv.state, patient: { id: conv.id, name: conv.patient.name }, input }),
  }));
  const out = JSON.parse(await res.response.transformToString());
  if (!Array.isArray(out.steps)) throw new Error('Agent response must contain a "steps" array');
  if (out.state) conv.state = out.state;
  return out.steps;
}

/** Tool stub: replace with Amazon Location Service or your pharmacy database. */
function findPharmacy() {
  return { name: 'Pharmacie du Port', distanceKm: 1.2, slots: ['tomorrow-9'] };
}

function local(conv, { text = '', postback, channel }) {
  const lang = conv.lang;
  if (conv.state === 'refill_asked' && isYes(text)) {
    conv.state = 'slot_offered';
    const p = findPharmacy();
    const card = {
      title: tr(lang, 'pharmacyTitle'),
      description: tr(lang, 'pharmacyDesc'),
      suggestions: [
        { text: tr(lang, 'slotTomorrow'), data: `slot:${p.slots[0]}` },
        { text: tr(lang, 'slotOther'), data: 'slot:other' },
      ],
    };
    return [{
      channel: 'rcs', card, text: `${card.title}\n${card.description}`,
      trace: { tool: 'find_pharmacy', detail: `${p.name} found at ${p.distanceKm} km, stock verified. Switching to RCS to show a rich card with buttons.` },
    }];
  }
  if (conv.state === 'slot_offered' && postback?.startsWith('slot:')) {
    if (postback === 'slot:other') {
      return [{ channel: channel || 'rcs', text: tr(lang, 'callYou'), trace: { tool: 'escalate_to_pharmacy', detail: 'Patient needs another time slot; pharmacy will call back.' } }];
    }
    conv.state = 'done';
    return [{
      channel: 'mail', subject: tr(lang, 'emailSubject'), text: tr(lang, 'emailBody', { name: firstName(conv) }),
      actions: ['booked', 'completed'],
      trace: { tool: 'book_slot_and_send_email', detail: 'Pickup booked. Long-form content, so email is the best channel. Conversation closed.' },
    }];
  }
  return [{
    channel: channel || 'sms', text: tr(lang, 'faq'),
    trace: { tool: 'answer_from_leaflet', detail: 'Answer drawn from the validated leaflet (demo stub). Out-of-scope medical questions must be escalated to a pharmacist.' },
  }];
}
