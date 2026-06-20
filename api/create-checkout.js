// api/create-checkout.js
//
// Crée dynamiquement une session Stripe Checkout pour La Maison Winnie,
// avec deux custom_fields :
// - prnomdulapin       : prénom du lapin (saisi librement)
// - preferencebox      : préférence de composition (liste déroulante)
//
// Le front-end (version-14-1.html) doit appeler cette fonction en POST
// avec { rabbitName, preference, promoCode } puis rediriger le
// navigateur vers l'URL renvoyée (session.url).
//
// Variable d'environnement nécessaire :
// - STRIPE_SECRET_KEY : clé secrète Stripe (sk_live_... ou clé restreinte
//   avec les droits d'écriture sur Checkout Sessions — attention, la clé
//   restreinte "Read only" utilisée pour le webhook NE SUFFIT PAS ici,
//   il faut une clé avec le droit de créer des sessions Checkout)
// - STRIPE_PRICE_ID   : l'ID du prix Stripe pour l'abonnement LMW

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PREFERENCE_OPTIONS = [
  { label: 'Équilibrée — 50% friandises / 50% jouets', value: 'equilibree' },
  { label: 'Gourmande — 75% friandises / 25% jouets', value: 'gourmande' },
  { label: 'Occupation — 75% jouets / 25% friandises', value: 'occupation' },
  { label: 'Mastication douce', value: 'mastication' },
];

export default async function handler(req, res) {
  // Autorise les appels depuis le site (nécessaire car cette fonction vit
  // sur un domaine Vercel différent de lamaisonwinnie.com).
  res.setHeader('Access-Control-Allow-Origin', 'https://lamaisonwinnie.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { rabbitName, preference, promoCode } = req.body || {};

    if (!rabbitName || !preference) {
      return res.status(400).json({ error: 'rabbitName et preference sont requis.' });
    }

    const sessionConfig = {
      mode: 'subscription',
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      custom_fields: [
        {
          key: 'prnomdulapin',
          label: { type: 'custom', custom: 'Prénom du Lapin' },
          type: 'text',
          text: { default_value: rabbitName },
        },
        {
          key: 'preferencebox',
          label: { type: 'custom', custom: 'Préférence de composition' },
          type: 'dropdown',
          dropdown: {
            options: PREFERENCE_OPTIONS,
            default_value: preference,
          },
        },
      ],
      success_url: 'https://lamaisonwinnie.com/merci.html',
      cancel_url: 'https://lamaisonwinnie.com/version-14-1.html',
    };

    if (promoCode) {
      // Si tu utilises des codes promo via Stripe Coupons/Promotion codes,
      // décommente et adapte cette ligne avec l'ID du Promotion Code Stripe
      // correspondant (pas juste le texte "LAPIN25").
      // sessionConfig.discounts = [{ promotion_code: 'promo_xxx' }];
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Erreur création session Checkout:', err);
    return res.status(500).json({ error: 'Erreur lors de la création du paiement.' });
  }
}
