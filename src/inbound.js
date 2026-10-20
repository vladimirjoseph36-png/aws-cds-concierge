/**
 * Turn an SNS notification payload into { from, channel, text, postback }.
 * Best-effort mapping of AWS End User Messaging events; verify against a real test
 * message in your account and adjust here if your event shape differs.
 */
export function normalize(p) {
  if (p.originationNumber && p.postbackData) {
    return { from: p.originationNumber, channel: 'rcs', postback: p.postbackData, text: p.postbackData };
  }
  if (p.originationNumber && p.messageBody !== undefined) {
    return { from: p.originationNumber, channel: String(p.channel || '').toLowerCase() === 'rcs' ? 'rcs' : 'sms', text: p.messageBody };
  }
  const raw = p.whatsAppWebhookEntry || p.webhookEntry;
  if (raw) {
    const entry = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const m = entry?.changes?.[0]?.value?.messages?.[0];
    if (m) {
      const btn = m.interactive?.button_reply;
      return { from: `+${m.from}`, channel: 'wa', text: m.text?.body || btn?.title || '', postback: btn?.id };
    }
  }
  return null;
}
