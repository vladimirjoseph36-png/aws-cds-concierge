import { config } from './config.js';

export const SUPPORTED = ['en', 'fr', 'es', 'pt'];

// Patient-facing messages. English is the source language and the fallback.
const T = {
  en: {
    reminder: 'Hi {name}, your treatment ends in 3 days. Do you want to renew it? Reply YES.',
    pharmacyTitle: 'Pharmacie du Port - 1.2 km',
    pharmacyDesc: 'Your refill is ready for pickup tomorrow from 9:00. Pick a time:',
    slotTomorrow: 'Tomorrow 9:00',
    slotOther: 'Other time',
    callYou: 'No problem, the pharmacy will call you to find a better time.',
    emailSubject: 'Your pickup is confirmed',
    emailBody: 'Hi {name}, your prescription pickup is confirmed for tomorrow at 9:00 at Pharmacie du Port. Please keep following your prescription instructions.',
    faq: 'Please follow the leaflet in your box: this treatment can be taken with or after a meal. Would you like a daily reminder?',
    simYes: 'YES',
    simQuestion: 'Can I take my pill after a meal?',
  },
  fr: {
    reminder: 'Bonjour {name}, votre traitement se termine dans 3 jours. Voulez-vous le renouveler ? Répondez OUI.',
    pharmacyTitle: 'Pharmacie du Port - 1,2 km',
    pharmacyDesc: 'Votre renouvellement sera prêt demain dès 9 h. Choisissez un horaire :',
    slotTomorrow: 'Demain 9 h',
    slotOther: 'Autre horaire',
    callYou: 'Pas de souci, la pharmacie vous appellera pour trouver un meilleur horaire.',
    emailSubject: 'Votre retrait est confirmé',
    emailBody: 'Bonjour {name}, votre retrait d’ordonnance est confirmé demain à 9 h à la Pharmacie du Port. Continuez à suivre les indications de votre ordonnance.',
    faq: 'Merci de suivre la notice de votre boîte : ce traitement peut être pris pendant ou après un repas. Souhaitez-vous un rappel quotidien ?',
    simYes: 'OUI',
    simQuestion: 'Puis-je prendre mon comprimé après le repas ?',
  },
  es: {
    reminder: 'Hola {name}, su tratamiento termina en 3 días. ¿Desea renovarlo? Responda SÍ.',
    pharmacyTitle: 'Pharmacie du Port - 1,2 km',
    pharmacyDesc: 'Su renovación estará lista mañana desde las 9:00. Elija un horario:',
    slotTomorrow: 'Mañana 9:00',
    slotOther: 'Otro horario',
    callYou: 'Sin problema, la farmacia le llamará para encontrar un mejor horario.',
    emailSubject: 'Su recogida está confirmada',
    emailBody: 'Hola {name}, la recogida de su receta está confirmada para mañana a las 9:00 en Pharmacie du Port. Siga las indicaciones de su receta.',
    faq: 'Siga el prospecto de su caja: este tratamiento puede tomarse con o después de una comida. ¿Desea un recordatorio diario?',
    simYes: 'SÍ',
    simQuestion: '¿Puedo tomar mi pastilla después de la comida?',
  },
  pt: {
    reminder: 'Olá {name}, seu tratamento termina em 3 dias. Deseja renová-lo? Responda SIM.',
    pharmacyTitle: 'Pharmacie du Port - 1,2 km',
    pharmacyDesc: 'Sua renovação estará pronta amanhã a partir das 9:00. Escolha um horário:',
    slotTomorrow: 'Amanhã 9:00',
    slotOther: 'Outro horário',
    callYou: 'Sem problema, a farmácia vai ligar para encontrar um horário melhor.',
    emailSubject: 'Sua retirada está confirmada',
    emailBody: 'Olá {name}, a retirada da sua receita está confirmada para amanhã às 9:00 na Pharmacie du Port. Continue seguindo as instruções da sua receita.',
    faq: 'Siga a bula da sua caixa: este tratamento pode ser tomado durante ou após uma refeição. Deseja um lembrete diário?',
    simYes: 'SIM',
    simQuestion: 'Posso tomar meu comprimido depois da refeição?',
  },
};

export function tr(lang, key, vars = {}) {
  const s = (T[lang] && T[lang][key]) || T.en[key] || key;
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

const STOP = {
  fr: ['oui', 'bonjour', 'merci', 'je', 'le', 'les', 'est', 'pour', 'pas', 'une', 'des', 'mon', 'puis', 'apres', 'repas', 'comprime'],
  es: ['si', 'hola', 'gracias', 'el', 'los', 'una', 'mi', 'puedo', 'despues', 'comida', 'pastilla'],
  pt: ['sim', 'ola', 'obrigado', 'obrigada', 'eu', 'os', 'uma', 'meu', 'posso', 'depois', 'refeicao', 'comprimido'],
  en: ['yes', 'hello', 'thanks', 'the', 'and', 'can', 'my', 'after', 'meal', 'pill', 'you', 'take'],
};
const words = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z]+/).filter(Boolean);

/** Offline language guess, used in demo mode and as a fallback for very short texts. */
export function heuristic(text, fallback = 'en') {
  const w = words(text);
  let best = fallback;
  let top = 0;
  for (const [lang, list] of Object.entries(STOP)) {
    const score = w.filter((x) => list.includes(x)).length;
    if (score > top) { top = score; best = lang; }
  }
  return best;
}

let comprehend;
/** Detect the patient's language: Amazon Comprehend in live mode, heuristic otherwise. */
export async function detectLanguage(text, fallback = 'en') {
  if (!config.demo && text.length >= 12) {
    try {
      const { ComprehendClient, DetectDominantLanguageCommand } = await import('@aws-sdk/client-comprehend');
      comprehend ??= new ComprehendClient({ region: config.region });
      const r = await comprehend.send(new DetectDominantLanguageCommand({ Text: text }));
      const top = r.Languages?.[0];
      if (top && top.Score > 0.8 && SUPPORTED.includes(top.LanguageCode)) return top.LanguageCode;
    } catch (err) {
      console.warn('Comprehend unavailable, using heuristic:', err.message);
    }
  }
  return heuristic(text, fallback);
}
