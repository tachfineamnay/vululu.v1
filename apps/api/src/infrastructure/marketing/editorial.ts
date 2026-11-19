import {
  editorialRecipe,
  marketingOutput,
  platformSchema,
  type MarketingContext,
  type Recipe
} from '@vululu/contracts';
// Hints guide editorial choices; never present inferred occupation as a verified qualification.
export function classify(description: string) {
  const d = description.toLocaleLowerCase('fr');
  if (/thérap|therap|psycholog|psychoth|\bsoins?|santé/.test(d)) return 'therapeute';
  if (/formation|formateur|\bcours\b|pédagog/.test(d)) return 'formation';
  if (/artisan|poterie|cérami|menuis|ébénis|couture/.test(d)) return 'artisan';
  if (/consult|conseil|audit|stratég/.test(d)) return 'consultant';
  if (/boutique|commerce|magasin|épicerie/.test(d)) return 'boutique';
  return 'general';
}
export function sensitive(text: string) {
  return /th[ée]rap|psych|\bsoin|sant[ée]|m[ée]dic|dentist|pharm|juridi|avocat|financ|assurance|investiss|cr[ée]dit|nutrition|di[ée]t[ée]t/i.test(
    text
  );
}
const guides = {
  artisan: ['le geste', 'un détail de fabrication', 'une matière ou un outil utilisé'],
  consultant: ['le point de départ', 'la question à clarifier', 'une question de cadrage'],
  boutique: ['le choix', 'un détail à comparer', 'un critère de sélection'],
  therapeute: ['le premier contact', 'les modalités pratiques', 'une question sur le cadre des échanges'],
  formation: ['le sujet à explorer', 'une consigne à expliquer', 'un exemple d’exercice'],
  general: ['le besoin', 'une étape à expliquer', 'une question fréquente']
} as const;
export function fallback(c: MarketingContext): Recipe {
  return {
    days: [
      { angle: 'decouverte', platform: c.platform },
      { angle: 'methode', platform: c.platform === 'LinkedIn' ? 'Instagram' : 'LinkedIn' },
      { angle: c.goalHint === 'explication' ? 'question' : 'invitation', platform: c.platform }
    ]
  };
}
export function compile(c: MarketingContext, raw: unknown) {
  const recipe = editorialRecipe.parse(raw);
  const [focus, detail, example] = guides[c.sectorHint],
    offer = `« ${c.offer} »`,
    brand = `« ${c.brand} »`;
  const occupied = new Set(c.plan.map((i) => i.date));
  const dates = [0, 2, 4, 1, 3, 5, 6]
    .map((i) => new Date(Date.parse(c.week) + i * 86400000).toISOString().slice(0, 10))
    .filter((d) => !occupied.has(d))
    .slice(0, 3)
    .sort();
  const lens = {
    artisan: 'Un objet fini, puis le geste qui lui donne forme.',
    consultant: 'Un problème à cadrer avant de chercher une solution.',
    boutique: 'Deux critères à examiner avant de faire son choix.',
    therapeute: 'Une question pratique avant une première prise de contact.',
    formation: 'Une notion à découvrir, puis une question pour la mettre en pratique.',
    general: 'Une question concrète pour découvrir l’offre.'
  }[c.sectorHint];
  const audience = {
    equipes: 'Proposer une question que l’on peut discuter en équipe.',
    debutants: 'Expliquer un seul terme, sans jargon.',
    familles: 'Partir d’une question pratique du quotidien.',
    non_precise: 'Éviter de supposer qui est le lecteur.'
  }[c.audienceHint];
  const angles = {
    decouverte: {
      idea: `Présenter ${offer}. ${lens} ${audience}`,
      hook: `${offer} : par où commencer ?`,
      body: `Découvrons ${offer} avec ${brand}. Quel aspect souhaitez-vous comprendre ?`,
      cta:
        c.toneHint === 'formel'
          ? 'Demandez une présentation.'
          : c.toneHint === 'chaleureux'
            ? 'Parlons-en ensemble.'
            : 'Posez votre question.',
      shot: `Préparer une vue qui illustre ${focus}.`
    },
    methode: {
      idea: `Expliquer ${detail} pour rendre ${offer} concret.`,
      hook: `${offer} : regardons ${detail}.`,
      body: `Pour mieux comprendre ${offer}, intéressons-nous à ${detail}. Que voudriez-vous examiner de plus près ?`,
      cta: 'Demandez des précisions.',
      shot: `Choisir ${example} que la marque peut réellement montrer.`
    },
    question: {
      idea: `Recueillir une question sur ${offer}.`,
      hook: `Que souhaitez-vous savoir sur ${offer} ?`,
      body: `À propos de ${offer}, quel point mérite une explication : ${focus} ou ${detail} ?`,
      cta: 'Indiquez le sujet à aborder.',
      shot: `Filmer une carte-question sur ${focus}.`
    },
    invitation: {
      idea: `Inviter à un échange pratique sur ${offer}.`,
      hook: `${offer} vous intéresse ?`,
      body: `Vous souhaitez des renseignements sur ${offer} ? Adressez votre question à ${brand}.`,
      cta: 'Contactez la marque pour les modalités.',
      shot: `Préparer un écran de fin au nom de ${brand}.`
    }
  };
  return marketingOutput.parse({
    schemaVersion: 1,
    facts: [
      { source: 'BrandContext', id: c.contextId, value: c.brand },
      { source: 'ConfirmedOffer', id: c.offerId, value: c.offer },
      ...c.plan.map((x) => ({
        source: 'ContentItem',
        id: x.id,
        value: `Date planifiée (UTC) : ${x.date} · v${x.version}`
      }))
    ],
    unknowns: [
      'Prix et remises',
      'Stock et disponibilité',
      'Qualifications et certifications',
      'Témoignages, résultats et garanties',
      ...(!c.audienceDeclared ? ['Audience non renseignée'] : []),
      ...(!c.toneDeclared ? ['Ton non renseigné'] : [])
    ],
    review: c.regulated
      ? [
          'Relecture professionnelle requise : vérifier les règles locales de publicité applicables.',
          'Ne pas solliciter de données personnelles, de témoignages ni promettre un résultat.'
        ]
      : ['Vérifier le texte, les droits des visuels et les modalités avant toute utilisation.'],
    suggestions: recipe.days.map(({ angle, platform, hookStyle, ctaStyle, opening }, i) => {
      const a = angles[angle],
        hook =
          hookStyle === 'focus'
            ? `Zoom sur ${offer} : ${detail}.`
            : hookStyle === 'invitation'
              ? `Découvrons ${offer} avec ${brand}.`
              : hookStyle === 'question'
                ? `Une question sur ${offer} : par où commencer ?`
                : a.hook;
      const cta = c.regulated
        ? 'Demandez les informations pratiques en privé.'
        : ctaStyle === 'details'
          ? 'Demandez des précisions sur cette offre.'
          : ctaStyle === 'contact'
            ? 'Prenez contact pour les modalités.'
            : ctaStyle === 'question'
              ? 'Quelle question souhaitez-vous aborder ?'
              : a.cta;
      const variants = platformSchema.options.map((p) => ({
        platform: p,
        caption:
          p === 'LinkedIn'
            ? `${a.body} Point de discussion : ${detail}.`
            : p === 'Instagram'
              ? `${hook}\n${a.body}`
              : `${hook}\nEn bref : ${offer}, avec ${brand}.`,
        cta
      }));
      return {
        day: dates[i] ?? null,
        angle,
        platform,
        idea: a.idea,
        hook,
        caption: variants.find((x) => x.platform === platform)!.caption,
        cta,
        variants,
        storyboard: [
          {
            shot:
              opening === 'gros_plan'
                ? `Ouvrir sur un détail illustrant ${focus}, avec un visuel autorisé.`
                : opening === 'carte_question'
                  ? 'Afficher la question sur une carte lisible.'
                  : 'Ouvrir sur un titre lisible.',
            onScreen: hook
          },
          { shot: a.shot, onScreen: offer },
          { shot: 'Terminer sur une invitation sans promesse.', onScreen: cta }
        ]
      };
    })
  });
}
