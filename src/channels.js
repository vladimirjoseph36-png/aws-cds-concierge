import { config } from './config.js';

const clients = {};
const FACTORY = {
  sms: async () => { const m = await import('@aws-sdk/client-pinpoint-sms-voice-v2'); return { m, c: new m.PinpointSMSVoiceV2Client({ region: config.region }) }; },
  wa: async () => { const m = await import('@aws-sdk/client-socialmessaging'); return { m, c: new m.SocialMessagingClient({ region: config.region }) }; },
  mail: async () => { const m = await import('@aws-sdk/client-sesv2'); return { m, c: new m.SESv2Client({ region: config.region }) }; },
};
const client = async (name) => (clients[name] ??= await FACTORY[name]());

/** Plain-text rendering of a card, for channels without rich content (SMS, email). */
export function flatten(text, card) {
  if (!card) return text;
  const opts = card.suggestions.map((s, i) => `${i + 1}. ${s.text}`).join('\n');
  return `${card.title}\n${card.description}\n${opts}`;
}

export function rcsContent(text, card) {
  if (!card) return { Content: { TextMessage: { Body: text } } };
  return {
    Content: {
      RichCard: {
        StandaloneCard: {
          CardOrientation: 'VERTICAL',
          CardContent: {
            Title: card.title,
            Description: card.description,
            Suggestions: card.suggestions.slice(0, 4).map((s) => ({ Reply: { Text: s.text, PostbackData: s.data } })),
          },
        },
      },
    },
  };
}

export function whatsappPayload(to, text, card) {
  const base = { messaging_product: 'whatsapp', to: to.replace(/^\+/, '') };
  if (!card) return { ...base, type: 'text', text: { body: text } };
  return {
    ...base,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: `${card.title}\n${card.description}` },
      action: { buttons: card.suggestions.slice(0, 3).map((s) => ({ type: 'reply', reply: { id: s.data, title: s.text.slice(0, 20) } })) },
    },
  };
}

/**
 * Deliver one outbound message. In demo mode nothing leaves the process.
 * step: { channel, to, text, card?, subject? }
 */
export async function send({ channel, to, text, card, subject }) {
  if (config.demo) return { demo: true };
  if (channel === 'sms') {
    const { m, c } = await client('sms');
    return c.send(new m.SendTextMessageCommand({
      DestinationPhoneNumber: to,
      OriginationIdentity: config.sms.originationId,
      MessageBody: flatten(text, card),
      MessageType: 'TRANSACTIONAL',
      ConfigurationSetName: config.sms.configSet || undefined,
    }));
  }
  if (channel === 'rcs') {
    const { m, c } = await client('sms');
    return c.send(new m.SendRcsMessageCommand({
      DestinationPhoneNumber: to,
      OriginationIdentity: config.rcs.agentId,
      RcsMessageContent: JSON.stringify(rcsContent(text, card)),
      TimeToLive: config.rcs.ttl,
      ConfigurationSetName: config.sms.configSet || undefined,
      // If the handset cannot receive RCS, fall back to SMS with a flattened body.
      FallbackConfiguration: { Channel: 'SMS', MessageBody: flatten(text, card), OriginationIdentity: config.sms.originationId },
    }));
  }
  if (channel === 'wa') {
    const { m, c } = await client('wa');
    return c.send(new m.SendWhatsAppMessageCommand({
      originationPhoneNumberId: config.wa.phoneNumberId,
      metaApiVersion: config.wa.metaApiVersion,
      message: Buffer.from(JSON.stringify(whatsappPayload(to, text, card))),
    }));
  }
  
  if (channel === 'mail' || channel === 'email') {
    const { m, c } = await client('mail');
    try {
      return await c.send(new m.SendEmailCommand({
        FromEmailAddress: config.ses.from,
        FromEmailAddressIdentityArn: 'arn:aws:ses:us-east-1:293951765173:identity/vladimirjoseph36@gmail.com',
        Destination: { ToAddresses: [to] },
        Content: { Simple: { Subject: { Data: subject || 'Message', Charset: 'UTF-8' }, Body: { Text: { Data: text, Charset: 'UTF-8' } } } },
      }));
    } catch (err) {
      console.error("=== ERREUR AWS DÉTAILLÉE ===");
      console.error(err);
      throw err;
    }
  }
  throw new Error(`Unknown channel: ${channel}`);
}